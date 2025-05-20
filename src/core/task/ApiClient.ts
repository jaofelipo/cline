import { ApiStream } from "@/api/transform/stream"
import pWaitFor from "p-wait-for"
import * as vscode from "vscode"
import { addUserInstructions, SYSTEM_PROMPT } from "../prompts/system"
import { DEFAULT_LANGUAGE_SETTINGS, getLanguageKey, LanguageDisplay } from "@/shared/Languages"
import { getGlobalClineRules, getLocalClineRules, refreshClineRulesToggles } from "../context/instructions/user-instructions/cline-rules"
import { getLocalCursorRules, getLocalWindsurfRules, refreshExternalRulesToggles } from "../context/instructions/user-instructions/external-rules"
import { ensureRulesDirectoryExists } from "../storage/disk"
import { formatResponse } from "../prompts/responses"
import { cwd, Task } from "."
import { OpenRouterHandler } from "@/api/providers/openrouter"
import { ClineHandler } from "@/api/providers/cline"
import { setTimeout as delay } from "node:timers/promises"
import { getContextWindowInfo } from "../context/ContextManager"

export class ApiClient 
{
	private shouldAutoRetry = true
   	
	constructor() 
    {
		
    }

    async *attemptApiRequest(task:Task, previousApiReqIndex: number): ApiStream 
    {
		// Wait for MCP servers to be connected before generating system prompt
		await pWaitFor(() => task.mcpHub.isConnecting !== true, { timeout: 10_000 }).catch(() => {
			console.error("MCP servers failed to connect in time")
		})

		const systemPrompt = await this.createSystemPrompt(task)

		const previousRequest = (previousApiReqIndex >= 0) ? task.clineMessages[previousApiReqIndex] : undefined

		const truncated = await task.contextManager.getNewDeletedRange(task.apiConversationHistory, getContextWindowInfo(task.api).maxAllowedSize, previousRequest)

		if (truncated) 
			await task.saveClineMessagesAndUpdateHistory() // saves task history item which we use to keep track of conversation history deleted range

		const truncatedConversationHistory = task.contextManager.getTruncatedMessages(task.apiConversationHistory)

		let stream = task.api.createMessage(systemPrompt, truncatedConversationHistory)

		const iterator = stream[Symbol.asyncIterator]()

		try {
			// awaiting first chunk to see if it will throw an error
			task.isWaitingForFirstChunk = true
			const firstChunk = await iterator.next()
			yield firstChunk.value
			task.isWaitingForFirstChunk = false
		} 
		catch (error) 
		{
			if (await this.handleFirstChunkError(error, task)) 
			{
				yield* this.attemptApiRequest(task, previousApiReqIndex)
				return
			}
			else 
			{
				throw new Error("API request failed")
			}
		}

		// no error, so we can continue to yield all remaining chunks
		// (needs to be placed outside of try/catch since it we want caller to handle errors not with api_req_failed as that is reserved for first chunk failures only)
		// this delegates to another generator or iterable object. In this case, it's saying "yield all remaining values from this iterator". This effectively passes along all subsequent chunks from the original stream.
		yield* iterator
	}


    private async *streamWithDone(iterator: AsyncIterableIterator<any>, endMarker:any) 
    {
        for await (const { value, done } of iterator) 
        {
            if (done) {
                yield endMarker 
                return
            }
            yield value
        }
    }

