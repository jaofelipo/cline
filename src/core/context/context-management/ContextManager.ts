import { formatResponse } from "@core/prompts/responses"
import { ensureTaskDirectoryExists, GlobalFileNames } from "@core/storage/disk"
import { loadFileAt } from "@utils/fs"
import * as path from "path"
import fs from "fs/promises"
import cloneDeep from "clone-deep"
import { ClineApiReqInfo, ClineMessage } from "@shared/ExtensionMessage"
import { Anthropic } from "@anthropic-ai/sdk"

interface ContextHistoryEntry {
  	editType: number
  	blockMap: Map<number, ContextUpdate[]>
}

enum EditType {
	UNDEFINED = 0,
	//NO_FILE_READ = 1,
	READ_FILE_TOOL = 2,
	ALTER_FILE_TOOL = 3,
	FILE_MENTION = 4,
}

interface FileReadInfo {
	filePath:string
    messageIndex: number
    editType: EditType
    originalRefContent?: string // the original part of text thar will be replaced if the case
    replaceText: string // what we will replace the string with
	allFiles?:string[]
	charsSaved:number
}


// Type for a single context update
type ContextUpdate = {
  timestamp: number
  //updateType: string
  content: string
  filesUpdated?: string[] // previously overwritten file reads in this text
  allFiles?: string[]
}

// Type for the serialized format of our nested maps
type SerializedContextHistory = Array<
	[
		number, // messageIndex
		[
			number, // EditType (message type)
			Array<
				[
					number, // blockIndex
					//[timestamp, updateType, content[],	[filesUpdated[], mentionedFiles[]]]
					[number		, string	, string[],		string[][]][], // updates array (now with 4 elements including metadata)
				]
			>,
		],
	]
>

// block index for file reads from read_file, write_to_file, replace_in_file tools is 1
const DEFAULT_INDEX = 1

export class ContextManager 
{
	// mapping from the apiMessages outer index to the inner message index to a list of actual changes, ordered by timestamp
	// timestamp is required in order to support full checkpointing, where the changes we apply need to be able to be undone when
	// moving to an earlier conversation history checkpoint - this ordering intuitively allows for binary search on truncation
	// there is also a number stored for each (EditType) which defines which message type it is, for custom handling

	// format:  { outerIndex => { editType: EditType, innerMap: { innerIndex => [[timestamp, updateType, update], ...] } } }
	// example: { 1 => { editType: EditType.UNDEFINED, innerMap: { 0 => [[<timestamp>, "text", "[NOTE] Some previous conversation history with the user has been removed ..."], ...] } } }
	// the above example would be how we update the first assistant message to indicate we truncated text
	private contextHistoryUpdates: ContextHistoryMap

	private baseDir:string
	private taskId:string
	deletedRange?: [number, number]

	constructor(baseDir:string, taskID:string, conversationDeleteRange?:[number, number])
	{
		this.baseDir = baseDir
		this.taskId = taskID
		this.contextHistoryUpdates = new ContextHistoryMap()
		this.deletedRange = conversationDeleteRange
	}

	/**
	 * public function for loading contextHistoryUpdates from disk, if it exists
	 */
	async initializeContextHistory() 
	{
		this.contextHistoryUpdates = await this.getSavedContextHistory()
	}

	/**
	 * get the stored context history updates from disk
	 */
	private async getSavedContextHistory(): Promise<ContextHistoryMap>
	{
		const taskDirectory = await ensureTaskDirectoryExists(this.baseDir, this.taskId)
		try {
			const data = await loadFileAt(taskDirectory, GlobalFileNames.contextHistory)
			const parsedData = JSON.parse(data ?? "") as SerializedContextHistory
			return new ContextHistoryMap(parsedData.map(([messageIndex, [editType, innerMapArray]]) => {
				const blockMap = new Map(
					innerMapArray.map(([blockIndex, updatesArray]) => [
						blockIndex,
						updatesArray.map(update => ({
							timestamp: update[0],
							//updateType: update[1],
							content: update[2]?.at(0) ?? '',
							filesUpdated: update[3][0],
							allFiles: update[3][1]
						})),
					])
				)
				return [messageIndex, {editType, blockMap} as ContextHistoryEntry]
			}))
		}
		catch (error) {}

		return new ContextHistoryMap()
	}

