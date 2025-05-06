import { trimLines } from "@/utils/array"

/**
 * This function reconstructs the file content by applying a streamed diff (in a
 * specialized SEARCH/REPLACE block format) to the original file content. It is designed
 * to handle both incremental updates and the final resulting file after all chunks have
 * been processed.
 *
 * The diff format is a custom structure that uses three markers to define changes:
 *
 *   <<<<<<< SEARCH
 *   [Exact content to find in the original file]
 *   =======
 *   [Content to replace with]
 *   >>>>>>> REPLACE
 *
 * Behavior and Assumptions:
 * 1. The file is processed chunk-by-chunk. Each chunk of `diffContent` may contain
 *    partial or complete SEARCH/REPLACE blocks. By calling this function with each
 *    incremental chunk (with `isFinal` indicating the last chunk), the final reconstructed
 *    file content is produced.
 *
 * 2. Matching Strategy (in order of attempt):
 *    a. Exact Match: First attempts to find the exact SEARCH block text in the original file
 *    b. Line-Trimmed Match: Falls back to line-by-line comparison ignoring leading/trailing whitespace
 *    c. Block Anchor Match: For blocks of 3+ lines, tries to match using first/last lines as anchors
 *    If all matching strategies fail, an error is thrown.
 *
 * 3. Empty SEARCH Section:
 *    - If SEARCH is empty and the original file is empty, this indicates creating a new file
 *      (pure insertion).
 *    - If SEARCH is empty and the original file is not empty, this indicates a complete
 *      file replacement (the entire original content is considered matched and replaced).
 *
 * 4. Applying Changes:
 *    - Before encountering the "=======" marker, lines are accumulated as search content.
 *    - After "=======" and before ">>>>>>> REPLACE", lines are accumulated as replacement content.
 *    - Once the block is complete (">>>>>>> REPLACE"), the matched section in the original
 *      file is replaced with the accumulated replacement lines, and the position in the original
 *      file is advanced.
 *
 * 5. Incremental Output:
 *    - As soon as the match location is found and we are in the REPLACE section, each new
 *      replacement line is appended to the result so that partial updates can be viewed
 *      incrementally.
 *
 * 6. Partial Markers:
 *    - If the final line of the chunk looks like it might be part of a marker but is not one
 *      of the known markers, it is removed. This prevents incomplete or partial markers
 *      from corrupting the output.
 *
 * 7. Finalization:
 *    - Once all chunks have been processed (when `isFinal` is true), any remaining original
 *      content after the last replaced section is appended to the result.
 *    - Trailing newlines are not forcibly added. The code tries to output exactly what is specified.
 *
 * Errors:
 * - If the search block cannot be matched using any of the available matching strategies,
 *   an error is thrown.
 */

const map: Record<string, (diffContent: string, content: string, isFinal: boolean) => Promise<string>> = 
{
	v1: constructNewFileContentV1,
	v2: constructNewFileContentV2,
} as const

export async function constructNewFileContent(diffContent: string, content: string, isFinal: boolean, version: "v1" | "v2" = "v2"): Promise<string> 
{
	diffContent = StringUtils.fixModelDiffContent(diffContent)
	const constructor =  map[version]
	if (!constructor) 
		throw new Error(`Invalid version '${version}' for file content constructor`)
	return constructor(diffContent, content, isFinal)
}

/**
 * @deprecated
 */