	private async createSystemPrompt(task: Task): Promise<string> 
	{
		await this.migrateDisableBrowserToolSetting(task)
		const disableBrowserTool = task.browserSettings.disableToolUse ?? false

		// cline browser tool uses image recognition for navigation (requires model image support).
		const modelSupportsBrowserUse = task.api.getModel().info.supportsImages ?? false

		const supportsBrowserUse = modelSupportsBrowserUse && !disableBrowserTool // only enable browser use if the model supports it and the user hasn't disabled it

		let systemPrompt = await SYSTEM_PROMPT(cwd, supportsBrowserUse, task.mcpHub, task.browserSettings)

		let settingsCustomInstructions = task.customInstructions?.trim()
		await this.migratePreferredLanguageToolSetting(task)
		const preferredLanguage = getLanguageKey(task.chatSettings.preferredLanguage as LanguageDisplay)
		const preferredLanguageInstructions =
			preferredLanguage && preferredLanguage !== DEFAULT_LANGUAGE_SETTINGS
				? `# Preferred Language\n\nSpeak in ${preferredLanguage}.`
				: ""

		const { globalToggles, localToggles } = await refreshClineRulesToggles(task.getContext(), cwd)
		const { windsurfLocalToggles, cursorLocalToggles } = await refreshExternalRulesToggles(task.getContext(), cwd)

		const globalClineRulesFilePath = await ensureRulesDirectoryExists()
		const globalClineRulesFileInstructions = await getGlobalClineRules(globalClineRulesFilePath, globalToggles)

		const localClineRulesFileInstructions = await getLocalClineRules(cwd, localToggles)
		const [localCursorRulesFileInstructions, localCursorRulesDirInstructions] = await getLocalCursorRules(
			cwd,
			cursorLocalToggles,
		)
		const localWindsurfRulesFileInstructions = await getLocalWindsurfRules(cwd, windsurfLocalToggles)

		const clineIgnoreContent = task.clineIgnoreController.clineIgnoreContent
		let clineIgnoreInstructions: string | undefined
		if (clineIgnoreContent) {
			clineIgnoreInstructions = formatResponse.clineIgnoreInstructions(clineIgnoreContent)
		}

		if (
			settingsCustomInstructions ||
			globalClineRulesFileInstructions ||
			localClineRulesFileInstructions ||
			localCursorRulesFileInstructions ||
			localCursorRulesDirInstructions ||
			localWindsurfRulesFileInstructions ||
			clineIgnoreInstructions ||
			preferredLanguageInstructions
		) {
			// altering the system prompt mid-task will break the prompt cache, but in the grand scheme this will not change often so it's better to not pollute user messages with it the way we have to with <potentially relevant details>
			const userInstructions = addUserInstructions(
				settingsCustomInstructions,
				globalClineRulesFileInstructions,
				localClineRulesFileInstructions,
				localCursorRulesFileInstructions,
				localCursorRulesDirInstructions,
				localWindsurfRulesFileInstructions,
				clineIgnoreInstructions,
				preferredLanguageInstructions,
			)
			systemPrompt += userInstructions
		}
		return systemPrompt
	}

	private async handleFirstChunkError(error: any, task: Task): Promise<boolean>
	{
		const contextError = task.api.isContextWindowError(error)
	
		if (contextError && this.shouldAutoRetry) 
		{
			await this.truncateAndRetry(task)
			this.shouldAutoRetry = false
	
			if (task.api instanceof OpenRouterHandler || task.api instanceof ClineHandler) 
				await delay(1000)
			return true
		}

		// request failed after retrying automatically once, ask user if they want to retry again
		// note that this api_req_failed ask is unique in that we only present this option if the api hasn't streamed any content yet
		if (contextError) 
		{
			const truncated = task.contextManager.getTruncatedMessages(task.apiConversationHistory)
	
			if (truncated.length > 3) 
			{
				this.shouldAutoRetry = true
				error = new Error("Context window exceeded. Click retry to truncate the conversation and try again.")
			}
		}
	
		const errorMessage = task.formatErrorWithStatusCode(error)

		const { response } = await task.ask("api_req_failed", errorMessage)

		if (response !== "yesButtonClicked") // never happen, if noButtonClicked -> clear current task, aborting this instance
			return false

    	await task.say("api_req_retried")
    	return true
	}

	private async truncateAndRetry(task: Task): Promise<void> 
	{
		task.contextManager.getNextTruncationRange(task.apiConversationHistory,	"quarter") // Force aggressive truncation
		await task.saveClineMessagesAndUpdateHistory()
		await task.contextManager.triggerApplyStandardContextTruncationNoticeChange(Date.now())
	}

	/**
	 * Migrates the disableBrowserTool setting from VSCode configuration to browserSettings
	 */
	public async migrateDisableBrowserToolSetting(task:Task): Promise<void> {
		const config = vscode.workspace.getConfiguration("cline")
		const disableBrowserTool = config.get<boolean>("disableBrowserTool")

		if (disableBrowserTool !== undefined) {
			task.browserSettings.disableToolUse = disableBrowserTool
			// Remove from VSCode configuration
			await config.update("disableBrowserTool", undefined, true)
		}
	}

	private async migratePreferredLanguageToolSetting(task:Task): Promise<void> {
		const config = vscode.workspace.getConfiguration("cline")
		const preferredLanguage = config.get<LanguageDisplay>("preferredLanguage")
		if (preferredLanguage !== undefined) {
			task.chatSettings.preferredLanguage = preferredLanguage
			// Remove from VSCode configuration
			await config.update("preferredLanguage", undefined, true)
		}
	}
}