	/**
	 * save the context history updates to disk
	 */
	private async saveContextHistory()
	{
		const taskDirectory = await ensureTaskDirectoryExists(this.baseDir, this.taskId)
		try 
		{
			const serializedUpdates: SerializedContextHistory = Array.from(this.contextHistoryUpdates.entries()).map(
				([messageIndex, { editType, blockMap }]) => [
					messageIndex,
					[
						editType,
						Array.from(blockMap.entries()).map(([blockIndex, updatesArray]) => [
							blockIndex,
							updatesArray.map(update => [
								update.timestamp,
								"text",//update.updateType,
								[update.content],
								[update.filesUpdated ?? [], update.allFiles ?? []]
							]),
						]),
					],
				]
			)

			await fs.writeFile(path.join(taskDirectory, GlobalFileNames.contextHistory), JSON.stringify(serializedUpdates), "utf8")
		} 
		catch (error) {}
	}

	/**
	 * primary entry point for getting up to date context & truncating when required
	 */
	async getNewDeletedRange(apiMessages: Anthropic.Messages.MessageParam[], maxAllowedSize: number, previousRequest?: ClineMessage) 
	{
		let updatedDeletedRange = false

		if (previousRequest && previousRequest.text) // If total token usage is close to the context window, truncate to free up space for the new request
		{
			const timestamp = previousRequest.ts
			const { tokensIn, tokensOut, cacheWrites, cacheReads }: ClineApiReqInfo = JSON.parse(previousRequest.text)
			const totalTokens = (tokensIn ?? 0) + (tokensOut ?? 0) + (cacheWrites ?? 0) + (cacheReads ?? 0)

			
			if (totalTokens >= maxAllowedSize) // Most reliable way to know when we're close to hitting the context window.
			{
				//const deletedRange = this.deletedRange ? {start: 2, end: this.deletedRange[1]} : {start: 2, end:undefined}// count for first user-assistant message pair
				const totalCharacters = this.countCharsExcludingRange(apiMessages, this.deletedRange ? this.deletedRange[1] + 1 : 2)

				// we later check how many chars we trim to determine if we should still truncate history
				const charactersSaved = this.findAndRegisterDuplicateFileContents(apiMessages, timestamp)

				let anyContextUpdates = charactersSaved > 0
				let needToTruncate = true
				if (anyContextUpdates) 
				{					
					const percentCharactersSaved = (totalCharacters === 0) ? 0 : charactersSaved / totalCharacters			
					if (percentCharactersSaved >= 0.3) // determine whether we've saved enough chars to not truncate
						needToTruncate = false
				}

				if (needToTruncate) // go ahead with truncation
				{
					// Since the user may switch between models with different context windows, truncating half may not be enough (ie if switching from claude 200k to deepseek 64k, half truncation will only remove 100k tokens, but we need to remove much more)
					// So if totalTokens/2 is greater than maxAllowedSize, we truncate 3/4 instead of 1/2
					const keep = totalTokens / 2 > maxAllowedSize ? "quarter" : "half"

					anyContextUpdates ||= this.applyStandardContextTruncationNoticeChange(timestamp) 

					// NOTE: it's okay that we overwriteConversationHistory in resume task since we're only ever removing the last user message and not anything in the middle which would affect this range
					this.getNextTruncationRange(apiMessages, keep)

					updatedDeletedRange = true
				}

				if (anyContextUpdates) // if we alter the context history, save the updated version to disk
					await this.saveContextHistory()
			}
		}

		return updatedDeletedRange
	}

	/**
	 * get truncation range
	 */
	public getNextTruncationRange(apiMessages: Anthropic.Messages.MessageParam[], keep: "none" | "lastTwo" | "half" | "quarter")
	{
		const startOfRest = (this.deletedRange) ? this.deletedRange[1] + 1 : 2 // inclusive starting index

		let messagesToRemove: number

		switch (keep)
		{
			case "none":
				messagesToRemove = Math.max(apiMessages.length - startOfRest, 0) // Removes all messages beyond the first core user/assistant message pair
				break
			case "lastTwo":
				messagesToRemove = Math.max(apiMessages.length - startOfRest - 2, 0) // Keep the last user-assistant pair and first user/assistant 
				break
			case "half":
				// Remove half of remaining user-assistant pairs
				// We first calculate half of the messages then divide by 2 to get the number of pairs.
				// After flooring, we multiply by 2 to get the number of messages.
				// Note that this will also always be an even number.
				messagesToRemove = Math.floor((apiMessages.length - startOfRest) / 4) * 2 // Keep even number
				break
			default:
				// Remove 3/4 of remaining user-assistant pairs
				// We calculate 3/4ths of the messages then divide by 2 to get the number of pairs.
				// After flooring, we multiply by 2 to get the number of messages.
				// Note that this will also always be an even number.
				messagesToRemove = Math.floor(((apiMessages.length - startOfRest) * 3) / 4 / 2) * 2
		}

		let rangeEndIndex = startOfRest + messagesToRemove - 1 // inclusive ending index

		// Make sure that the last message being removed is a assistant message, so the next message after the initial user-assistant pair is an assistant message. This preserves the user-assistant-user-assistant structure.
		// NOTE: anthropic format messages are always user-assistant-user-assistant, while openai format messages can have multiple user messages in a row (we use anthropic format throughout cline)
		if (apiMessages[rangeEndIndex].role !== "assistant") 
			rangeEndIndex -= 1

		this.deletedRange = [2, rangeEndIndex] // this is an inclusive range that will be removed from the conversation history
		return this.deletedRange
	}