export async function constructNewFileContentV1(diffContent:string, content:string, isFinal:boolean):Promise<string> 
{
	let result = ""
	let lastValidIndex = 0
	let searchContent = ''
	let mode = undefined //undefined is the default mode, true is in searching capture mode, e false in replacing capture mode
	let matchStart = -1
	let matchEnd = -1

	let diffLines = diffContent.split("\n")
	const lastLine = diffLines[diffLines.length - 1]

	if (lastLine && lastLine !== "<<<<<<< SEARCH" && lastLine !== "=======" && lastLine !== ">>>>>>> REPLACE") 
		diffLines.pop()

	for (const diffLine of diffLines) 
	{
		switch (diffLine)
		{
			case "<<<<<<< SEARCH":
				searchContent = ""
				mode = true
				break
			case "=======":
				[matchStart, matchEnd] = findMatch(content, searchContent, lastValidIndex)
				result += content.slice(lastValidIndex, matchStart) // Output everything up to the match location
				mode = false
				break
			case ">>>>>>> REPLACE":
				lastValidIndex = matchEnd // Advance lastValidIndex after the matched section
				mode = undefined
				break
			default:
				if (mode) // in searching mode
					searchContent += diffLine + "\n"
				else if (!mode && matchStart !== -1)
					result += diffLine + "\n"							
		}
	}
	return (isFinal) ? (result + content.slice(Math.min(lastValidIndex, content.length))).trim() : result.trim() // If final chunk, append remaining content
}


/**
 * Finds the line number character index in a multi-line array.
 * @param lines Array of strings representing the lines
 * @param index Character index to locate
 * @returns line number 
 */
function locateIndexInLines(lines:string[], index: number)
{
	let currentIndex = 0, lineNumber = 0
	while (currentIndex < index && lineNumber < lines.length) 
	{
		currentIndex += lines[lineNumber].length + 1
		lineNumber++
	}
	return currentIndex > index ? lineNumber - 1 : lineNumber
}

function getStringRangeLength(lines:string[], start:number, length:number)
{
	let result = 0
	for (let i = 0; i < length; i++) // Find start character index
	{
		result += lines[start + i].length + 1 // +1 for \n
	}
	return result
}

function findMatch(content:string, searchContent:string, lastValidIndex:number): [number, number] 
{
	if (!searchContent) 
		return [0, (content.length === 0) ? 0 : content.length] // New file (nothing to match, insert only) or Complete file replacement

	let matchStart = content.indexOf(searchContent, lastValidIndex) 
	if (matchStart !== -1) // Exact search match scenario
		return [matchStart, matchStart + searchContent.length]

	let matchEnd = 0;
	[matchStart, matchEnd] = lineTrimmedFallbackMatch(content, searchContent, lastValidIndex)
	if (matchStart === -1 || matchEnd === -1) 
		[matchStart, matchEnd] = blockAnchorFallbackMatch(content, searchContent, lastValidIndex)
	if (matchStart === -1 || matchEnd === -1) 
		throw new Error(`The SEARCH block:\n${searchContent.trimEnd()}\n...does not match anything in the file.`)

	return [matchStart, matchEnd]
}


/**
 * Attempts a line-trimmed fallback match for the given search content in the original content.
 * It tries to match `searchContent` lines against a block of lines in `originalContent` starting
 * from `lastProcessedIndex`. Lines are matched by trimming leading/trailing whitespace and ensuring
 * they are identical afterwards.
 *
 * Returns [matchIndexStart, matchIndexEnd] if found, or false if not found.
 */
export function lineTrimmedFallbackMatch(content:string, searchContent:string, startIndex:number): [number, number] 
{
	const lines = content.split("\n") 
	const searchLines = trimLines(searchContent.split("\n"), false, true) //trim empty lines at the end
	let startLineNumber = locateIndexInLines(lines, startIndex) // Find the line number where startIndex falls
	
	// For each possible starting position in original content
	for (let i = startLineNumber; i <= lines.length - searchLines.length; i++) 
	{
		const matches = searchLines.every((searchLine, j) => lines[i + j].trim() === searchLine.trim())

		if (matches)  // If we found a match, calculate the exact character positions
		{
			let start = getStringRangeLength(lines, 0, i)
			let end = start + getStringRangeLength(lines, i, searchLines.length)
			return [start, Math.min(end, content.length)]
		}
	}
	return [-1, -1]
}