	/**
	 * apply all required truncation methods to the messages in context
	 * applies deletedRange truncation and other alterations based on changes in this.contextHistoryUpdates
	 */
	public getTruncatedMessages(messages: Anthropic.Messages.MessageParam[])
	{
		if (messages.length <= 1) 
			return messages

		const startFromIndex = this.deletedRange ? this.deletedRange[1] + 1 : 2
		const result = new Array( (messages.length - startFromIndex) + 2)

		for (let i = 0; i < result.length; i++) 
		{
			const messageIndex = (i >= 2) ? startFromIndex + (i - 2) : i

			let message = messages[messageIndex]
			
			const contextHistory = this.contextHistoryUpdates.get(messageIndex)

			if (contextHistory)
			{
				message = cloneDeep(message) // because we are altering this, we need a deep copy
				if (Array.isArray(message.content)) 
				{
					for (const [blockIndex, changes] of contextHistory.blockMap)  // Extract the map from the tuple
					{
						const block = message.content[blockIndex]
						if (block?.type === "text") // only altering text for now
							block.text = changes?.at(-1)?.content ?? block.text// apply the latest change
					}
				}
			}
			result[i] = message
		}
		return result
	}

	/**
	 * removes all context history updates that occurred after the specified timestamp and saves to disk
	 */
	async truncateContextHistory(timestamp: number)
	{
		const contextHistory: ContextHistoryMap = this.contextHistoryUpdates
		for (const [messageIndex, { blockMap }] of contextHistory) 
		{
			const blockIndicesToDelete: number[] = [] // track which blockIndices to delete

			for (const [blockIndex, changes] of blockMap)  // loop over the innerIndices of the messages in this block
			{
				// updates ordered by timestamp, so find cutoff point by iterating from right to left
				let cutoffIndex = changes.length - 1
				while (cutoffIndex >= 0 && changes[cutoffIndex].timestamp > timestamp) 
				{
					cutoffIndex--
				}
				
				if (cutoffIndex < changes.length - 1) // If we found updates to remove
				{					
					changes.length = cutoffIndex + 1 // Modify the array in place to keep only updates up to cutoffIndex
					
					if (changes.length === 0) // If no updates left after truncation, mark this block for deletion
						blockIndicesToDelete.push(blockIndex)
				}
			}

			for (const blockIndex of blockIndicesToDelete)  // Remove empty blocks from inner map
			{
				blockMap.delete(blockIndex)
			}

			if (blockMap.size === 0)  // If inner map is now empty, remove the message index from outer map
				contextHistory.delete(messageIndex)
		}

		await this.saveContextHistory() // save the modified context history to disk
	}

	/**
	 * Public function for triggering potentially setting the truncation message
	 * If the truncation message already exists, does nothing, otherwise adds the message
	 */
	async triggerApplyStandardContextTruncationNoticeChange(timestamp: number) 
	{
		const updated = this.applyStandardContextTruncationNoticeChange(timestamp)
		if (updated) 
			await this.saveContextHistory()		
	}

	/**
	 * if there is any truncation and there is no other alteration already set, alter the assistant message to indicate this occurred
	 */
	private applyStandardContextTruncationNoticeChange(timestamp: number): boolean 
	{
		if (!this.contextHistoryUpdates.has(1)) // first assistant message always at index 1
		{			
			const blockMap = new Map<number, ContextUpdate[]>()
			blockMap.set(0, [{timestamp, content: formatResponse.contextTruncationNotice()}])
			this.contextHistoryUpdates.set(1, { editType: EditType.UNDEFINED, blockMap }) // EditType is undefined for first assistant message
			return true
		}
		return false	
	}