/**
 * Attempts to match blocks of code by using the first and last lines as anchors.
 * This is a third-tier fallback strategy that helps match blocks where we can identify
 * the correct location by matching the beginning and end, even if the exact content
 * differs slightly.
 *
 * The matching strategy:
 * 1. Only attempts to match blocks of 3 or more lines to avoid false positives
 * 2. Extracts from the search content:
 *    - First line as the "start anchor"
 *    - Last line as the "end anchor"
 * 3. For each position in the original content:
 *    - Checks if the next line matches the start anchor
 *    - If it does, jumps ahead by the search block size
 *    - Checks if that line matches the end anchor
 *    - All comparisons are done after trimming whitespace
 *
 * This approach is particularly useful for matching blocks of code where:
 * - The exact content might have minor differences
 * - The beginning and end of the block are distinctive enough to serve as anchors
 * - The overall structure (number of lines) remains the same
 *
 * @param content - The full content of the original file
 * @param searchContent - The content we're trying to find in the original file
 * @param startIndex - The character index in originalContent where to start searching
 * @returns A tuple of [startIndex, endIndex] if a match is found, false otherwise
 */
export function blockAnchorFallbackMatch(content:string, searchContent:string, startIndex: number): [number, number] 
{
	const searchLines = trimLines(searchContent.split("\n"), false, true)

	if (searchLines.length >= 3) // Only use this approach for blocks of 3+ lines
	{
		const lines = content.split("\n")
		const firstLineSearch = searchLines[0].trim()
		const lastLineSearch = searchLines[searchLines.length - 1].trim()

		let startLineIndex = locateIndexInLines(lines, startIndex) // Find the line number where startIndex falls

		for (let i = startLineIndex; i <= lines.length - searchLines.length; i++)  // Look for matching start and end anchors
		{
			if (lines[i].trim() === firstLineSearch) // Check if first line matches
			{
				if (lines[i + searchLines.length - 1].trim() === lastLineSearch) // Check if last line matches at the expected position
				{
					let matchStartIndex = getStringRangeLength(lines, 0, i) // Calculate exact character positions
					let matchEndIndex = matchStartIndex
					for (let k = 0; k < searchLines.length; k++) 
					{
						matchEndIndex += lines[i + k].length;
						if (k < searchLines.length - 1 || (i + k) < lines.length - 1)  //If not last line the search block or the orginal block
							matchEndIndex += 1;
					}
					return [matchStartIndex, matchEndIndex]
				}
			}
		}
	}	
	return [-1,-1]
}




enum ProcessingState {
	Idle = 0,
	StateSearch = 1 << 0,
	StateReplace = 1 << 1,
}

class NewFileContentConstructor {
	private originalContent: string
	private isFinal: boolean
	private state: number
	private pendingNonStandardLines: string[]
	private result: string
	private lastProcessedIndex: number
	private currentSearchContent: string
	private currentReplaceContent: string
	private searchMatchIndex: number
	private searchEndIndex: number

	constructor(originalContent: string, isFinal: boolean) {
		this.originalContent = originalContent
		this.isFinal = isFinal
		this.pendingNonStandardLines = []
		this.result = ""
		this.lastProcessedIndex = 0
		this.state = ProcessingState.Idle
		this.currentSearchContent = ""
		this.currentReplaceContent = ""
		this.searchMatchIndex = -1
		this.searchEndIndex = -1
	}

	private resetForNextBlock() {
		// Reset for next block
		this.state = ProcessingState.Idle
		this.currentSearchContent = ""
		this.currentReplaceContent = ""
		this.searchMatchIndex = -1
		this.searchEndIndex = -1
	}

	private findLastMatchingLineIndex(regx: RegExp, lineLimit: number) {
		for (let i = lineLimit; i > 0; ) {
			i--
			if (this.pendingNonStandardLines[i].match(regx)) {
				return i
			}
		}
		return -1
	}

	private updateProcessingState(newState: ProcessingState) {
		const isValidTransition =
			(this.state === ProcessingState.Idle && newState === ProcessingState.StateSearch) ||
			(this.state === ProcessingState.StateSearch && newState === ProcessingState.StateReplace)

		if (!isValidTransition) {
			throw new Error(
				`Invalid state transition.\n` +
					"Valid transitions are:\n" +
					"- Idle → StateSearch\n" +
					"- StateSearch → StateReplace",
			)
		}

		this.state |= newState
	}

	private isStateActive(state: ProcessingState): boolean {
		return (this.state & state) === state
	}

	private activateReplaceState() {
		this.updateProcessingState(ProcessingState.StateReplace)
	}

	private activateSearchState() {
		this.updateProcessingState(ProcessingState.StateSearch)
		this.currentSearchContent = ""
		this.currentReplaceContent = ""
	}

	private isSearchingActive(): boolean {
		return this.isStateActive(ProcessingState.StateSearch)
	}

	private isReplacingActive(): boolean {
		return this.isStateActive(ProcessingState.StateReplace)
	}

	private hasPendingNonStandardLines(pendingNonStandardLineLimit: number): boolean {
		return this.pendingNonStandardLines.length - pendingNonStandardLineLimit < this.pendingNonStandardLines.length
	}

	public processLine(line: string) {
		this.internalProcessLine(line, true, this.pendingNonStandardLines.length)
	}

	public getResult() {
		// If this is the final chunk, append any remaining original content
		if (this.isFinal && this.lastProcessedIndex < this.originalContent.length) {
			this.result += this.originalContent.slice(this.lastProcessedIndex)
		}
		if (this.isFinal && this.state !== ProcessingState.Idle) {
			throw new Error("File processing incomplete - SEARCH/REPLACE operations still active during finalization")
		}
		return this.result
	}

	private internalProcessLine(
		line: string,
		canWritependingNonStandardLines: boolean,
		pendingNonStandardLineLimit: number,
	): number {
		let removeLineCount = 0
		if (line === "<<<<<<< SEARCH") {
			removeLineCount = this.trimPendingNonStandardTrailingEmptyLines(pendingNonStandardLineLimit)
			if (removeLineCount > 0) {
				pendingNonStandardLineLimit = pendingNonStandardLineLimit - removeLineCount
			}
			if (this.hasPendingNonStandardLines(pendingNonStandardLineLimit)) {
				this.tryFixSearchReplaceBlock(pendingNonStandardLineLimit)
				canWritependingNonStandardLines && (this.pendingNonStandardLines.length = 0)
			}
			this.activateSearchState()
		} else if (line === "=======") {
			// 校验非标内容
			if (!this.isSearchingActive()) {
				this.tryFixSearchBlock(pendingNonStandardLineLimit)
				canWritependingNonStandardLines && (this.pendingNonStandardLines.length = 0)
			}
			this.activateReplaceState()
			this.beforeReplace()
		} else if (line === ">>>>>>> REPLACE") {
			if (!this.isReplacingActive()) {
				this.tryFixReplaceBlock(pendingNonStandardLineLimit)
				canWritependingNonStandardLines && (this.pendingNonStandardLines.length = 0)
			}
			this.lastProcessedIndex = this.searchEndIndex
			this.resetForNextBlock()
		} else {
			// Accumulate content for search or replace
			// (currentReplaceContent is not being used for anything right now since we directly append to result.)
			// (We artificially add a linebreak since we split on \n at the beginning. In order to not include a trailing linebreak in the final search/result blocks we need to remove it before using them. This allows for partial line matches to be correctly identified.)
			// NOTE: search/replace blocks must be arranged in the order they appear in the file due to how we build the content using lastProcessedIndex. We also cannot strip the trailing newline since for non-partial lines it would remove the linebreak from the original content. (If we remove end linebreak from search, then we'd also have to remove it from replace but we can't know if it's a partial line or not since the model may be using the line break to indicate the end of the block rather than as part of the search content.) We require the model to output full lines in order for our fallbacks to work as well.
			if (this.isReplacingActive()) {
				this.currentReplaceContent += line + "\n"
				// Output replacement lines immediately if we know the insertion point
				if (this.searchMatchIndex !== -1) {
					this.result += line + "\n"
				}
			} else if (this.isSearchingActive()) {
				this.currentSearchContent += line + "\n"
			} else {
				let appendToPendingNonStandardLines = canWritependingNonStandardLines
				if (appendToPendingNonStandardLines) {
					console.log("unstandard line:" + line)
					// 处理非标内容
					this.pendingNonStandardLines.push(line)
				}
			}
		}
		return removeLineCount
	}