	/**
	 * generate a mapping from unique file reads from multiple tool calls to their outer index position(s)
	 * also return additional metadata to support multiple file reads in file mention text blocks
	 * alter all occurrences of file read operations and track which messages were updated
	 * returns the numer of chars saved
	 */
	private findAndRegisterDuplicateFileContents(apiMessages: Anthropic.Messages.MessageParam[], timestamp: number)
	{
		let charactersSaved = 0

		// fileReadIndices: { fileName => {messageIndex: number, editType: number, searchText: string, replaceText: string}[] }
		// messageFilePaths: { outerIndex => [fileRead1, fileRead2, ..] }
		// searchText in fileReadIndices is only required for file mention file-reads since there can be more than one file in the text
		// searchText will be the empty string "" in the case that it's not required, for non-file mentions
		// messageFilePaths is only used for file mentions as there can be multiple files read in the same text chunk
		const startIndex: number = this.deletedRange ? this.deletedRange[1] + 1 : 2

		// for all text blocks per file, has info for updating the block
		const fileRefs = new Map<string, FileReadInfo>()

		for (let i = startIndex; i < apiMessages.length; i++) 
		{
			const message = apiMessages[i]
			if (message.role === "user" && Array.isArray(message.content) && message.content.length > 0 && message.content[0].type === 'text') 
			{
				let previousRef:FileReadInfo | undefined
				let previousFileUpdated

				const history = this.contextHistoryUpdates.get(i)
	
				if (history?.editType === EditType.FILE_MENTION) 
				{
					const contextUpdate = history.blockMap.get( DEFAULT_INDEX )// file mention blocks assumed to be at index 1
	
					const last = contextUpdate?.at(-1) 
					// if we have updated this text previously, check if lists fileUpdated and allFiles are the same, if true, then we have replaced all, just ignore
					previousFileUpdated = (last?.filesUpdated?.length !== last?.allFiles?.length) ? last!.filesUpdated : undefined
				}
	
				if ((!history || (history && previousFileUpdated)) && message.content.length > 1 && message.content[1].type === "text")
				{
					const match = message.content[0].text.match(/^\[(?<type>[^\s]+) for '(?<filePath>[^']+)'\] Result:$/)?.groups
					switch (match?.type)
					{
						case "read_file":
							previousRef = register(EditType.READ_FILE_TOOL, match.filePath, i, message.content[1].text)
							break
						case "replace_in_file":
						case "write_to_file":
							const pattern = new RegExp(`(<final_file_content path="[^"]*">)[\\s\\S]*?(</final_file_content>)`)
                            const originalContent = message.content[1].text.match(pattern)?.[0]
							if (originalContent)
                            	previousRef = register(EditType.ALTER_FILE_TOOL, match.filePath, i, originalContent)
							break
						default: 
							const allFiles: string[] = []

							const matches = message.content[1].text.matchAll( /<file_content path="([^"]*)">([\\s\\S]*?)<\/file_content>/g )

							for (const fileMatch of matches) 
							{
								const filePath = fileMatch[1]
								allFiles.push(filePath) // we will record all unique paths from file mentions in this text
					
								if (!previousFileUpdated?.includes(filePath))  // we can assume that thisExistingFileReads does not have many entries meaning we haven't already replaced this file read
									previousRef = register(EditType.FILE_MENTION, filePath, i, fileMatch[0], allFiles)
							}
					}					
				}
				if (previousRef)
				{
					let originalContent = '' // Get base text either from existing updates or from apiMessages
					const messageContent = apiMessages[previousRef.messageIndex]?.content
					if (Array.isArray(messageContent) && messageContent.length > 1 && messageContent[1].type === "text")  
						originalContent = messageContent[ DEFAULT_INDEX ].text // assume index=1 for all text to replace for file mention filereads
	
					this.contextHistoryUpdates.addUpdate(timestamp, previousRef, originalContent, previousRef.allFiles)

					charactersSaved += previousRef.charsSaved
				}
			}
		}

		function register(editType: EditType, filePath: string, messageIndex: number, originalRefContent: string, allFiles?: string[])
		{
			const previousRef = fileRefs.get(filePath)
			
			let replaceText = formatResponse.duplicateFileReadNotice()
			if (editType === EditType.FILE_MENTION) // keep the tags but replace the content
				replaceText = `<file_content path="${filePath}">${formatResponse.duplicateFileReadNotice()}</file_content>`
			else if (editType === EditType.ALTER_FILE_TOOL)
				replaceText = `<final_file_content path="${filePath}"> ${formatResponse.duplicateFileReadNotice()} </final_file_content>`

			const charsSaved = Math.max(0, originalRefContent.length - replaceText.length)

			fileRefs.set(filePath, {messageIndex, editType, originalRefContent, replaceText, filePath, allFiles, charsSaved})

			return previousRef
		}

		return charactersSaved
	}
	
	/**
	 * count total characters in messages and total savings within this range
	 */
	private countCharsExcludingRange(apiMessages: Anthropic.Messages.MessageParam[], deleteFromIndex?:number)
	{
		let totalCharacters = 0
		const deleteRange = {start: 2, end: deleteFromIndex ?? 2}
		for (let i = 0; i < apiMessages.length; i++) 
		{
			const message = apiMessages[i] // looping over the outer indices of messages
			if ((i < deleteRange.start || i >= deleteRange.end) && (message.content && Array.isArray(message.content)))
			{
				for (let blockIndex = 0; blockIndex < message.content.length; blockIndex++) 
				{
					const block = message.content[blockIndex] // looping over inner indices of messages

					if (block.type === "text" && block.text) 
						totalCharacters += this.contextHistoryUpdates.getLastBlockUpdate(i, blockIndex)?.content.length ?? block.text.length
					else if (block.type === "image" && block.source && block.source.type === "base64" && block.source.data) 
						totalCharacters += block.source.data.length
				}
			}
		}
		return totalCharacters
	}
}

class ContextHistoryMap extends Map<number, ContextHistoryEntry>
{
	constructor(entries?: Iterable<readonly [number, ContextHistoryEntry]>) 
	{
	    super(entries)
  	}

	getLastBlockUpdate(messageIndex:number, blockIndex:number)
	{
		const contextHistory = this.get(messageIndex)
		const updates = contextHistory?.blockMap.get(blockIndex)
		return (updates && updates.length > 0) ? updates.at(-1)! : undefined
	}

	private getOrCreateContextUpdates(messageIndex: number, editType:EditType)
	{
		let contextHistory = this.get(messageIndex)
		let blockMap = new Map<number, ContextUpdate[]>()

		if (contextHistory) 
			blockMap = contextHistory.blockMap
		else
			this.set(messageIndex, {editType, blockMap})

		if (!blockMap.has(DEFAULT_INDEX))
			blockMap.set(DEFAULT_INDEX, [])

		return blockMap.get(DEFAULT_INDEX)!
	}

	addUpdate(timestamp:number, fileRef:FileReadInfo, content:string, allFiles?:string[])
	{
		// for single-fileread text we can set the updates here
		// for potential multi-fileread text we need to determine all changes & iteratively update the text prior to saving the final change
		const updates = this.getOrCreateContextUpdates(fileRef.messageIndex, fileRef.editType)

		if (fileRef.editType === EditType.FILE_MENTION)
		{
			const previousUpdate = this.getLastBlockUpdate(fileRef.messageIndex, DEFAULT_INDEX)  
			
			const isUpdatingPrevious = (previousUpdate?.timestamp === timestamp)
			
			let currentUpdate = (isUpdatingPrevious) ? previousUpdate : (previousUpdate) ? {...previousUpdate} : {timestamp, content, filesUpdated:[]}
	
			if (currentUpdate.content && fileRef.originalRefContent) // Replace searchText with messageString
			{
				currentUpdate.content = currentUpdate.content.replace(fileRef.originalRefContent , fileRef.replaceText)
				currentUpdate.filesUpdated?.push(fileRef.filePath) // add the newly added filePath read
			}

			if (allFiles && allFiles.length > 0 && !isUpdatingPrevious)
				updates.push({timestamp, content: currentUpdate.content ?? '',	filesUpdated: currentUpdate.filesUpdated ?? [],	allFiles}) // fileUpdated from allFiles stores all the files reads we have replaced now & previously
		}
		else
		{
			//READ:		replaceText = formatResponse.duplicateFileReadNotice()
			//ALTER: 	replaceText = `<final_file_content path="${path}"> ${formatResponse.duplicateFileReadNotice()} </final_file_content>`
			updates.push({timestamp, content:fileRef.replaceText})// metadata array is empty for non-file mention occurrences				
		}
	}
}