	private beforeReplace() {
		// Remove trailing linebreak for adding the === marker
		// if (currentSearchContent.endsWith("\r\n")) {
		// 	currentSearchContent = currentSearchContent.slice(0, -2)
		// } else if (currentSearchContent.endsWith("\n")) {
		// 	currentSearchContent = currentSearchContent.slice(0, -1)
		// }

		if (!this.currentSearchContent) {
			// Empty search block
			if (this.originalContent.length === 0) {
				// New file scenario: nothing to match, just start inserting
				this.searchMatchIndex = 0
				this.searchEndIndex = 0
			} else {
				// Complete file replacement scenario: treat the entire file as matched
				this.searchMatchIndex = 0
				this.searchEndIndex = this.originalContent.length
			}
		} else {
			// Add check for inefficient full-file search
			// if (currentSearchContent.trim() === originalContent.trim()) {
			// 	throw new Error(
			// 		"The SEARCH block contains the entire file content. Please either:\n" +
			// 			"1. Use an empty SEARCH block to replace the entire file, or\n" +
			// 			"2. Make focused changes to specific parts of the file that need modification.",
			// 	)
			// }
			// Exact search match scenario
			const exactIndex = this.originalContent.indexOf(this.currentSearchContent, this.lastProcessedIndex)
			if (exactIndex !== -1) {
				this.searchMatchIndex = exactIndex
				this.searchEndIndex = exactIndex + this.currentSearchContent.length
			} else {
				// Attempt fallback line-trimmed matching
				const lineMatch = lineTrimmedFallbackMatch(
					this.originalContent,
					this.currentSearchContent,
					this.lastProcessedIndex,
				)
				if (lineMatch) {
					;[this.searchMatchIndex, this.searchEndIndex] = lineMatch
				} else {
					// Try block anchor fallback for larger blocks
					const blockMatch = blockAnchorFallbackMatch(
						this.originalContent,
						this.currentSearchContent,
						this.lastProcessedIndex,
					)
					if (blockMatch) {
						;[this.searchMatchIndex, this.searchEndIndex] = blockMatch
					} else {
						throw new Error(
							`The SEARCH block:\n${this.currentSearchContent.trimEnd()}\n...does not match anything in the file.`,
						)
					}
				}
			}
		}
		if (this.searchMatchIndex < this.lastProcessedIndex) {
			throw new Error(
				`The SEARCH block:\n${this.currentSearchContent.trimEnd()}\n...matched an incorrect content in the file.`,
			)
		}
		// Output everything up to the match location
		this.result += this.originalContent.slice(this.lastProcessedIndex, this.searchMatchIndex)
	}

	private tryFixSearchBlock(lineLimit: number): number {
		let removeLineCount = 0
		if (lineLimit < 0) {
			lineLimit = this.pendingNonStandardLines.length
		}
		if (!lineLimit) {
			throw new Error("Invalid SEARCH/REPLACE block structure - no lines available to process")
		}
		let searchTagRegexp = /^[<]{3,} SEARCH$/
		const searchTagIndex = this.findLastMatchingLineIndex(searchTagRegexp, lineLimit)
		if (searchTagIndex !== -1) {
			let fixLines = this.pendingNonStandardLines.slice(searchTagIndex, lineLimit)
			fixLines[0] = "<<<<<<< SEARCH"
			for (const line of fixLines) {
				removeLineCount += this.internalProcessLine(line, false, searchTagIndex)
			}
		} else {
			throw new Error(
				`Invalid REPLACE marker detected - could not find matching SEARCH block starting from line ${searchTagIndex + 1}`,
			)
		}
		return removeLineCount
	}

	private tryFixReplaceBlock(lineLimit: number): number {
		let removeLineCount = 0
		if (lineLimit < 0) {
			lineLimit = this.pendingNonStandardLines.length
		}
		if (!lineLimit) {
			throw new Error()
		}
		let replaceBeginTagRegexp = /^[=]{3,}$/
		const replaceBeginTagIndex = this.findLastMatchingLineIndex(replaceBeginTagRegexp, lineLimit)
		if (replaceBeginTagIndex !== -1) {
			// // 校验非标内容
			// if (!this.isSearchingActive()) {
			// 	removeLineCount += this.tryFixSearchBlock(replaceBeginTagIndex)
			// }
			let fixLines = this.pendingNonStandardLines.slice(replaceBeginTagIndex - removeLineCount, lineLimit - removeLineCount)
			fixLines[0] = "======="
			for (const line of fixLines) {
				removeLineCount += this.internalProcessLine(line, false, replaceBeginTagIndex - removeLineCount)
			}
		} else {
			throw new Error(`Malformed REPLACE block - missing valid separator after line ${replaceBeginTagIndex + 1}`)
		}
		return removeLineCount
	}

	private tryFixSearchReplaceBlock(lineLimit: number): number {
		let removeLineCount = 0
		if (lineLimit < 0) {
			lineLimit = this.pendingNonStandardLines.length
		}
		if (!lineLimit) {
			throw new Error()
		}

		let replaceEndTagRegexp = /^[>]{3,} REPLACE$/
		const replaceEndTagIndex = this.findLastMatchingLineIndex(replaceEndTagRegexp, lineLimit)
		const likeReplaceEndTag = replaceEndTagIndex === lineLimit - 1
		if (likeReplaceEndTag) {
			// // 校验非标内容
			// if (!this.isReplacingActive()) {
			// 	removeLineCount += this.tryFixReplaceBlock(replaceEndTagIndex)
			// }
			let fixLines = this.pendingNonStandardLines.slice(replaceEndTagIndex - removeLineCount, lineLimit - removeLineCount)
			fixLines[fixLines.length - 1] = ">>>>>>> REPLACE"
			for (const line of fixLines) {
				removeLineCount += this.internalProcessLine(line, false, replaceEndTagIndex - removeLineCount)
			}
		} else {
			throw new Error("Malformed SEARCH/REPLACE block structure: Missing valid closing REPLACE marker")
		}
		return removeLineCount
	}

	/**
	 * Removes trailing empty lines from the pendingNonStandardLines array
	 * @param lineLimit - The index to start checking from (exclusive).
	 *                    Removes empty lines from lineLimit-1 backwards.
	 * @returns The number of empty lines removed
	 */
	private trimPendingNonStandardTrailingEmptyLines(lineLimit: number): number {
		let removedCount = 0
		let i = Math.min(lineLimit, this.pendingNonStandardLines.length) - 1

		while (i >= 0 && this.pendingNonStandardLines[i].trim() === "") {
			this.pendingNonStandardLines.pop()
			removedCount++
			i--
		}

		return removedCount
	}
}

export async function constructNewFileContentV2(diffContent: string, originalContent: string, isFinal: boolean): Promise<string> {
	let newFileContentConstructor = new NewFileContentConstructor(originalContent, isFinal)

	let lines = diffContent.split("\n")

	// If the last line looks like a partial marker but isn't recognized,
	// remove it because it might be incomplete.
	const lastLine = lines[lines.length - 1]
	if (
		lines.length > 0 &&
		(lastLine.startsWith("<") || lastLine.startsWith("=") || lastLine.startsWith(">")) &&
		lastLine !== "<<<<<<< SEARCH" &&
		lastLine !== "=======" &&
		lastLine !== ">>>>>>> REPLACE"
	) {
		lines.pop()
	}

	for (const line of lines) {
		newFileContentConstructor.processLine(line)
	}

	let result = newFileContentConstructor.getResult()
	return result
}
