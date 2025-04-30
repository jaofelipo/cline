import { Anthropic } from "@anthropic-ai/sdk"
import cloneDeep from "clone-deep"
import { execa } from "execa"
import getFolderSize from "get-folder-size"
import { setTimeout as delay } from "node:timers/promises"
import os from "os"
import pTimeout from "p-timeout"
import pWaitFor from "p-wait-for"
import * as path from "path"
import { serializeError } from "serialize-error"
import * as vscode from "vscode"
import { Logger } from "@services/logging/Logger"
import { ApiHandler, buildApiHandler } from "@api/index"
import { AnthropicHandler } from "@api/providers/anthropic"
import { ClineHandler } from "@api/providers/cline"
import { OpenRouterHandler } from "@api/providers/openrouter"
import { ApiStream } from "@api/transform/stream"
import CheckpointTracker from "@integrations/checkpoints/CheckpointTracker"
import { DIFF_VIEW_URI_SCHEME, DiffViewProvider } from "@integrations/editor/DiffViewProvider"
import { formatContentBlockToMarkdown } from "@integrations/misc/export-markdown"
import { extractTextFromFile } from "@integrations/misc/extract-text"
import { showSystemNotification } from "@integrations/notifications"
import { TerminalManager } from "@integrations/terminal/TerminalManager"
import { BrowserSession } from "@services/browser/BrowserSession"
import { UrlContentFetcher } from "@services/browser/UrlContentFetcher"
import { listFiles } from "@services/glob/list-files"
import { regexSearchFiles } from "@services/ripgrep"
import { telemetryService } from "@services/telemetry/TelemetryService"
import { parseSourceCodeForDefinitionsTopLevel } from "@services/tree-sitter"
import { ApiConfiguration, ModelInfo } from "@shared/api"
import { findLast, findLastIndex, parsePartialArrayString } from "@shared/array"
import { AutoApprovalSettings } from "@shared/AutoApprovalSettings"
import { BrowserSettings } from "@shared/BrowserSettings"
import { ChatSettings } from "@shared/ChatSettings"
import { combineApiRequests } from "@shared/combineApiRequests"
import { combineCommandSequences, COMMAND_REQ_APP_STRING } from "@shared/combineCommandSequences"
import {
	ApiMetrics,
	BrowserAction,
	BrowserActionResult,
	browserActions,
	ClineApiReqInfo,
	ClineAsk,
	ClineAskQuestion,
	ClineAskUseMcpServer,
	ClineMessage,
	ClinePlanModeResponse,
	ClineSay,
	ClineSayBrowserAction,
	ClineSayTool,
	COMPLETION_RESULT_CHANGES_FLAG,
	ExtensionMessage,
} from "@shared/ExtensionMessage"
import { getApiMetrics } from "@shared/getApiMetrics"
import { HistoryItem } from "@shared/HistoryItem"
import { DEFAULT_LANGUAGE_SETTINGS, getLanguageKey, LanguageDisplay } from "@shared/Languages"
import { ClineAskResponse, ClineCheckpointRestore, WebviewMessage } from "@shared/WebviewMessage"
import { calculateApiCost } from "@utils/cost"
import { fileExistsAtPath } from "@utils/fs"
import { arePathsEqual, getReadablePath, isLocatedInWorkspace } from "@utils/path"
import { fixModelHtmlEscaping, removeInvalidChars } from "@utils/string"
import { AssistantMessageContent, parseAssistantMessage, ToolParamName, ToolUse, ToolUseName } from "@core/assistant-message"
import { constructNewFileContent } from "@core/assistant-message/diff"
import { ClineIgnoreController } from "@core/ignore/ClineIgnoreController"
import { parseMentions } from "@core/mentions"
import { formatResponse } from "@core/prompts/responses"
import { addUserInstructions, SYSTEM_PROMPT } from "@core/prompts/system"
import { getContextWindowInfo } from "@core/context/context-management/context-window-utils"
import { FileContextTracker } from "@core/context/context-tracking/FileContextTracker"
import { ModelContextTracker } from "@core/context/context-tracking/ModelContextTracker"
import {
	checkIsAnthropicContextWindowError,
	checkIsOpenRouterContextWindowError,
} from "@core/context/context-management/context-error-handling"
import { ContextManager } from "@core/context/context-management/ContextManager"
import { loadMcpDocumentation } from "@core/prompts/loadMcpDocumentation"
import {
	ensureRulesDirectoryExists,
	ensureTaskDirectoryExists,
	getSavedApiConversationHistory,
	getSavedClineMessages,
	GlobalFileNames,
	saveApiConversationHistory,
} from "@core/storage/disk"
import {
	getGlobalClineRules,
	getLocalClineRules,
	refreshClineRulesToggles,
} from "../context/instructions/user-instructions/cline-rules"
import { getGlobalState } from "../storage/state"
import { parseSlashCommands } from ".././slash-commands"
import WorkspaceTracker from "../../integrations/workspace/WorkspaceTracker"
import { McpHub } from "../../services/mcp/McpHub"
import { ERROR_DIFF, getTranslation } from "@/locale/locale"
import { updateCost } from "@/utils/llmUtils"
import { getEnvironmentDetails } from "@/utils/EnvironmentDetails"
import { TestWrapper } from "@/services/test/TestMode"
import { resetTimer } from "@/utils/delayUtils"
import { parseJSON, toJSON } from "@/utils/jsonUtils"
import { TaskModel } from "./TaskModel"
import { imageBlocksParam, newText } from "@/utils/anthropicUtils"
import { getTaskDirSize, writeFile } from "@/utils/fsUtils"
import { json } from "node:stream/consumers"

export const cwd =
	vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0) ?? path.join(os.homedir(), "Desktop") // may or may not exist but fs checking existence would immediately ask for permission which would be bad UX, need to come up with a better solution

export const isDesktop = arePathsEqual(cwd, path.join(os.homedir(), "Desktop"))	

export const localeAssistant = getTranslation('pt-br').assistantMessage



export class Task 
{
	public taskModel:TaskModel = new TaskModel()

	// dependencies
	private context: vscode.ExtensionContext
	private mcpHub: McpHub
	private workspaceTracker: WorkspaceTracker
	private updateTaskHistory: (historyItem: HistoryItem) => Promise<HistoryItem[]>
	private postStateToWebview: () => Promise<void>
	private postMessageToWebview: (message: ExtensionMessage) => Promise<void>
	private reinitExistingTaskFromId: (taskId: string) => Promise<void>
	private cancelTask: () => Promise<void>

	readonly taskId: string
	api: ApiHandler
	private terminalManager: TerminalManager
	private urlContentFetcher: UrlContentFetcher
	browserSession: BrowserSession
	contextManager: ContextManager
	private didEditFile: boolean = false
	customInstructions?: string
	autoApprovalSettings: AutoApprovalSettings
	browserSettings: BrowserSettings
	chatSettings: ChatSettings
	
	clineMessages: ClineMessage[] = []
	private clineIgnoreController: ClineIgnoreController

	public askResponse?:WebviewMessage
	
	//private askResponse?: ClineAskResponse
	//private askResponseText?: string
	//private askResponseImages?: string[]
	private lastMessageTs?: number
	private consecutiveAutoApprovedRequestsCount: number = 0
	
	private abort: boolean = false
	didFinishAbortingStream = false
	abandoned = false
	private diffViewProvider: DiffViewProvider
	private checkpointTracker?: CheckpointTracker
	checkpointTrackerErrorMessage?: string
	conversationHistoryDeletedRange?: [number, number]
	isInitialized = false
	isAwaitingPlanResponse = false
	didRespondToPlanAskBySwitchingMode = false

	// Metadata tracking
	private fileContextTracker: FileContextTracker
	private modelContextTracker: ModelContextTracker

	// streaming
	isWaitingForFirstChunk = false
	isStreaming = false
	private currentStreamingContentIndex = 0
	private assistantMessageContent: AssistantMessageContent[] = []
	private presentAssistantMessageLocked = false
	private presentAssistantMessageHasPendingUpdates = false
	private userMessageContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
	private userMessageContentReady = false
	private didRejectTool = false
	private didAlreadyUseTool = false
	private didCompleteReadingStream = false
	private didAutomaticallyRetryFailedApiRequest = false

	public locale = getTranslation('pt-br')
	

	constructor(
		context: vscode.ExtensionContext,
		mcpHub: McpHub,
		workspaceTracker: WorkspaceTracker,
		updateTaskHistory: (historyItem: HistoryItem) => Promise<HistoryItem[]>,
		postStateToWebview: () => Promise<void>,
		postMessageToWebview: (message: ExtensionMessage) => Promise<void>,
		reinitExistingTaskFromId: (taskId: string) => Promise<void>,
		cancelTask: () => Promise<void>,
		apiConfiguration: ApiConfiguration,
		autoApprovalSettings: AutoApprovalSettings,
		browserSettings: BrowserSettings,
		chatSettings: ChatSettings,
		customInstructions?: string,
		task?: string,
		images?: string[],
		historyItem?: HistoryItem,
	) {
		this.context = context
		this.mcpHub = mcpHub
		this.workspaceTracker = workspaceTracker
		this.updateTaskHistory = updateTaskHistory
		this.postStateToWebview = postStateToWebview
		this.postMessageToWebview = postMessageToWebview
		this.reinitExistingTaskFromId = reinitExistingTaskFromId
		this.cancelTask = cancelTask
		this.clineIgnoreController = new ClineIgnoreController(cwd)
		this.terminalManager = new TerminalManager()
		this.urlContentFetcher = new UrlContentFetcher(context)
		this.browserSession = new BrowserSession(context, browserSettings)
		this.contextManager = new ContextManager()
		this.diffViewProvider = new DiffViewProvider()
		this.customInstructions = customInstructions
		this.autoApprovalSettings = autoApprovalSettings
		this.browserSettings = browserSettings
		this.chatSettings = chatSettings

		// Initialize taskId first
		if (historyItem) {
			this.taskId = historyItem.id
			this.conversationHistoryDeletedRange = historyItem.conversationHistoryDeletedRange
		} else if (task || images) {
			this.taskId = Date.now().toString()
		} else {
			throw new Error("Either historyItem or task/images must be provided")
		}

		// Initialize file context tracker
		this.fileContextTracker = new FileContextTracker(context, this.taskId)
		this.modelContextTracker = new ModelContextTracker(context, this.taskId)
		// Now that taskId is initialized, we can build the API handler
		this.api = buildApiHandler({
			...apiConfiguration,
			taskId: this.taskId,
		})

		// Set taskId on browserSession for telemetry tracking
		this.browserSession.setTaskId(this.taskId)

		// Continue with task initialization
		if (historyItem) {
			this.resumeTaskFromHistory()
		} else if (task || images) {
			this.startTask(task, images)
		}

		// initialize telemetry
		if (historyItem) {
			// Open task from history
			telemetryService.captureTaskRestarted(this.taskId, apiConfiguration.apiProvider)
		} else {
			// New task started
			telemetryService.captureTaskCreated(this.taskId, apiConfiguration.apiProvider)
		}
	}

	// While a task is ref'd by a controller, it will always have access to the extension context
	// This error is thrown if the controller derefs the task after e.g., aborting the task
	private getContext(): vscode.ExtensionContext {
		const context = this.context
		if (!context) {
			throw new Error("Unable to access extension context")
		}
		return context
	}

	// Storing task to disk for history
	private async addToApiConversationHistory(message: Anthropic.MessageParam) {
		this.taskModel.apiConversationHistory.push(message)
		await saveApiConversationHistory(this.getContext(), this.taskId, this.taskModel.apiConversationHistory)
	}

	private async overwriteApiConversationHistory(newHistory: Anthropic.MessageParam[]) {
		this.taskModel.apiConversationHistory = newHistory
		await saveApiConversationHistory(this.getContext(), this.taskId, this.taskModel.apiConversationHistory)
	}

	private async addToClineMessages(message: ClineMessage) 
	{
		// these values allow us to reconstruct the conversation history at the time this cline message was created
		// it's important that apiConversationHistory is initialized before we add cline messages
		message.conversationHistoryIndex = this.taskModel.apiConversationHistory.length - 1 // NOTE: this is the index of the last added message which is the user message, and once the clinemessages have been presented we update the apiconversationhistory with the completed assistant message. This means when resetting to a message, we need to +1 this index to get the correct assistant message that this tool use corresponds to
		message.conversationHistoryDeletedRange = this.conversationHistoryDeletedRange
		this.clineMessages.push(message)
		await this.saveClineMessages()
	}

	private async overwriteClineMessages(newMessages: ClineMessage[]) {
		this.clineMessages = newMessages
		await this.saveClineMessages()
	}

	private async saveClineMessages() 
	{
		try 
		{
			await writeFile([this.getContext().globalStorageUri.fsPath, "tasks", this.taskId], GlobalFileNames.uiMessages, this.clineMessages)
			const apiMetrics = getApiMetrics(combineApiRequests(combineCommandSequences(this.clineMessages.slice(1)))) // combined as they are in ChatView
			const firstMessage = this.clineMessages[0] // first message is always the task say
			const lastRelevantMessage = findLast(this.clineMessages, (m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"))
			
			await this.updateTaskHistory({
				id: this.taskId,
				ts: lastRelevantMessage!.ts,
				task: firstMessage.text ?? "", 
				usage: apiMetrics,
				size: await getTaskDirSize([this.getContext().globalStorageUri.fsPath, "tasks", this.taskId]),
				shadowGitConfigWorkTree: await this.checkpointTracker?.getShadowGitConfigWorkTree(),
				conversationHistoryDeletedRange: this.conversationHistoryDeletedRange,
			})
		} catch (error) {}
	}


	async checkRequiredParameters(block:ToolUse, params:ToolParamName[])
	{
		for (const param of params)
		{
			if (!block.params[param])
			{
				this.taskModel.consecutiveMistakeCount++
				this.pushToolResult(block, await this.sayAndCreateMissingParamError("execute_command", param))
				return false
			}
		}
		return true
	}	

    pushToolResult(block:ToolUse, text:string, images?: string[]|string, format:boolean=false)
    {
		const supportsImages = this.api.getModel().info.supportsImages ?? false//the model may not support images, inform
		if (images && images.length > 0 && !supportsImages) 
			text += `\n\n[${images.length} images were provided in the response, and while they are displayed to the user, you do not have the ability to view them.]`
		images = (supportsImages) ? images : undefined // only passes in images if model supports them
        this.userMessageContent.push( newText(`${localeAssistant.toolDescription(block)} Result:`))
        if (format) // Placing images after text leads to better results 
            this.userMessageContent.push(...[newText(text), ...imageBlocksParam(images)] )
        else
			this.userMessageContent.push(newText(text ?? "(tool did not return anything)"))
		this.didAlreadyUseTool = true  // once a tool result has been collected, ignore all other tool uses since we should only ever present one tool result per message
    }


	async restoreCheckpoint(messageTs: number, restoreType: ClineCheckpointRestore, offset?: number)
	 {
		const messageIndex = this.clineMessages.findIndex((m) => m.ts === messageTs) - (offset || 0)
		// Find the last message before messageIndex that has a lastCheckpointHash
		const lastHashIndex = findLastIndex(this.clineMessages.slice(0, messageIndex), (m) => m.lastCheckpointHash !== undefined)
		const message = this.clineMessages[messageIndex]
		const lastMessageWithHash = this.clineMessages[lastHashIndex]

		if (!message) {
			console.error("Message not found", this.clineMessages)
			return
		}

		let didWorkspaceRestoreFail = false

		switch (restoreType) {
			case "task":
				break
			case "taskAndWorkspace":
			case "workspace":
				if (!this.checkpointTracker && !this.checkpointTrackerErrorMessage) {
					try {
						this.checkpointTracker = await CheckpointTracker.create(this.taskId, this.context.globalStorageUri.fsPath)
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : "Unknown error"
						console.error("Failed to initialize checkpoint tracker:", errorMessage)
						this.checkpointTrackerErrorMessage = errorMessage
						await this.postStateToWebview()
						vscode.window.showErrorMessage(errorMessage)
						didWorkspaceRestoreFail = true
					}
				}
				if (message.lastCheckpointHash && this.checkpointTracker) {
					try {
						await this.checkpointTracker.resetHead(message.lastCheckpointHash)
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : "Unknown error"
						vscode.window.showErrorMessage("Failed to restore checkpoint: " + errorMessage)
						didWorkspaceRestoreFail = true
					}
				} else if (offset && lastMessageWithHash.lastCheckpointHash && this.checkpointTracker) {
					try {
						await this.checkpointTracker.resetHead(lastMessageWithHash.lastCheckpointHash)
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : "Unknown error"
						vscode.window.showErrorMessage("Failed to restore offsetcheckpoint: " + errorMessage)
						didWorkspaceRestoreFail = true
					}
				}
				break
		}

		if (!didWorkspaceRestoreFail) {
			switch (restoreType) {
				case "task":
				case "taskAndWorkspace":
					this.conversationHistoryDeletedRange = message.conversationHistoryDeletedRange
					const newConversationHistory = this.taskModel.apiConversationHistory.slice(
						0,
						(message.conversationHistoryIndex || 0) + 2,
					) // +1 since this index corresponds to the last user message, and another +1 since slice end index is exclusive
					await this.overwriteApiConversationHistory(newConversationHistory)

					// update the context history state
					await this.contextManager.truncateContextHistory(
						message.ts,
						await ensureTaskDirectoryExists(this.getContext(), this.taskId),
					)

					// aggregate deleted api reqs info so we don't lose costs/tokens
					const deletedMessages = this.clineMessages.slice(messageIndex + 1)
					const deletedApiReqsMetrics = getApiMetrics(combineApiRequests(combineCommandSequences(deletedMessages)))

					const newClineMessages = this.clineMessages.slice(0, messageIndex + 1)
					await this.overwriteClineMessages(newClineMessages) // calls saveClineMessages which saves historyItem

					await this.say(
						"deleted_api_reqs",
						JSON.stringify({usage:deletedApiReqsMetrics} satisfies ClineApiReqInfo),
					)
					break
				case "workspace":
					break
			}

			switch (restoreType) {
				case "task":
					vscode.window.showInformationMessage("Task messages have been restored to the checkpoint")
					break
				case "workspace":
					vscode.window.showInformationMessage("Workspace files have been restored to the checkpoint")
					break
				case "taskAndWorkspace":
					vscode.window.showInformationMessage("Task and workspace have been restored to the checkpoint")
					break
			}

			if (restoreType !== "task") {
				// Set isCheckpointCheckedOut flag on the message
				// Find all checkpoint messages before this one
				const checkpointMessages = this.clineMessages.filter((m) => m.say === "checkpoint_created")
				const currentMessageIndex = checkpointMessages.findIndex((m) => m.ts === messageTs)

				// Set isCheckpointCheckedOut to false for all checkpoint messages
				checkpointMessages.forEach((m, i) => {
					m.isCheckpointCheckedOut = i === currentMessageIndex
				})
			}

			await this.saveClineMessages()

			await this.postMessageToWebview({ type: "relinquishControl" })

			this.cancelTask() // the task is already cancelled by the provider beforehand, but we need to re-init to get the updated messages
		} else {
			await this.postMessageToWebview({ type: "relinquishControl" })
		}
	}

	async presentMultifileDiff(messageTs: number, seeNewChangesSinceLastTaskCompletion: boolean) {
		const relinquishButton = () => {
			this.postMessageToWebview({ type: "relinquishControl" })
		}

		console.log("presentMultifileDiff", messageTs)
		const messageIndex = this.clineMessages.findIndex((m) => m.ts === messageTs)
		const message = this.clineMessages[messageIndex]
		if (!message) {
			console.error("Message not found")
			relinquishButton()
			return
		}
		const hash = message.lastCheckpointHash
		if (!hash) {
			console.error("No checkpoint hash found")
			relinquishButton()
			return
		}

		// TODO: handle if this is called from outside original workspace, in which case we need to show user error message we can't show diff outside of workspace?
		if (!this.checkpointTracker && !this.checkpointTrackerErrorMessage) {
			try {
				this.checkpointTracker = await CheckpointTracker.create(this.taskId, this.context.globalStorageUri.fsPath)
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error"
				console.error("Failed to initialize checkpoint tracker:", errorMessage)
				this.checkpointTrackerErrorMessage = errorMessage
				await this.postStateToWebview()
				vscode.window.showErrorMessage(errorMessage)
				relinquishButton()
				return
			}
		}

		let changedFiles:
			| {
					relativePath: string
					absolutePath: string
					before: string
					after: string
			  }[]
			| undefined

		try {
			if (seeNewChangesSinceLastTaskCompletion) {
				// Get last task completed
				const lastTaskCompletedMessageCheckpointHash = findLast(
					this.clineMessages.slice(0, messageIndex),
					(m) => m.say === "completion_result",
				)?.lastCheckpointHash // ask is only used to relinquish control, its the last say we care about
				// if undefined, then we get diff from beginning of git
				// if (!lastTaskCompletedMessage) {
				// 	console.error("No previous task completion message found")
				// 	return
				// }
				// This value *should* always exist
				const firstCheckpointMessageCheckpointHash = this.clineMessages.find(
					(m) => m.say === "checkpoint_created",
				)?.lastCheckpointHash

				const previousCheckpointHash = lastTaskCompletedMessageCheckpointHash || firstCheckpointMessageCheckpointHash // either use the diff between the first checkpoint and the task completion, or the diff between the latest two task completions

				if (!previousCheckpointHash) {
					vscode.window.showErrorMessage("Unexpected error: No checkpoint hash found")
					relinquishButton()
					return
				}

				// Get changed files between current state and commit
				changedFiles = await this.checkpointTracker?.getDiffSet(previousCheckpointHash, hash)
				if (!changedFiles?.length) {
					vscode.window.showInformationMessage("No changes found")
					relinquishButton()
					return
				}
			} else {
				// Get changed files between current state and commit
				changedFiles = await this.checkpointTracker?.getDiffSet(hash)
				if (!changedFiles?.length) {
					vscode.window.showInformationMessage("No changes found")
					relinquishButton()
					return
				}
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error"
			vscode.window.showErrorMessage("Failed to retrieve diff set: " + errorMessage)
			relinquishButton()
			return
		}

		// Check if multi-diff editor is enabled in VS Code settings
		// const config = vscode.workspace.getConfiguration()
		// const isMultiDiffEnabled = config.get("multiDiffEditor.experimental.enabled")

		// if (!isMultiDiffEnabled) {
		// 	vscode.window.showErrorMessage(
		// 		"Please enable 'multiDiffEditor.experimental.enabled' in your VS Code settings to use this feature.",
		// 	)
		// 	relinquishButton()
		// 	return
		// }
		// Open multi-diff editor
		await vscode.commands.executeCommand(
			"vscode.changes",
			seeNewChangesSinceLastTaskCompletion ? "New changes" : "Changes since snapshot",
			changedFiles.map((file) => [
				vscode.Uri.file(file.absolutePath),
				vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${file.relativePath}`).with({
					query: Buffer.from(file.before ?? "").toString("base64"),
				}),
				vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${file.relativePath}`).with({
					query: Buffer.from(file.after ?? "").toString("base64"),
				}),
			]),
		)
		relinquishButton()
	}

	async doesLatestTaskCompletionHaveNewChanges() 
	{
		const messageIndex = findLastIndex(this.clineMessages, (m) => m.say === "completion_result")
		const message = this.clineMessages[messageIndex]
		if (!message) {
			console.error("Completion message not found")
			return false
		}
		const hash = message.lastCheckpointHash
		if (!hash) {
			console.error("No checkpoint hash found")
			return false
		}

		if (!this.checkpointTracker && !this.checkpointTrackerErrorMessage) {
			try {
				this.checkpointTracker = await CheckpointTracker.create(this.taskId, this.context.globalStorageUri.fsPath)
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error"
				console.error("Failed to initialize checkpoint tracker:", errorMessage)
				return false
			}
		}

		// Get last task completed
		const lastTaskCompletedMessage = findLast(this.clineMessages.slice(0, messageIndex), (m) => m.say === "completion_result")

		try {
			// Get last task completed
			const lastTaskCompletedMessageCheckpointHash = lastTaskCompletedMessage?.lastCheckpointHash // ask is only used to relinquish control, its the last say we care about
			// if undefined, then we get diff from beginning of git
			// if (!lastTaskCompletedMessage) {
			// 	console.error("No previous task completion message found")
			// 	return
			// }
			// This value *should* always exist
			const firstCheckpointMessageCheckpointHash = this.clineMessages.find(
				(m) => m.say === "checkpoint_created",
			)?.lastCheckpointHash

			const previousCheckpointHash = lastTaskCompletedMessageCheckpointHash || firstCheckpointMessageCheckpointHash // either use the diff between the first checkpoint and the task completion, or the diff between the latest two task completions

			if (!previousCheckpointHash) {
				return false
			}

			// Get count of changed files between current state and commit
			const changedFilesCount = (await this.checkpointTracker?.getDiffCount(previousCheckpointHash, hash)) || 0
			if (changedFilesCount > 0) {
				return true
			}
		} catch (error) {
			console.error("Failed to get diff set:", error)
			return false
		}

		return false
	}

	// Communicate with webview

	async ask(type: ClineAsk, text?: string, partial?: boolean, remove?:boolean):Promise<WebviewMessage | undefined>
	{
		if(remove)
			this.removeLastPartialMessageIfExistsWithType("say", type)

		let askTs: number = Date.now()
		const lastMessage = this.clineMessages.at(-1)
		const isUpdatingPreviousPartial = lastMessage && lastMessage.partial && lastMessage.type === "ask" && lastMessage.ask === type
		if (partial === true)
		{
			if (isUpdatingPreviousPartial)// existing partial message, so update it
				this.updateLastMessage(text, undefined, partial)
			else// this is a new partial message, so add it with partial state
				await this.storeMessageAndSendToView({ ts:askTs, type:"ask", ask:type, text, partial })
			return this.askResponse
		}
		else
		{
			this.askResponse = undefined
			if (isUpdatingPreviousPartial && partial === false) // partial=false means its a complete version of a previously partial message
			{
				askTs = lastMessage.ts //Bug: The message `ts` is used as the chatrow key, but updating it causes flickering due to React's key reconciliation. To avoid `ts` should remain stable once set.
				this.updateLastMessage(text, undefined, partial, Date.now())
			}
			else // this is a new non-partial message, or a non partial message, so add it like normal
			{
				await this.storeMessageAndSendToView({ ts: askTs, type: "ask", ask: type, text })
			}
	
			await pWaitFor(() => this.askResponse !== undefined || this.lastMessageTs !== askTs, { interval: 100 })

			const result = this.askResponse
			this.askResponse = undefined

			return result
		}
	}

	async handleWebviewAskResponse(askResponse: ClineAskResponse, text?: string, images?: string[]) 
	{
		this.askResponse = {type:'askResponse', askResponse:askResponse, text, images}
	}


	// The user can approve, reject, or provide feedback (rejection). However the user may also send a message along with an approval, in which case we add a separate user message with this feedback.
	pushAdditionalToolFeedback (feedback?: string, images?: string[]) 
	{

		if (!feedback && !images) 
			return
		
		const content = toolResult(`The user provided the following feedback:\n<feedback>\n${feedback}\n</feedback>`, images)
		if (typeof content === "string") 
			this.userMessageContent.push({type: "text", text: content})
		else 
			this.userMessageContent.push(...content)

	}

	public async storeMessageAndSendToView(message:ClineMessage)
	{
		this.lastMessageTs = message.ts
		this.addToClineMessages(message)
		await this.postStateToWebview()
		return message
	}

	async say(type: ClineSay, data?: string | object, images?: string[], partial?: boolean, remove?:boolean)
	{
		if(remove)
			this.removeLastPartialMessageIfExistsWithType("ask", type)

		const text:string = (typeof data === "object" && data !== null) ? JSON.stringify(data) : data as string || ''
        const lastMessage = this.clineMessages.at(-1)
        const isUpdatingPreviousPartial = lastMessage && lastMessage.partial && lastMessage.type === "say" && lastMessage.say === type
		if (isUpdatingPreviousPartial) // existing partial message, so update it
			return this.updateLastMessage(text, images, partial)
		else // new message
            return await this.storeMessageAndSendToView({ ts: Date.now(), type: "say", say: type, text, images, partial })
	}

	async sayAndCreateMissingParamError(toolName: ToolUseName, paramName: string, relPath?: string) 
	{
		await this.say("error", localeAssistant.missingParamError(toolName, paramName, relPath))
		return localeAssistant.missingToolParameterError(paramName)
	}

	async removeLastPartialMessageIfExistsWithType(type: "ask" | "say", askOrSay: ClineAsk | ClineSay) 
	{
		const lastMessage = this.clineMessages.at(-1)
		if (lastMessage?.partial && lastMessage.type === type && (lastMessage.ask === askOrSay || lastMessage.say === askOrSay)) 
		{
			this.clineMessages.pop()
			await this.saveClineMessages()
			await this.postStateToWebview()
		}
	}

	async updateLastMessage(text?:string, images?:string[], partial?:boolean, newTs?:number)
	{
		const lastMessage = this.clineMessages.at(-1)!
		lastMessage.text = text
		lastMessage.images = images
		lastMessage.partial = partial

		this.lastMessageTs = newTs ?? (partial) ? this.lastMessageTs : lastMessage.ts

		if (!partial) //complete message, save to disk
            await this.saveClineMessages() // instead of streaming partialMessage events, we do a save and post like normal to persist to disk

		await this.postMessageToWebview({ type: "partialMessage", partialMessage: lastMessage })
		return lastMessage
	}	
	// Task lifecycle

	private async startTask(task?: string, images?: string[]): Promise<void> {
		// conversationHistory (for API) and clineMessages (for webview) need to be in sync
		// if the extension process were killed, then on restart the clineMessages might not be empty, so we need to set it to [] when we create a new Cline client (otherwise webview would show stale messages from previous session)
		this.clineMessages = []
		this.taskModel.apiConversationHistory = []

		await this.postStateToWebview()

		await this.say("text", task, images)

		this.isInitialized = true

		let imageBlocks: Anthropic.ImageBlockParam[] = formatResponse.imageBlocks(images)
		await this.initiateTaskLoop([
			{
				type: "text",
				text: `<task>\n${task}\n</task>`,
			},
			...imageBlocks,
		])
	}

	private async resumeTaskFromHistory() {
		// UPDATE: we don't need this anymore since most tasks are now created with checkpoints enabled
		// right now we let users init checkpoints for old tasks, assuming they're continuing them from the same workspace (which we never tied to tasks, so no way for us to know if it's opened in the right workspace)
		// const doesShadowGitExist = await CheckpointTracker.doesShadowGitExist(this.taskId, this.controllerRef.deref())
		// if (!doesShadowGitExist) {
		// 	this.checkpointTrackerErrorMessage = "Checkpoints are only available for new tasks"
		// }

		const modifiedClineMessages = await getSavedClineMessages(this.getContext(), this.taskId)

		// Remove any resume messages that may have been added before
		const lastRelevantMessageIndex = findLastIndex(
			modifiedClineMessages,
			(m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"),
		)
		if (lastRelevantMessageIndex !== -1) {
			modifiedClineMessages.splice(lastRelevantMessageIndex + 1)
		}

		// since we don't use api_req_finished anymore, we need to check if the last api_req_started has a cost value, if it doesn't and no cancellation reason to present, then we remove it since it indicates an api request without any partial content streamed
		const lastApiReqStartedIndex = findLastIndex(
			modifiedClineMessages,
			(m) => m.type === "say" && m.say === "api_req_started",
		)
		if (lastApiReqStartedIndex !== -1) {
			const lastApiReqStarted = modifiedClineMessages[lastApiReqStartedIndex]
			const { usage, failedReason: cancelReason }: ClineApiReqInfo = JSON.parse(lastApiReqStarted.text || "{}")
			if (usage?.cost === undefined && cancelReason === undefined) {
				modifiedClineMessages.splice(lastApiReqStartedIndex, 1)
			}
		}

		await this.overwriteClineMessages(modifiedClineMessages)
		this.clineMessages = await getSavedClineMessages(this.getContext(), this.taskId)

		// Now present the cline messages to the user and ask if they want to resume (NOTE: we ran into a bug before where the apiconversationhistory wouldn't be initialized when opening a old task, and it was because we were waiting for resume)
		// This is important in case the user deletes messages without resuming the task first
		this.taskModel.apiConversationHistory = await getSavedApiConversationHistory(this.getContext(), this.taskId)

		// load the context history state
		await this.contextManager.initializeContextHistory(await ensureTaskDirectoryExists(this.getContext(), this.taskId))

		const lastClineMessage = this.clineMessages
			.slice()
			.reverse()
			.find((m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task")) // could be multiple resume tasks

		let askType: ClineAsk
		if (lastClineMessage?.ask === "completion_result") {
			askType = "resume_completed_task"
		} else {
			askType = "resume_task"
		}

		this.isInitialized = true

		const response = await this.ask(askType) // calls poststatetowebview

		if (response?.askResponse === "message") 
			await this.say("user_feedback", response.text, response.images)
		

		// need to make sure that the api conversation history can be resumed by the api, even if it goes out of sync with cline messages

		const existingApiConversationHistory: Anthropic.Messages.MessageParam[] = await getSavedApiConversationHistory(
			this.getContext(),
			this.taskId,
		)

		// Remove the last user message so we can update it with the resume message
		let modifiedOldUserContent: Anthropic.ContentBlockParam[] // either the last message if its user message, or the user message before the last (assistant) message
		let modifiedApiConversationHistory: Anthropic.Messages.MessageParam[] // need to remove the last user message to replace with new modified user message
		if (existingApiConversationHistory.length > 0) {
			const lastMessage = existingApiConversationHistory[existingApiConversationHistory.length - 1]
			if (lastMessage.role === "assistant") {
				modifiedApiConversationHistory = [...existingApiConversationHistory]
				modifiedOldUserContent = []
			} else if (lastMessage.role === "user") {
				const existingUserContent: Anthropic.ContentBlockParam[] = Array.isArray(lastMessage.content)
					? lastMessage.content
					: [{ type: "text", text: lastMessage.content }]
				modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
				modifiedOldUserContent = [...existingUserContent]
			} else {
				throw new Error("Unexpected: Last message is not a user or assistant message")
			}
		} else {
			throw new Error("Unexpected: No existing API conversation history")
		}

		let newUserContent: Anthropic.ContentBlockParam[] = [...modifiedOldUserContent]

		const agoText = (() => {
			const timestamp = lastClineMessage?.ts ?? Date.now()
			const now = Date.now()
			const diff = now - timestamp
			const minutes = Math.floor(diff / 60000)
			const hours = Math.floor(minutes / 60)
			const days = Math.floor(hours / 24)

			if (days > 0) {
				return `${days} day${days > 1 ? "s" : ""} ago`
			}
			if (hours > 0) {
				return `${hours} hour${hours > 1 ? "s" : ""} ago`
			}
			if (minutes > 0) {
				return `${minutes} minute${minutes > 1 ? "s" : ""} ago`
			}
			return "just now"
		})()

		const wasRecent = lastClineMessage?.ts && Date.now() - lastClineMessage.ts < 30_000

		const [taskResumptionMessage, userResponseMessage] = formatResponse.taskResumption(
			this.chatSettings?.mode === "plan" ? "plan" : "act",
			agoText,
			wasRecent,
			response?.text,
		)

		if (taskResumptionMessage !== "") 
			newUserContent.push({type: "text", text: taskResumptionMessage})
		

		if (userResponseMessage !== "") 
			newUserContent.push({type: "text", text: userResponseMessage})
		

		if (response?.images && response?.images.length > 0) 
			newUserContent.push(...formatResponse.imageBlocks(response?.images))
		

		await this.overwriteApiConversationHistory(modifiedApiConversationHistory)
		await this.initiateTaskLoop(newUserContent)
	}

	private async initiateTaskLoop(userContent: Anthropic.ContentBlockParam[]): Promise<void> 
	{
		let nextUserContent = userContent
		let includeFileDetails = true
		while (!this.abort) {
			const didEndLoop = await this.recursivelyMakeClineRequests(nextUserContent, includeFileDetails)
			includeFileDetails = false // we only need file details the first time

			//  The way this agentic loop works is that cline will be given a task that he then calls tools to complete. unless there's an attempt_completion call, we keep responding back to him with his tool's responses until he either attempt_completion or does not use anymore tools. If he does not use anymore tools, we ask him to consider if he's completed the task and then call attempt_completion, otherwise proceed with completing the task.
			// There is a MAX_REQUESTS_PER_TASK limit to prevent infinite requests, but Cline is prompted to finish the task as efficiently as he can.

			//const totalCost = this.calculateApiCost(totalInputTokens, totalOutputTokens)
			if (didEndLoop) {
				// For now a task never 'completes'. This will only happen if the user hits max requests and denies resetting the count.
				//this.say("task_completed", `Task completed. Total API usage cost: ${totalCost}`)
				break
			} else {
				// this.say(
				// 	"tool",
				// 	"Cline responded with only text blocks but has not called attempt_completion yet. Forcing him to continue with task..."
				// )
				nextUserContent = [
					{
						type: "text",
						text: this.locale.cline.noToolsUsed(),
					},
				]
				this.taskModel.consecutiveMistakeCount++
			}
		}
	}

	async abortTask() {
		this.abort = true // will stop any autonomously running promises
		this.terminalManager.disposeAll()
		this.urlContentFetcher.closeBrowser()
		await this.browserSession.dispose()
		this.clineIgnoreController.dispose()
		this.fileContextTracker.dispose()
		await this.diffViewProvider.revertChanges() // need to await for when we want to make sure directories/files are reverted before re-starting the task from a checkpoint
	}

	// Checkpoints

	async saveCheckpoint(isAttemptCompletionMessage: boolean = false) {
		// Set isCheckpointCheckedOut to false for all checkpoint_created messages
		this.clineMessages.forEach((message) => {
			if (message.say === "checkpoint_created") {
				message.isCheckpointCheckedOut = false
			}
		})

		if (!isAttemptCompletionMessage) {
			// ensure we aren't creating a duplicate checkpoint
			const lastMessage = this.clineMessages.at(-1)
			if (lastMessage?.say === "checkpoint_created") {
				return
			}

			// For non-attempt completion we just say checkpoints
			await this.say("checkpoint_created")
			this.checkpointTracker?.commit().then(async (commitHash) => {
				const lastCheckpointMessage = findLast(this.clineMessages, (m) => m.say === "checkpoint_created")
				if (lastCheckpointMessage) {
					lastCheckpointMessage.lastCheckpointHash = commitHash
					await this.saveClineMessages()
				}
			}) // silently fails for now

			//
		} else {
			// attempt completion requires checkpoint to be sync so that we can present button after attempt_completion
			const commitHash = await this.checkpointTracker?.commit()
			// For attempt_completion, find the last completion_result message and set its checkpoint hash. This will be used to present the 'see new changes' button
			const lastCompletionResultMessage = findLast(
				this.clineMessages,
				(m) => m.say === "completion_result" || m.ask === "completion_result",
			)
			if (lastCompletionResultMessage) {
				lastCompletionResultMessage.lastCheckpointHash = commitHash
				await this.saveClineMessages()
			}
		}


	}

	// Tools
	async executeCommandTool(command: string): Promise<{text:string, images?:string[]} | string> 
	{
		const terminalInfo = await this.terminalManager.getOrCreateTerminal(cwd)
		terminalInfo.terminal.show() // weird visual bug when creating new terminals (even manually) where there's an empty space at the top.
		const process = this.terminalManager.prepareCommand(terminalInfo, command)

		let userFeedback: { text?: string; images?: string[] } | undefined
		let firstRun = true
		let result = ""
		let completed = false

		let outputBuffer: string[] = []
		let outputBufferSize: number = 0
		let chunkTimer: NodeJS.Timeout | undefined = undefined

		process.on("line", (line) => onLineReceived(this, line))
        process.once("completed", () => completed = true)
		process.once("no_shell_integration", async () => await this.say("shell_integration_warning"))

		const fullOutput = await process.run()

		await delay(50) // Wait for a short delay to ensure all messages are sent to the webview

		result = result.trim()

		if (userFeedback) 
		{
			await this.say("user_feedback", userFeedback.text, userFeedback.images)
			return {text: localeAssistant.userFeedback(result, userFeedback.text), images:userFeedback.images} 
		}

		return (completed) ? localeAssistant.commandExecuted(result) : localeAssistant.commandRunning(result, true)


		async function onLineReceived (task:Task, line: string): Promise<void>
		{
			result += line + "\n"
            if (firstRun) 
			{
				outputBuffer.push(line)
				outputBufferSize += Buffer.byteLength(line, "utf8")
				// Flush if buffer is large enough, then delay to zero
				let delay = (outputBuffer.length >= 20 || outputBufferSize >= 2048 /*2k*/) ? 0 : 100 //delay 100 ms if buffer less than 2kb or 20 line
				chunkTimer = resetTimer(chunkTimer, () => sendToWebView(task), delay)
			}
			else
			{
				task.say("command_output", line)
			}

			async function sendToWebView (task:Task) 
			{
				if (outputBuffer.length > 0)
				{
					firstRun = false
					const chunk = outputBuffer.join("\n")
					const response = await task.ask("command_output", chunk)
					if (response?.askResponse !== "yes") 
						userFeedback = { text:response?.text, images:response?.images }
					process.continue()
				}
			}
		}
	}


	private formatErrorWithStatusCode(error: any): string 
	{
		const statusCode = error.status || error.statusCode || (error.response && error.response.status)
		const message = error.message ?? JSON.stringify(serializeError(error), null, 2)

		// Only prepend the statusCode if it's not already part of the message
		return statusCode && !message.includes(statusCode.toString()) ? `${statusCode} - ${message}` : message
	}

	async handleError(block:ToolUse, error: Error) 
	{
		if (!this.abandoned) 
		{
			const action: string = localeAssistant.titles[block.name]
			await this.say("error", localeAssistant.defaultErrorFormatted(action, error))
			this.pushToolResult(block, localeAssistant.defaultError(action, error))
		}
		
		if (block.name === "write_to_file" || block.name === "replace_in_file")
		{
			await this.diffViewProvider.revertChanges()
			await this.diffViewProvider.reset()
		}
	}

	async handleWriteOrReplaceFile(block:ToolUse) 
	{

	}
		
	async *attemptApiRequest(previousApiReqIndex: number): ApiStream 
	{
		// Wait for MCP servers to be connected before generating system prompt
		await pWaitFor(() => this.mcpHub.isConnecting !== true, { timeout: 10_000 }).catch(() => {
			console.error("MCP servers failed to connect in time")
		})

		const disableBrowserTool = vscode.workspace.getConfiguration("cline").get<boolean>("disableBrowserTool") ?? false
		// cline browser tool uses image recognition for navigation (requires model image support).
		const modelSupportsBrowserUse = this.api.getModel().info.supportsImages ?? false

		const supportsBrowserUse = modelSupportsBrowserUse && !disableBrowserTool // only enable browser use if the model supports it and the user hasn't disabled it

		let systemPrompt = await SYSTEM_PROMPT(cwd, supportsBrowserUse, this.mcpHub, this.browserSettings)

		let settingsCustomInstructions = this.customInstructions?.trim()
		const preferredLanguage = getLanguageKey(
			vscode.workspace.getConfiguration("cline").get<LanguageDisplay>("preferredLanguage"),
		)
		const preferredLanguageInstructions =
			preferredLanguage && preferredLanguage !== DEFAULT_LANGUAGE_SETTINGS
				? `# Preferred Language\n\nSpeak in ${preferredLanguage}.`
				: ""

		const { globalToggles, localToggles } = await refreshClineRulesToggles(this.getContext(), cwd)

		const globalClineRulesFilePath = await ensureRulesDirectoryExists()
		const globalClineRulesFileInstructions = await getGlobalClineRules(globalClineRulesFilePath, globalToggles)

		const localClineRulesFileInstructions = await getLocalClineRules(cwd, localToggles)

		const clineIgnoreContent = this.clineIgnoreController.clineIgnoreContent
		let clineIgnoreInstructions: string | undefined
		if (clineIgnoreContent) {
			clineIgnoreInstructions = localeAssistant.clineIgnoreInstructions(clineIgnoreContent)
		}

		if (
			settingsCustomInstructions ||
			globalClineRulesFileInstructions ||
			localClineRulesFileInstructions ||
			clineIgnoreInstructions ||
			preferredLanguageInstructions
		) {
			// altering the system prompt mid-task will break the prompt cache, but in the grand scheme this will not change often so it's better to not pollute user messages with it the way we have to with <potentially relevant details>
			systemPrompt += addUserInstructions(
				settingsCustomInstructions,
				globalClineRulesFileInstructions,
				localClineRulesFileInstructions,
				clineIgnoreInstructions,
				preferredLanguageInstructions,
			)
		}
		const contextManagementMetadata = await this.contextManager.getNewContextMessagesAndMetadata(
			this.taskModel.apiConversationHistory,
			this.clineMessages,
			this.api,
			this.conversationHistoryDeletedRange,
			previousApiReqIndex,
			await ensureTaskDirectoryExists(this.getContext(), this.taskId),
		)

		if (contextManagementMetadata.updatedConversationHistoryDeletedRange) {
			this.conversationHistoryDeletedRange = contextManagementMetadata.conversationHistoryDeletedRange
			await this.saveClineMessages() // saves task history item which we use to keep track of conversation history deleted range
		}

		let stream = this.api.createMessage(systemPrompt, contextManagementMetadata.truncatedConversationHistory)

		const iterator = stream[Symbol.asyncIterator]()

		try {
			// awaiting first chunk to see if it will throw an error
			this.isWaitingForFirstChunk = true
			const firstChunk = await iterator.next()
			yield firstChunk.value
			this.isWaitingForFirstChunk = false
		} catch (error) {
			const isOpenRouter = this.api instanceof OpenRouterHandler || this.api instanceof ClineHandler
			const isAnthropic = this.api instanceof AnthropicHandler
			const isOpenRouterContextWindowError = checkIsOpenRouterContextWindowError(error) && isOpenRouter
			const isAnthropicContextWindowError = checkIsAnthropicContextWindowError(error) && isAnthropic

			if (isAnthropic && isAnthropicContextWindowError && !this.didAutomaticallyRetryFailedApiRequest) {
				this.conversationHistoryDeletedRange = this.contextManager.getNextTruncationRange(
					this.taskModel.apiConversationHistory,
					this.conversationHistoryDeletedRange,
					"quarter", // Force aggressive truncation
				)
				await this.saveClineMessages()

				this.didAutomaticallyRetryFailedApiRequest = true
			} else if (isOpenRouter && !this.didAutomaticallyRetryFailedApiRequest) {
				if (isOpenRouterContextWindowError) {
					this.conversationHistoryDeletedRange = this.contextManager.getNextTruncationRange(
						this.taskModel.apiConversationHistory,
						this.conversationHistoryDeletedRange,
						"quarter", // Force aggressive truncation
					)
					await this.saveClineMessages()
				}

				console.log("first chunk failed, waiting 1 second before retrying")
				await delay(1000)
				this.didAutomaticallyRetryFailedApiRequest = true
			} else {
				// request failed after retrying automatically once, ask user if they want to retry again
				// note that this api_req_failed ask is unique in that we only present this option if the api hasn't streamed any content yet (ie it fails on the first chunk due), as it would allow them to hit a retry button. However if the api failed mid-stream, it could be in any arbitrary state where some tools may have executed, so that error is handled differently and requires cancelling the task entirely.

				if (isOpenRouterContextWindowError || isAnthropicContextWindowError) {
					const truncatedConversationHistory = this.contextManager.getTruncatedMessages(
						this.taskModel.apiConversationHistory,
						this.conversationHistoryDeletedRange,
					)

					// If the conversation has more than 3 messages, we can truncate again. If not, then the conversation is bricked.
					// ToDo: Allow the user to change their input if this is the case.
					if (truncatedConversationHistory.length > 3) {
						error = new Error("Context window exceeded. Click retry to truncate the conversation and try again.")
						this.didAutomaticallyRetryFailedApiRequest = false
					}
				}

				const errorMessage = this.formatErrorWithStatusCode(error)

				const response = await this.ask("api_req_failed", errorMessage)

				if (response?.askResponse !== "yes") {
					// this will never happen since if noButtonClicked, we will clear current task, aborting this instance
					throw new Error("API request failed")
				}

				await this.say("api_req_retried")
			}
			// delegate generator output from the recursive call
			yield* this.attemptApiRequest(previousApiReqIndex)
			return
		}

		// no error, so we can continue to yield all remaining chunks
		// (needs to be placed outside of try/catch since it we want caller to handle errors not with api_req_failed as that is reserved for first chunk failures only)
		// this delegates to another generator or iterable object. In this case, it's saying "yield all remaining values from this iterator". This effectively passes along all subsequent chunks from the original stream.
		yield* iterator
	}

	
	async askApproval (block:ToolUse, type: ClineAsk, partialMessage?: string, remove?:boolean) 
	{
		const response = await this.ask(type, partialMessage, false, remove)
		if (response?.askResponse === "yes")  // User hit the approve button, and may have provided feedback
			return true

		if (response?.askResponse === 'message') 
		{
			this.pushToolResult(block, localeAssistant.reponseWithFeedback(response?.text), response?.images, true)
			await this.say("user_feedback", response?.text, response?.images)
		}
		else // User pressed reject button or responded with a message, which we treat as a rejection 
		{
			this.pushToolResult(block, localeAssistant.toolDenied)
			this.didRejectTool = true // Prevent further tool uses in this message
		}
		return false
	}





	async presentAssistantMessage() {
		if (this.abort) {
			throw new Error("Cline instance aborted")
		}

		if (this.presentAssistantMessageLocked) {
			this.presentAssistantMessageHasPendingUpdates = true
			return
		}
		this.presentAssistantMessageLocked = true
		this.presentAssistantMessageHasPendingUpdates = false

		if (this.currentStreamingContentIndex >= this.assistantMessageContent.length) {
			// this may happen if the last content block was completed before streaming could finish. if streaming is finished, and we're out of bounds then this means we already presented/executed the last content block and are ready to continue to next request
			if (this.didCompleteReadingStream) {
				this.userMessageContentReady = true
			}
			// console.log("no more content blocks to stream! this shouldn't happen?")
			this.presentAssistantMessageLocked = false
			return
			//throw new Error("No more content blocks to stream! This shouldn't happen...") // remove and just return after testing
		}

		const block = cloneDeep(this.assistantMessageContent[this.currentStreamingContentIndex]) // need to create copy bc while stream is updating the array, it could be updating the reference block properties too
		switch (block.type) {
			case "text": {
				if (this.didRejectTool || this.didAlreadyUseTool) {
					break
				}
				let content = block.content
				if (content) {
					// (have to do this for partial and complete since sending content in thinking tags to markdown renderer will automatically be removed)
					// Remove end substrings of <thinking or </thinking (below xml parsing is only for opening tags)
					// (this is done with the xml parsing below now, but keeping here for reference)
					// content = content.replace(/<\/?t(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?)?)?)?)?$/, "")
					// Remove all instances of <thinking> (with optional line break after) and </thinking> (with optional line break before)
					// - Needs to be separate since we dont want to remove the line break before the first tag
					// - Needs to happen before the xml parsing below
					content = content.replace(/<thinking>\s?/g, "")
					content = content.replace(/\s?<\/thinking>/g, "")

					// Remove partial XML tag at the very end of the content (for tool use and thinking tags)
					// (prevents scrollview from jumping when tags are automatically removed)
					const lastOpenBracketIndex = content.lastIndexOf("<")
					if (lastOpenBracketIndex !== -1) {
						const possibleTag = content.slice(lastOpenBracketIndex)
						// Check if there's a '>' after the last '<' (i.e., if the tag is complete) (complete thinking and tool tags will have been removed by now)
						const hasCloseBracket = possibleTag.includes(">")
						if (!hasCloseBracket) {
							// Extract the potential tag name
							let tagContent: string
							if (possibleTag.startsWith("</")) {
								tagContent = possibleTag.slice(2).trim()
							} else {
								tagContent = possibleTag.slice(1).trim()
							}
							// Check if tagContent is likely an incomplete tag name (letters and underscores only)
							const isLikelyTagName = /^[a-zA-Z_]+$/.test(tagContent)
							// Preemptively remove < or </ to keep from these artifacts showing up in chat (also handles closing thinking tags)
							const isOpeningOrClosing = possibleTag === "<" || possibleTag === "</"
							// If the tag is incomplete and at the end, remove it from the content
							if (isOpeningOrClosing || isLikelyTagName) {
								content = content.slice(0, lastOpenBracketIndex).trim()
							}
						}
					}
				}

				if (!block.partial) {
					// Some models add code block artifacts (around the tool calls) which show up at the end of text content
					// matches ``` with at least one char after the last backtick, at the end of the string
					const match = content?.trimEnd().match(/```[a-zA-Z0-9_-]+$/)
					if (match) {
						const matchLength = match[0].length
						content = content.trimEnd().slice(0, -matchLength)
					}
				}

				await this.say("text", content, undefined, block.partial)
				break
			}
			case "tool_use":
			

				if (this.didRejectTool) {
					// ignore any tool content after user has rejected tool once
					if (!block.partial) {
						this.userMessageContent.push({
							type: "text",
							text: `Skipping tool ${localeAssistant.toolDescription(block)} due to user rejecting a previous tool.`,
						})
					} else {
						// partial tool after user rejected a previous tool
						this.userMessageContent.push({
							type: "text",
							text: `Tool ${localeAssistant.toolDescription(block)} was interrupted and not executed due to user rejecting a previous tool.`,
						})
					}
					break
				}

				if (this.didAlreadyUseTool) {
					// ignore any content after a tool has already been used
					this.userMessageContent.push({
						type: "text",
						text: localeAssistant.toolAlreadyUsed(block),
					})
					break
				}
				if (block.name !== "browser_action") {
					await this.browserSession.closeBrowser()
				}

				switch (block.name) 
				{
					case "write_to_file":
					case "replace_in_file": {
						const relPath: string | undefined = block.params.path
						let content: string | undefined = block.params.content // for write_to_file
						let diff: string | undefined = block.params.diff // for replace_in_file
						if (!relPath || (!content && !diff)) {
							// checking for content/diff ensures relPath is complete
							// wait so we can determine if it's a new file or editing an existing file
							break
						}

						// Check if file exists using cached map or fs.access
						let fileExists: boolean
						if (this.diffViewProvider.editType !== undefined) {
							fileExists = this.diffViewProvider.editType === "modify"
						} else {
							const absolutePath = path.resolve(cwd, relPath)
							fileExists = await fileExistsAtPath(absolutePath)
							this.diffViewProvider.editType = fileExists ? "modify" : "create"
						}

						try {
							// Construct newContent from diff
							let newContent: string
							if (diff) {
								if (!this.api.getModel().id.includes("claude")) {
									// deepseek models tend to use unescaped html entities in diffs
									diff = fixModelHtmlEscaping(diff)
									diff = removeInvalidChars(diff)
								}

								// open the editor if not done already.  This is to fix diff error when model provides correct search-replace text but Cline throws error
								// because file is not open.
								if (!this.diffViewProvider.isEditing) {
									await this.diffViewProvider.open(relPath)
								}

								try {
									newContent = await constructNewFileContent(
										diff,
										this.diffViewProvider.originalContent || "",
										!block.partial,
									)
								} catch (error) {
									await this.say("diff_error", relPath)
									// Add telemetry for diff edit failure
									telemetryService.captureDiffEditFailure(this.taskId, error)

									this.pushToolResult(block, localeAssistant.diffError(error, relPath, this.diffViewProvider.originalContent))
									await this.diffViewProvider.revertChanges()
									await this.diffViewProvider.reset()
									break
								}
							} else if (content) {
								newContent = content

								// pre-processing newContent for cases where weaker models might add artifacts like markdown codeblock markers (deepseek/llama) or extra escape characters (gemini)
								if (newContent.startsWith("```")) {
									// this handles cases where it includes language specifiers like ```python ```js
									newContent = newContent.split("\n").slice(1).join("\n").trim()
								}
								if (newContent.endsWith("```")) {
									newContent = newContent.split("\n").slice(0, -1).join("\n").trim()
								}

								if (!this.api.getModel().id.includes("claude")) {
									// it seems not just llama models are doing this, but also gemini and potentially others
									newContent = fixModelHtmlEscaping(newContent)
									newContent = removeInvalidChars(newContent)
								}
							} else {
								// can't happen, since we already checked for content/diff above. but need to do this for type error
								break
							}

							newContent = newContent.trimEnd() // remove any trailing newlines, since it's automatically inserted by the editor

							const sharedMessageProps: ClineSayTool = {
								tool: fileExists ? "editedExistingFile" : "newFileCreated",
								path: getReadablePath(cwd, StringUtils.removeTag("path", relPath)),
								content: diff || content,
								operationIsLocatedInWorkspace: isLocatedInWorkspace(relPath),
							}

							if (block.partial) {
								// update gui message
								const partialMessage = JSON.stringify(sharedMessageProps)

								if (this.taskModel.shouldAutoApproveToolWithPath(block))  // in case the user changes auto-approval settings mid stream
									await this.say("tool", partialMessage, undefined, block.partial, true)
								else
									await this.ask("tool", partialMessage, block.partial, true)
								
								// update editor
								if (!this.diffViewProvider.isEditing) {
									// open the editor and prepare to stream content in
									await this.diffViewProvider.open(relPath)
								}
								// editor is open, stream content in
								await this.diffViewProvider.update(newContent, false)
								break
							} else {
								if (!relPath) {
									this.taskModel.consecutiveMistakeCount++
									this.pushToolResult(block, await this.sayAndCreateMissingParamError(block.name, "path"))
									await this.diffViewProvider.reset()

									break
								}
								if (block.name === "replace_in_file" && !diff) {
									this.taskModel.consecutiveMistakeCount++
									this.pushToolResult(block, await this.sayAndCreateMissingParamError("replace_in_file", "diff"))
									await this.diffViewProvider.reset()

									break
								}
								if (block.name === "write_to_file" && !content) {
									this.taskModel.consecutiveMistakeCount++
									this.pushToolResult(block, await this.sayAndCreateMissingParamError("write_to_file", "content"))
									await this.diffViewProvider.reset()

									break
								}

								this.taskModel.consecutiveMistakeCount = 0

								// if isEditingFile false, that means we have the full contents of the file already.
								// it's important to note how this function works, you can't make the assumption that the block.partial conditional will always be called since it may immediately get complete, non-partial data. So this part of the logic will always be called.
								// in other words, you must always repeat the block.partial logic here
								if (!this.diffViewProvider.isEditing) {
									// show gui message before showing edit animation
									const partialMessage = JSON.stringify(sharedMessageProps)
									await this.ask("tool", partialMessage, true).catch(() => {}) // sending true for partial even though it's not a partial, this shows the edit row before the content is streamed into the editor
									await this.diffViewProvider.open(relPath)
								}
								await this.diffViewProvider.update(newContent, true)
								await delay(300) // wait for diff view to update
								this.diffViewProvider.scrollToFirstDiff()
								// showOmissionWarning(this.diffViewProvider.originalContent || "", newContent)

								const completeMessage = JSON.stringify({
									...sharedMessageProps,
									content: diff || content,
									operationIsLocatedInWorkspace: isLocatedInWorkspace(relPath),
									// ? formatResponse.createPrettyPatch(
									// 		relPath,
									// 		this.diffViewProvider.originalContent,
									// 		newContent,
									// 	)
									// : undefined,
								} satisfies ClineSayTool)
								if (this.taskModel.shouldAutoApproveToolWithPath(block))
								{
									await this.say("tool", completeMessage, undefined, false, true)
									this.consecutiveAutoApprovedRequestsCount++
									telemetryService.captureToolUsage(this.taskId, block.name, true, true)

									// we need an artificial delay to let the diagnostics catch up to the changes
									await delay(3_500)
								} else {
									// If auto-approval is enabled but this tool wasn't auto-approved, send notification
									this.showNotificationForApprovalIfAutoApprovalEnabled(
										`Cline wants to ${fileExists ? "edit" : "create"} ${path.basename(relPath)}`,
									)
									// Need a more customized tool response for file edits to highlight the fact that the file was not updated (particularly important for deepseek)
									let didApprove = true
									const response = await this.ask("tool", completeMessage, false, true)
									if (response?.askResponse !== "yes") {
										// User either sent a message or pressed reject button
										// TODO: add similar context for other tool denial responses, to emphasize ie that a command was not run
										const fileDeniedNote = fileExists
											? "The file was not updated, and maintains its original contents."
											: "The file was not created."
										this.pushToolResult(block, `The user denied this operation. ${fileDeniedNote}`)
										if (response?.text || response?.images?.length) {
											this.pushAdditionalToolFeedback(response?.text, response?.images)
											await this.say("user_feedback", response?.text, response?.images)
										}
										this.didRejectTool = true
										didApprove = false
										telemetryService.captureToolUsage(this.taskId, block.name, false, false)
									} else {
										// User hit the approve button, and may have provided feedback
										if (response?.text || response?.images?.length) {
											this.pushAdditionalToolFeedback(response?.text, response?.images)
											await this.say("user_feedback", response?.text, response?.images)
										}
										telemetryService.captureToolUsage(this.taskId, block.name, false, true)
									}

									if (!didApprove) {
										await this.diffViewProvider.revertChanges()
										break
									}
								}

								// Mark the file as edited by Cline to prevent false "recently modified" warnings
								this.fileContextTracker.markFileAsEditedByCline(relPath)

								const { newProblems, userEdits, autoFormatted, finalContent } = await this.diffViewProvider.saveChanges()
								this.didEditFile = true // used to determine if we should wait for busy terminal to update before sending api request

								// Track file edit operation
								await this.fileContextTracker.trackFile(relPath, "cline_edited")

								if (userEdits) {
									// Track file edit operation
									await this.fileContextTracker.trackFile(relPath, "user_edited")

									await this.say(
										"user_feedback_diff",
										JSON.stringify({
											tool: fileExists ? "editedExistingFile" : "newFileCreated",
											path: getReadablePath(cwd, relPath),
											diff: userEdits,
										} satisfies ClineSayTool),
									)
									this.pushToolResult(block, localeAssistant.fileEditByUser(relPath, userEdits, autoFormatted, finalContent, newProblems))
								} 
								else
								{
									this.pushToolResult(block, localeAssistant.fileEdit(relPath, autoFormatted, finalContent, newProblems))
								}

								if (!fileExists) {
									this.workspaceTracker.populateFilePaths()
								}

								await this.diffViewProvider.reset()

								await this.saveCheckpoint()

								break
							}
						} catch (error) {
							await this.handleError(block, error)
							await this.diffViewProvider.revertChanges()
							await this.diffViewProvider.reset()

							break
						}						
					}
					case "browser_action": {
						const action: BrowserAction | undefined = block.params.action as BrowserAction
						const url: string | undefined = block.params.url
						const coordinate: string | undefined = block.params.coordinate
						const text: string | undefined = block.params.text
						if (!action || !browserActions.includes(action)) {
							// checking for action to ensure it is complete and valid
							if (!block.partial) {
								// if the block is complete and we don't have a valid action this is a mistake
								this.taskModel.consecutiveMistakeCount++
								this.pushToolResult(block, await this.sayAndCreateMissingParamError("browser_action", "action"))
								await this.browserSession.closeBrowser()
							}
							break
						}

						try {
							if (block.partial) 
								{
								if (action === "launch") {
									if (this.taskModel.shouldAutoApproveTool(block.name)) 
										await this.say("browser_action_launch",	StringUtils.removeTag('url', url, block.partial), undefined, block.partial, true)
									else 
										await this.ask("browser_action_launch",	StringUtils.removeTag('url', url, block.partial), block.partial, true)
								} else {
									await this.say(
										"browser_action",
										JSON.stringify({
											action: action as BrowserAction,

											coordinate: StringUtils.removeTag( "coordinate", coordinate, block.partial),
											text: StringUtils.removeTag( "text", text, block.partial),
										} satisfies ClineSayBrowserAction),
										undefined,
										block.partial,
									)
								}
								break
							} else {
								let browserActionResult: BrowserActionResult
								if (action === "launch") {
									if (!url) {
										this.taskModel.consecutiveMistakeCount++
										this.pushToolResult(block, await this.sayAndCreateMissingParamError("browser_action", "url"))
										await this.browserSession.closeBrowser()

										break
									}
									this.taskModel.consecutiveMistakeCount = 0

									if (! await this.handleAutoApprove(block)) // now execute the tool
										break

									// NOTE: it's okay that we call this message since the partial inspect_site is finished streaming. The only scenario we have to avoid is sending messages WHILE a partial message exists at the end of the messages array. For example the api_req_finished message would interfere with the partial message, so we needed to remove that.
									// await this.say("inspect_site_result", "") // no result, starts the loading spinner waiting for result
									await this.say("browser_action_result", "") // starts loading spinner

									// Re-make browserSession to make sure latest settings apply
									if (this.context) {
										await this.browserSession.dispose()
										this.browserSession = new BrowserSession(this.context, this.browserSettings)
									} else {
										console.warn("no controller context available for browserSession")
									}
									await this.browserSession.launchBrowser()
									browserActionResult = await this.browserSession.navigateToUrl(url)
								} else {
									if (action === "click") {
										if (!coordinate) {
											this.taskModel.consecutiveMistakeCount++
											this.pushToolResult(block, 
												await this.sayAndCreateMissingParamError("browser_action", "coordinate"),
											)
											await this.browserSession.closeBrowser()

											break // can't be within an inner switch
										}
									}
									if (action === "type") {
										if (!text) {
											this.taskModel.consecutiveMistakeCount++
											this.pushToolResult(block, await this.sayAndCreateMissingParamError("browser_action", "text"))
											await this.browserSession.closeBrowser()

											break
										}
									}
									this.taskModel.consecutiveMistakeCount = 0
									await this.say(
										"browser_action",
										JSON.stringify({
											action: action as BrowserAction,
											coordinate,
											text,
										} satisfies ClineSayBrowserAction),
										undefined,
										false,
									)
									switch (action) {
										case "click":
											browserActionResult = await this.browserSession.click(coordinate!)
											break
										case "type":
											browserActionResult = await this.browserSession.type(text!)
											break
										case "scroll_down":
											browserActionResult = await this.browserSession.scrollDown()
											break
										case "scroll_up":
											browserActionResult = await this.browserSession.scrollUp()
											break
										case "close":
											browserActionResult = await this.browserSession.closeBrowser()
											break
									}
								}

								if (action === 'close')
								{
									this.pushToolResult(block,  localeAssistant.browserClosed)
								}
								else if(action !== 'type')
								{
									await this.say("browser_action_result", JSON.stringify(browserActionResult))
									this.pushToolResult(block, localeAssistant.browserAction(browserActionResult?.logs), browserActionResult?.screenshot, true)
								}
								break
							}
						} catch (error) {
							await this.browserSession.closeBrowser() // if any error occurs, the browser session is terminated
							await this.handleError(block, error)

							break
						}
					}
					case "list_code_definition_names":
					case "execute_command":
					case "use_mcp_tool": 
					case "access_mcp_resource": 
					case "ask_followup_question":
					case "new_task":
					case "condense":
					case "plan_mode_respond":
					case "search_files":
					case "list_files":
					case "attempt_completion":
					case "load_mcp_documentation":
					case "read_file":
						this.validateParamsAndExecute(block)
						break
				}
				break
		}

		/*
		Seeing out of bounds is fine, it means that the next too call is being built up and ready to add to assistantMessageContent to present. 
		When you see the UI inactive during this, it means that a tool is breaking without presenting any UI. For example the write_to_file tool was breaking when relpath was undefined, and for invalid relpath it never presented UI.
		*/
		this.presentAssistantMessageLocked = false // this needs to be placed here, if not then calling this.presentAssistantMessage below would fail (sometimes) since it's locked
		// NOTE: when tool is rejected, iterator stream is interrupted and it waits for userMessageContentReady to be true. Future calls to present will skip execution since didRejectTool and iterate until contentIndex is set to message length and it sets userMessageContentReady to true itself (instead of preemptively doing it in iterator)
		if (!block.partial || this.didRejectTool || this.didAlreadyUseTool) {
			// block is finished streaming and executing
			if (this.currentStreamingContentIndex === this.assistantMessageContent.length - 1) {
				// its okay that we increment if !didCompleteReadingStream, it'll just return bc out of bounds and as streaming continues it will call presentAssistantMessage if a new block is ready. if streaming is finished then we set userMessageContentReady to true when out of bounds. This gracefully allows the stream to continue on and all potential content blocks be presented.
				// last block is complete and it is finished executing
				this.userMessageContentReady = true // will allow pwaitfor to continue
			}

			// call next block if it exists (if not then read stream will call it when its ready)
			this.currentStreamingContentIndex++ // need to increment regardless, so when read stream calls this function again it will be streaming the next block

			if (this.currentStreamingContentIndex < this.assistantMessageContent.length) {
				// there are already more content blocks to stream, so we'll call this function ourselves
				// await this.presentAssistantContent()

				this.presentAssistantMessage()
				return
			}
		}
		// block is partial, but the read stream may have finished
		if (this.presentAssistantMessageHasPendingUpdates) {
			this.presentAssistantMessage()
		}
	}
	


	

	//static async approvePartialTool(controller:AppController, block:ToolUse, type:string, partialMessage:string)
	async approvePartialTool(block: ToolUse, type:string, hasPath:boolean) 
	{
		const appproved = (hasPath) ? this.taskModel.shouldAutoApproveToolWithPath(block) : this.taskModel.shouldAutoApproveTool(block.name)
		if (appproved) 
			await this.say(type as ClineSay, toJSON(block), undefined, block.partial, true)
		else 
			await this.ask(type as ClineAsk, toJSON(block), block.partial, true)
	}


	

	async handleDiffError(error: Error, task:Task, block:ToolUse)
	{
		await task.say("diff_error", block.params.path!)
		telemetryService.captureDiffEditFailure(task.taskId, error) // Add telemetry for diff edit failure
		task.pushToolResult(block, localeAssistant.diffError(error, block.params.path!, task.diffViewProvider.originalContent))
		await task.diffViewProvider.revertChanges()
		await task.diffViewProvider.reset()
	}

	async abortStream (assistantMessage:string,  startMessage:ClineMessage, cost:ApiMetrics, currentProviderId:string, error?:any) 
	{
		if (!this.abandoned)  //  gracefully abort if this instance isn't abandoned 
        {
			if (error)
			{
				this.abortTask() // if the stream failed, there's various states the task could be in (i.e. could have streamed some tools the user may have executed), so we just resort to replicating a cancel task

			}
			const streamingFailedMessage = error ? this.formatErrorWithStatusCode(error) : ""

			if (this.diffViewProvider.isEditing) 
				await this.diffViewProvider.revertChanges() // closes diff view
			

			const streamingFailed:boolean = error !== undefined

			// if last message is a partial we need to update and save it
			const lastMessage = this.clineMessages.at(-1)
			if (lastMessage && lastMessage.partial) {
				// lastMessage.ts = Date.now() DO NOT update ts since it is used as a key for virtuoso list
				lastMessage.partial = false
				// instead of streaming partialMessage events, we do a save and post like normal to persist to disk
				console.log("updating partial message", lastMessage)
				// await this.saveClineMessagesAndUpdateHistory()
			}

			// Let assistant know their response was interrupted for when task is resumed
			this.taskModel.addToApiConversationHistory("assistant", assistantMessage + this.locale.cline.interruptedByApiErrorOrUser(streamingFailed))				

			// update api_req_started to have cancelled and cost, so that we can display the cost of the partial stream
			updateApiReqMsg(startMessage, cost, this.api.getModel().info, streamingFailed, streamingFailedMessage)
			await this.saveClineMessages()

			telemetryService.captureConversationTurnEvent(this.taskId, currentProviderId, this.api.getModel().id, "assistant")

			// signals to provider that it can retrieve the saved messages from disk, as abortTask can not be awaited on in nature
			this.didFinishAbortingStream = true

			if(error)
			{
				await this.reinitExistingTaskFromId(this.taskId)
			}
		}
	}

	async recursivelyMakeClineRequests(userContent: Anthropic.ContentBlockParam[], includeFileDetails: boolean = false): Promise<boolean> 
	{
		if (this.abort) {
			throw new Error("Cline instance aborted")
		}

		// Used to know what models were used in the task if user wants to export metadata for error reporting purposes
		const currentProviderId = (await getGlobalState(this.getContext(), "apiProvider")) as string
		if (currentProviderId && this.api.getModel().id) {
			try {
				await this.modelContextTracker.recordModelUsage(currentProviderId, this.api.getModel().id, this.chatSettings.mode)
			} catch {}
		}

		if (this.taskModel.consecutiveMistakeCount >= 3) {
			if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) {
				showSystemNotification("Error", "Cline is having trouble. Would you like to continue the task?")
			}
			const response = await this.ask(
				"mistake_limit_reached",
				this.api.getModel().id.includes("claude")
					? `This may indicate a failure in his thought process or inability to use a tool properly, which can be mitigated with some user guidance (e.g. "Try breaking down the task into smaller steps").`
					: "Cline uses complex prompts and iterative task execution that may be challenging for less capable models. For best results, it's recommended to use Claude 3.7 Sonnet for its advanced agentic coding capabilities.",
			)
			if (response?.askResponse === "message") {
				userContent.push(
					...[
						{
							type: "text",
							text: this.locale.cline.tooManyMistakes(response?.text),
						} as Anthropic.Messages.TextBlockParam,
						...formatResponse.imageBlocks(response?.images),
					],
				)
			}
			this.taskModel.consecutiveMistakeCount = 0
		}

		if (
			this.autoApprovalSettings.enabled &&
			this.consecutiveAutoApprovedRequestsCount >= this.autoApprovalSettings.maxRequests
		) {
			if (this.autoApprovalSettings.enableNotifications) {
				showSystemNotification("Max Requests Reached", `Cline has auto-approved ${this.autoApprovalSettings.maxRequests.toString()} API requests.`)
			}
			await this.ask(
				"auto_approval_max_req_reached",
				`Cline has auto-approved ${this.autoApprovalSettings.maxRequests.toString()} API requests. Would you like to reset the count and proceed with the task?`,
			)
			// if we get past the promise it means the user approved and did not start a new task
			this.consecutiveAutoApprovedRequestsCount = 0
		}

		// get previous api req's index to check token usage and determine if we need to truncate conversation history
		const previousApiReqIndex = findLastIndex(this.clineMessages, (m) => m.say === "api_req_started")

		// Save checkpoint if this is the first API request
		const isFirstRequest = this.clineMessages.filter((m) => m.say === "api_req_started").length === 0
		if (isFirstRequest) {
			await this.say("checkpoint_created") // no hash since we need to wait for CheckpointTracker to be initialized
		}

		// getting verbose details is an expensive operation, it uses globby to top-down build file structure of project which for large projects can take a few seconds
		// for the best UX we show a placeholder api_req_started message with a loading spinner as this happens
		await this.say(
			"api_req_started",
			JSON.stringify({
				request: userContent.map((block) => formatContentBlockToMarkdown(block)).join("\n\n") + "\n\nLoading...",
			}),
		)

		// use this opportunity to initialize the checkpoint tracker (can be expensive to initialize in the constructor)
		// FIXME: right now we're letting users init checkpoints for old tasks, but this could be a problem if opening a task in the wrong workspace
		// isNewTask &&
		if (!this.checkpointTracker && !this.checkpointTrackerErrorMessage) {
			try {
				this.checkpointTracker = await pTimeout(
					CheckpointTracker.create(this.taskId, this.context.globalStorageUri.fsPath),
					{
						milliseconds: 15_000,
						message:
							"Checkpoints taking too long to initialize. Consider re-opening Cline in a project that uses git, or disabling checkpoints.",
					},
				)
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error"
				console.error("Failed to initialize checkpoint tracker:", errorMessage)
				this.checkpointTrackerErrorMessage = errorMessage // will be displayed right away since we saveClineMessages next which posts state to webview
			}
		}

		// Now that checkpoint tracker is initialized, update the dummy checkpoint_created message with the commit hash. (This is necessary since we use the API request loading as an opportunity to initialize the checkpoint tracker, which can take some time)
		if (isFirstRequest) {
			const commitHash = await this.checkpointTracker?.commit()
			const lastCheckpointMessage = findLast(this.clineMessages, (m) => m.say === "checkpoint_created")
			if (lastCheckpointMessage) {
				lastCheckpointMessage.lastCheckpointHash = commitHash
				await this.saveClineMessages()
			}
		}

		const [parsedUserContent] = await this.loadContext(userContent)
		userContent = parsedUserContent


		const e = await getEnvironmentDetails(this.terminalManager, this.clineIgnoreController, this.fileContextTracker, includeFileDetails)

		// add environment details as its own text block, separate from tool results
		userContent.push({ type: "text", text: e })

		this.taskModel.addToApiConversationHistory("user", userContent)

		telemetryService.captureConversationTurnEvent(this.taskId, currentProviderId, this.api.getModel().id, "user")


		const cost:ApiMetrics = {tokensIn:0, tokensOut:0}

		// since we sent off a placeholder api_req_started message to update the webview while waiting to 
		// actually start the API request (to load potential details for example), we need to update the text of that message
		const lastApiReqIndex = findLastIndex(this.clineMessages, (m) => m.say === "api_req_started")
		const startMessage = this.clineMessages[lastApiReqIndex]

		startMessage.text = JSON.stringify({
			request: userContent.map((block) => formatContentBlockToMarkdown(block)).join("\n\n"),
		} satisfies ClineApiReqInfo)

		await this.saveClineMessages()
		await this.postStateToWebview()

		try {
			// reset streaming state
			this.currentStreamingContentIndex = 0
			this.assistantMessageContent = []
			this.didCompleteReadingStream = false
			this.userMessageContent = []
			this.userMessageContentReady = false
			this.didRejectTool = false
			this.didAlreadyUseTool = false
			this.presentAssistantMessageLocked = false
			this.presentAssistantMessageHasPendingUpdates = false
			this.didAutomaticallyRetryFailedApiRequest = false
			await this.diffViewProvider.reset()

			const stream = this.attemptApiRequest(previousApiReqIndex) // yields only if the first chunk is successful, otherwise will allow the user to retry the request (most likely due to rate limit error, which gets thrown on the first chunk)
			let assistantMessage = ""
			let reasoningMessage = ""
			this.isStreaming = true

			try {
				for await (const chunk of stream) {
					if (!chunk) {
						continue
					}
					switch (chunk.type) 
					{
						case "usage":
							updateCost(cost, chunk)
							break
						case "reasoning":
							// reasoning will always come before assistant message
							reasoningMessage += chunk.reasoning
							// fixes bug where cancelling task > aborts task > for loop may be in middle of streaming reasoning > say function throws error before we get a chance to properly clean up and cancel the task.
							if (!this.abort) {
								await this.say("reasoning", reasoningMessage, undefined, true)
							}
							break
						case "text":
							if (reasoningMessage && assistantMessage.length === 0) {
								// complete reasoning message
								await this.say("reasoning", reasoningMessage, undefined, false)
							}
							assistantMessage += chunk.text
							// parse raw assistant message into content blocks
							const prevLength = this.assistantMessageContent.length
							this.assistantMessageContent = parseAssistantMessage(assistantMessage)
							if (this.assistantMessageContent.length > prevLength) {
								this.userMessageContentReady = false // new content we need to present, reset to false in case previous content set this to true
							}
							// present content to user
							this.presentAssistantMessage()
							break
					}

					if (this.abort) 
					{
						await this.abortStream(assistantMessage, startMessage, cost, currentProviderId, null)
						break // aborts the stream
					}

					if (this.didRejectTool) {
						// userContent has a tool rejection, so interrupt the assistant's response to present the user's feedback
						assistantMessage += "\n\n[Response interrupted by user feedback]"
						// this.userMessageContentReady = true // instead of setting this preemptively, we allow the present iterator to finish and set userMessageContentReady when its ready
						break
					}

					// PREV: we need to let the request finish for openrouter to get generation details
					// UPDATE: it's better UX to interrupt the request at the cost of the api cost not being retrieved
					if (this.didAlreadyUseTool) {
						assistantMessage +=
							"\n\n[Response interrupted by a tool use result. Only one tool may be used at a time and should be placed at the end of the message.]"
						break
					}
				}
			}
			catch (error) 
			{
				// abandoned happens when extension is no longer waiting for the cline instance to finish aborting (error is thrown here when any function in the for loop throws due to this.abort)
				await this.abortStream(assistantMessage, startMessage, cost, currentProviderId, error)
			}
			finally 
			{
				this.isStreaming = false
			}

			// OpenRouter/Cline may not return token usage as part of the stream (since it may abort early), 
			// so we fetch after the stream is finished
			// (updateApiReq below will update the api_req_started message with the usage details.
			//  we do this async so it updates the api_req_started message in the background)
			if (cost.tokensIn === 0 && cost.tokensOut === 0)  //initial values -> didNotReceiveUsageChunk
			{
				this.api.getApiStreamUsage?.().then(async (apiStreamUsage) => {
					if (apiStreamUsage) 
						updateCost(cost, apiStreamUsage)
					updateApiReqMsg(startMessage, cost, this.api.getModel().info)
					await this.saveClineMessages()
					await this.postStateToWebview()
				})
			}

			// need to call here in case the stream was aborted
			if (this.abort) {
				throw new Error("Cline instance aborted")
			}

			this.didCompleteReadingStream = true

			// set any blocks to be complete to allow presentAssistantMessage to finish and set userMessageContentReady to true
			// (could be a text block that had no subsequent tool uses, or a text block at the very end, or an invalid tool use, etc. whatever the case, presentAssistantMessage relies on these blocks either to be completed or the user to reject a block in order to proceed and eventually set userMessageContentReady to true)
			const partialBlocks = this.assistantMessageContent.filter((block) => block.partial)
			partialBlocks.forEach((block) => {
				block.partial = false
			})
			// this.assistantMessageContent.forEach((e) => (e.partial = false)) // can't just do this bc a tool could be in the middle of executing ()
			if (partialBlocks.length > 0) {
				this.presentAssistantMessage() // if there is content to update then it will complete and update this.userMessageContentReady to true, which we pwaitfor before making the next request. all this is really doing is presenting the last partial message that we just set to complete
			}

			updateApiReqMsg(startMessage, cost, this.api.getModel().info)
			await this.saveClineMessages()
			await this.postStateToWebview()

			// now add to apiconversationhistory
			// need to save assistant responses to file before proceeding to tool use since user can exit at any moment and we wouldn't be able to save the assistant's response
			let didEndLoop = false
			if (assistantMessage.length > 0) {
				telemetryService.captureConversationTurnEvent(this.taskId, currentProviderId, this.api.getModel().id, "assistant")

				this.taskModel.addToApiConversationHistory("assistant", assistantMessage)

				// NOTE: this comment is here for future reference - this was a workaround for userMessageContent not getting set to true. It was due to it not recursively calling for partial blocks when didRejectTool, so it would get stuck waiting for a partial block to complete before it could continue.
				// in case the content blocks finished
				// it may be the api stream finished after the last parsed content block was executed, so  we are able to detect out of bounds and set userMessageContentReady to true (note you should not call presentAssistantMessage since if the last block is completed it will be presented again)
				// const completeBlocks = this.assistantMessageContent.filter((block) => !block.partial) // if there are any partial blocks after the stream ended we can consider them invalid
				// if (this.currentStreamingContentIndex >= completeBlocks.length) {
				// 	this.userMessageContentReady = true
				// }

				await pWaitFor(() => this.userMessageContentReady)

				// if the model did not tool use, then we need to tell it to either use a tool or attempt_completion
				const didToolUse = this.assistantMessageContent.some((block) => block.type === "tool_use")

				if (!didToolUse) {
					// normal request where tool use is required
					this.userMessageContent.push({
						type: "text",
						text: this.locale.cline.noToolsUsed(),
					})
					this.taskModel.consecutiveMistakeCount++
				}

				const recDidEndLoop = await this.recursivelyMakeClineRequests(this.userMessageContent)
				didEndLoop = recDidEndLoop
			} else {
				// if there's no assistant_responses, that means we got no text or tool_use content blocks from API which we should assume is an error
				await this.say(
					"error",
					"Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output.",
				)
				this.taskModel.addToApiConversationHistory("assistant", this.locale.cline.assistantFailure)
			}

			return didEndLoop // will always be false for now
		} catch (error) {
			// this should never happen since the only thing that can throw an error is the attemptApiRequest, which is wrapped in a try catch that sends an ask where if noButtonClicked, will clear current task and destroy this instance. However to avoid unhandled promise rejection, we will end this loop which will end execution of this instance (see startTask)
			return true // needs to be true so parent loop knows to end task
		}
	}


	async validateParamsAndExecute(block:ToolUse) 
    {
		const handlerMap: Record<ToolUseName, {type?:string, params?:ToolParamName[]}> = {
			"execute_command":      	{type:"command", params:["command", "requires_approval"] },
			"search_files":         	{type:'tool', params:["path", "regex"] },
			"list_files":           	{type:'tool', params:["path"] },
			"read_file":            	{type:'tool', params:['path'] },
			"write_to_file":        	{params:['path', 'content'] },
			"replace_in_file":      	{params:['path', 'diff'] },
			"browser_action":       	{params:["action"]},
			"use_mcp_tool":         	{type:"use_mcp_server", params:["tool_name", "server_name"] },
			"access_mcp_resource":  	{type:"use_mcp_server", params:['server_name', 'uri'] },
			"ask_followup_question":	{type:"followup", params:['question'] },
			"attempt_completion":   	{params:["result"]},
			"list_code_definition_names":   {type:"tool", params:['path'] },
			"load_mcp_documentation" : 	{},
			"new_task": 				{params:["context"]},
			"plan_mode_respond":		{params:['response']},
			"condense":					{params:['context']}	
		}
		try 
		{
			if (await this.accessNotAllowed(block))
			{
				await this.say("clineignore_error", block.params.path!)
				this.pushToolResult(block, this.locale.cline.clineIgnoreError(block.params.path!))
				return
			}

			if (block.partial)
				return this.handlePartialBlock(block)

			const params = handlerMap[block.name]?.params			
			const invalidParam = params?.find(param => block.params[param] === undefined)
			if (invalidParam)
			{
				//if (block.name === 'write_to_file' || block.name === 'replace_in_file')
				//    await controller.diffViewProvider.reset()
				//if (block.name === 'browser_action')
				//    await controller.browserSession.closeBrowser()
				return await this.registerError(block, block.name, invalidParam)
			}
			this.taskModel.consecutiveMistakeCount = 0
			this.handleBlock(block)

		} 
		catch (error) 
		{
			await this.handleError(block, error)
		}
    }

	async handlePartialBlock(block:ToolUse)
	{
		switch (block.name)
		{
			case 'execute_command':
				if (!this.taskModel.shouldAutoApproveTool(block.name))  //depends on the requiresApproval, so we dont use say
					await this.ask("command", toJSON(block), block.partial) // don't need to remove last partial since we couldn't have streamed a say
			break
			case "use_mcp_tool": 
			case 'access_mcp_resource':
				await this.approvePartialTool(block, "use_mcp_server", false)
				break
			case 'ask_followup_question':
				await this.ask("followup", toJSON(block), block.partial)
				break
			case 'new_task':
			case 'condense':
			case 'plan_mode_respond':
				await this.ask(block.name, toJSON(block), block.partial)
				break
			case 'search_files':
			case 'list_code_definition_names':
			case 'list_files':
			case 'read_file':
				await this.approvePartialTool(block, "tool", true)
				break
			case 'attempt_completion':
				const lastMessage = this.clineMessages.at(-1)
				if (block.params.command)
				{
					// the attempt_completion text is done, now getting command, remove the previous, replace with say, post state to webview, then stream command
					if (!lastMessage || lastMessage.ask !== "command") // last message is completion_result, we have command string, so is the result, finish it 
					{
						await this.say("completion_result", StringUtils.removeTag("result", block.params.result), undefined, false)
						await this.saveCheckpoint(true)
						await this.addNewChangesFlagToLastCompletionResultMessage()
					}
	
					await this.ask("command", StringUtils.removeTag("command", block.params.command), block.partial)// update command
				} 
				else // no command, still outputting partial result 
				{
					await this.say("completion_result", StringUtils.removeTag("result", block.params.result), undefined, true)
				}		
				break
			case 'load_mcp_documentation':
				return // shouldn't happen
		}
	}

	async handleBlock(block:ToolUse)
	{
		const absolutePath = path.resolve(cwd, block.params.path!)
		let delegate:((block:ToolUse) => Promise<string>) | undefined

		switch (block.name)
		{
			case 'execute_command':
				return this.handleExecuteCommand(block)
			case 'use_mcp_tool':
				const parsedArguments: Record<string, unknown> = parseJSON(block.params.arguments)
				if (parsedArguments === undefined) // arguments are optional, but if they are provided they must be valid JSON
					return await this.registerErrorMCP(block)
		
				const isToolAutoApproved = this.mcpHub.connections
					?.find((conn) => conn.server.name === block.params.server_name)
					?.server.tools?.find((tool) => tool.name === block.params.tool_name)?.autoApprove
		
		
				if (await this.handleAutoApprove(block, undefined, isToolAutoApproved)) // now execute the tool
				{
					await this.say("mcp_server_request_started") // same as browser_action_result
					let {text, images} = await this.mcpHub.callTool(block.params.server_name!, block.params.tool_name!, parsedArguments)
					await this.say("mcp_server_response", text + images?.map((image) => `\n\n${image}`).join("")) // extracts images to display in the UI
					
					this.pushToolResult(block, text, images, true)
					await this.saveCheckpoint()
				}
				break
			case 'access_mcp_resource':
				if (await this.handleAutoApprove(block)) // now execute the tool
				{
					await this.say("mcp_server_request_started")
					const result = await this.mcpHub.readResource(block.params.server_name!, block.params.uri!)
					await this.say("mcp_server_response", result)
					this.pushToolResult(block, result)
				}
				break
			case 'ask_followup_question':
				const question = block.params.question!
				const optionsRaw = block.params.options
		
				if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) 
					showSystemNotification("Cline has a question...", question.replace(/\n/g, " "))
		
				const options = parsePartialArrayString(optionsRaw || "[]")// Store the number of options for telemetry
				const response1 = await this.ask("followup", toJSON(block), false)
		
				if (options.includes(response1?.text ?? 'void'))  // Check if options contains the text response
				{
					const lastFollowupMessage = findLast(this.clineMessages, (m) => m.ask === "followup") 
					if (lastFollowupMessage) // Valid option selected, don't show user message in UI Update last followup message with selected option
					{
						lastFollowupMessage.text = toJSON(block, response1?.text)
						await this.saveClineMessages()
						telemetryService.captureOptionSelected(this.taskId, options.length, "act")
					}
				} 
				else 
				{
					telemetryService.captureOptionsIgnored(this.taskId, options.length, "act") // Option not selected, send user feedback
					await this.say("user_feedback", response1?.text ?? "", response1?.images)
				}
		
				this.pushToolResult(block, this.locale.assistantMessage.formattedAnswer(response1?.text), response1?.images, true)
				break
			case 'new_task':
				if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) 
					showSystemNotification("Cline wants to start a new task...", `Cline is suggesting to start a new task with: ${block.params.context!}`)
		
				const response = await this.ask("new_task", block.params.context!, false)
				
				if (response?.text || response?.images?.length)  // If the user provided a response, treat it as feedback
				{
					await this.say("user_feedback", response?.text ?? "", response?.images)
					this.pushToolResult(block, localeAssistant.newTaskWithFeedback(response?.text ?? ''), response?.images, true)
				}
				else 
				{
					this.pushToolResult(block, localeAssistant.newTask) // If no response, the user clicked the "Create New Task" button
				}
				break
			case 'condense':
				return this.handleCondese(block)
			case 'plan_mode_respond':
				return this.handlePlanModeResponse(block)
			case 'search_files':
				const regex = block.params.regex!
				const filePattern: string | undefined = block.params.file_pattern
				const results = await regexSearchFiles(cwd, absolutePath, regex, filePattern, this.clineIgnoreController)
				if (await this.handleApproveTool(block, toJSON(block, results)))
					this.pushToolResult(block, results)
				break
			case 'list_code_definition_names':
				const result2 = await parseSourceCodeForDefinitionsTopLevel(absolutePath, this.clineIgnoreController)
				if (await this.handleApproveTool(block, toJSON(block, result2)))
					this.pushToolResult(block, result2)
				break
			case 'list_files':

				const recursive = block.params.recursive?.toLowerCase() === "true"
				const [files, didHitLimit] = await listFiles(absolutePath, recursive, 200)
				const result = formatResponse.formatFilesList(absolutePath, files, didHitLimit,	this.clineIgnoreController)
				if (await this.handleApproveTool(block, toJSON(block, result)))
					this.pushToolResult(block, result)
				break
			case 'attempt_completion':
				return this.handleAttemptCompletion(block)
			case 'load_mcp_documentation':
				await this.say("load_mcp_documentation", "", undefined, false)
				this.pushToolResult(block, await loadMcpDocumentation(this.mcpHub))
				break
			case 'read_file':
				delegate = async (block:ToolUse) => 
				{
					await this.fileContextTracker.trackFile(block.params.path!, "read_tool") // Track file read operation
					return await extractTextFromFile(absolutePath) // now execute the tool like normal
				}
				break
		}
		if(delegate && await this.handleApproveTool(block, toJSON(block, absolutePath)))
            this.pushToolResult(block, await delegate(block))

	}

	async accessNotAllowed(block: ToolUse)
	{
		switch(block.name)
		{
			case "write_to_file":
			case "replace_in_file":
			case 'read_file':
				return this.clineIgnoreController.validateAccess(block.params.path!)
		}
		return false
	}

	
	showNotificationForApprovalIfAutoApprovalEnabled (message: string) 
	{
		if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) {
			showSystemNotification("Approval Required",	message)
		}
	}	
	async handleAttemptCompletion(block: ToolUse) 
	{
		const result = block.params.result!
		const command: string | undefined = block.params.command

		const lastMessage = this.clineMessages.at(-1)


		if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) 
			showSystemNotification("Task Completed", result.replace(/\n/g, " "))
		

		let commandResult
		if (command) {
			if (lastMessage && lastMessage.ask !== "command") {
				// haven't sent a command message yet so first send completion_result then command
				await this.say("completion_result", result, undefined, false)
				await this.saveCheckpoint(true)
				await this.addNewChangesFlagToLastCompletionResultMessage()
				telemetryService.captureTaskCompleted(this.taskId)
			} else {
				// we already sent a command message, meaning the complete completion message has also been sent
				await this.saveCheckpoint(true)
			}

			// complete command message
			const didApprove = await this.askApproval(block, "command", command)
			if (!didApprove) {
				return
			}
			const execCommandResult = await TestWrapper.executeCommandTool(command, this) 
			if (typeof execCommandResult === 'string')
			{
				this.didRejectTool = true
				this.pushToolResult(block, execCommandResult)
				return
			}
			// user didn't reject, but the command may have output
			commandResult = execCommandResult
		} else {
			await this.say("completion_result", result, undefined, false)
			await this.saveCheckpoint(true)
			await this.addNewChangesFlagToLastCompletionResultMessage()
			telemetryService.captureTaskCompleted(this.taskId)
		}

		// we already sent completion_result says, an empty string asks relinquishes control over button and field
		const response = await this.ask("completion_result", "", false)
		if (response?.askResponse === "yes") {
			this.pushToolResult(block, "") // signals to recursive loop to stop (for now this never happens since yesButtonClicked will trigger a new task)
			return
		}
		await this.say("user_feedback", response?.text ?? "", response?.images)

		const toolResults: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
		if (commandResult) {
			if (typeof commandResult === "string") {
				toolResults.push({
					type: "text",
					text: commandResult,
				})
			} else if (Array.isArray(commandResult)) {
				toolResults.push(...commandResult)
			}
		}
		toolResults.push({
			type: "text",
			text: `The user has provided feedback on the results. Consider their input to continue the task, and then attempt completion again.\n<feedback>\n${response?.text}\n</feedback>`,
		})
		toolResults.push(...formatResponse.imageBlocks(response?.images))
		this.userMessageContent.push({
			type: "text",
			text: `${localeAssistant.toolDescription(block)} Result:`,
		})
		this.userMessageContent.push(...toolResults)
	}
	
	async handlePlanModeResponse(block: ToolUse) 
	{
		const response: string | undefined = block.params.response
		const optionsRaw: string | undefined = block.params.options

		// Store the number of options for telemetry
		const options = parsePartialArrayString(optionsRaw || "[]")

		this.isAwaitingPlanResponse = true
		let r = await this.ask("plan_mode_respond", toJSON(block), false)
		this.isAwaitingPlanResponse = false

		// webview invoke sendMessage will send this marker in order to put webview into the proper state (responding to an ask) and as a flag to extension that the user switched to ACT mode.
		if (r?.text === "PLAN_MODE_TOGGLE_RESPONSE") 
			r.text = ""
		

		// Check if options contains the text response
		if (options.includes(r?.text ?? 'void')) 
		{
			// Valid option selected, don't show user message in UI
			// Update last followup message with selected option
			const lastPlanMessage = findLast(this.clineMessages, (m) => m.ask === "plan_mode_respond")
			if (lastPlanMessage) 
			{
				lastPlanMessage.text = toJSON(block, r?.text)
				await this.saveClineMessages()
				telemetryService.captureOptionSelected(this.taskId, options.length, "plan")
			}
		} 
		else 
		{
			// Option not selected, send user feedback
			if (r?.text || r?.images?.length) {
				telemetryService.captureOptionsIgnored(this.taskId, options.length, "plan")
				await this.say("user_feedback", r?.text ?? "", r?.images)
			}
		}

		if (this.didRespondToPlanAskBySwitchingMode) 
			this.pushToolResult(block, localeAssistant.switchToActMode(r?.text), r?.images, true)
		 else 
			this.pushToolResult(block, localeAssistant.feedback(r?.text), r?.images)// if we didn't switch to ACT MODE, then we can just send the user_feedback message
	}
	
	async handleCondese(block: ToolUse) 
	{
		const context = block.params.context!

		if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) 
			showSystemNotification("Cline wants to condense the conversation...", `Cline is suggesting to condense your conversation with: ${context}`)
		
		const response = await this.ask("condense", context, false)

		// If the user provided a response, treat it as feedback
		if (response?.text || response?.images?.length) {
			await this.say("user_feedback", response?.text ?? "", response?.images)
			this.pushToolResult(block, localeAssistant.condenseFeedback(response?.text ?? ''), response?.images)
		} else {
			// If no response, the user accepted the condensed version
			this.pushToolResult(block, localeAssistant.condense)

			const lastMessage = this.taskModel.apiConversationHistory[this.taskModel.apiConversationHistory.length - 1]
			const summaryAlreadyAppended = lastMessage && lastMessage.role === "assistant"
			const keepStrategy = summaryAlreadyAppended ? "lastTwo" : "none"

			// clear the context history at this point in time
			//this.conversationHistoryDeletedRange = this.contextManager.getNextTruncationRange(
			//	this.taskModel.apiConversationHistory,
			//	this.conversationHistoryDeletedRange,
			//	keepStrategy, 
			//)					'				//desabilitado aguardando o merge
			await this.saveClineMessages()
			//await this.contextManager.triggerApplyStandardContextTruncationNoticeChange(
			//	Date.now(),
			//	await ensureTaskDirectoryExists(this.getContext(), this.taskId),
			//)				 					//desabilitado aguardando o merge
		}

	}
	



	async handleAutoApprove(block:ToolUse, json?:string, isToolAutoApproved=true)
	{
		json ||= toJSON(block)
		const type:string = (block.name === 'browser_action') ? "browser_action_launch" : (block.name === 'access_mcp_resource' || block.name === 'use_mcp_tool') ? "use_mcp_server" : 'tool'
		if (this.taskModel.shouldAutoApproveTool(block.name) && isToolAutoApproved) 
		{
			await this.say(type as ClineSay, json, undefined, false, true)
			this.consecutiveAutoApprovedRequestsCount++
			return true
		}
		else 
		{
			if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) 
				showSystemNotification("Approval Required",	this.locale.assistantMessage.messages(block))
			return await this.askApproval(block, type as ClineAsk, json, true)
		}
	}

	async handleApproveTool(block: ToolUse, json: string, waitTime?: number) 
	{
		const type:string = (block.name === 'browser_action') ? "browser_action_launch" : (block.name === 'access_mcp_resource' || block.name === 'use_mcp_tool') ? "use_mcp_server" : 'tool'
        if (this.taskModel.shouldAutoApproveToolWithPath(block))
        {
			await this.say(type as ClineSay, json, undefined, false, true)//sending partialValue bool, undefined has its own purposem treat as single complete message
			this.consecutiveAutoApprovedRequestsCount++
			telemetryService.captureToolUsage(this.taskId, block.name, true, true)
            if (waitTime)// an artificial delay
                await delay(waitTime)
            return true
        }
        else
        {
            if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications)
                showSystemNotification("Approval Required", this.locale.assistantMessage.messages(block))
			const didApprove = await this.askApproval(block, type as ClineAsk, json, true)
			telemetryService.captureToolUsage(this.taskId, block.name, false, didApprove)
			return didApprove
        }
	}

	async registerErrorMCP(block:ToolUse) 
	{
		this.taskModel.consecutiveMistakeCount++; 
		this.taskModel.consecutiveMistakeCount++; //duplicado pq quando chama o handle já da uma zerada no numero de erros, PRECISA MUDAR A LOGICA
		await this.say("error", localeAssistant.invalidToolnameArgumentError(block.params.tool_name))
		this.pushToolResult(block, localeAssistant.invalidMcpToolArgumentError(block.params.server_name, block.params.tool_name))
	}

	async registerError(block:ToolUse, toolName:ToolUseName, paramName: string, relPath?: string) 
	{
		this.taskModel.consecutiveMistakeCount++
		await this.say("error", localeAssistant.missingParamError(toolName, paramName, relPath))
		this.pushToolResult(block, localeAssistant.missingToolParameterError(paramName) )
	}	

	async handleExecuteCommand(block:ToolUse)
    {		
		let command = block.params.command
		let proceed = true

		const safeCommand = (block.params.requires_approval!.toLowerCase() !== "true")
		this.taskModel.consecutiveMistakeCount = 0

		// gemini models tend to use unescaped html entities in commands
		if (this.api.getModel().id.includes("gemini")) 
			command = fixModelHtmlEscaping(command!)								

		const ignoredFileAttemptedToAccess = this.clineIgnoreController.validateCommand(command!)
		if (ignoredFileAttemptedToAccess) 
		{
			await this.say("clineignore_error", ignoredFileAttemptedToAccess)
			this.pushToolResult(block, this.locale.cline.clineIgnoreError(ignoredFileAttemptedToAccess))
			return
		}
		let didAutoApprove = false

		if (this.taskModel.shouldAutoApproveTool(block.name, safeCommand))
		{
			await this.say("command", command, undefined, false, true)
			this.consecutiveAutoApprovedRequestsCount++
			didAutoApprove = true
		} 
		else 
		{
			if (this.autoApprovalSettings.enabled && this.autoApprovalSettings.enableNotifications) 
				showSystemNotification("Approval Required",	this.locale.assistantMessage.messages(block))

			proceed = await this.askApproval(block,	"command",
				command + `${this.taskModel.shouldAutoApproveTool(block.name) && safeCommand ? COMMAND_REQ_APP_STRING : ""}`) // ugly hack until we refactor combineCommandSequences
		}

		if (proceed)
		{
			let timeoutId: NodeJS.Timeout | undefined
			if (didAutoApprove && this.autoApprovalSettings.enableNotifications)  // if the command was auto-approved, and it's long running we need to notify the user after some time has passed without proceeding
				timeoutId = setTimeout(() => {showSystemNotification("An auto-approved command has been running for 30s, may need your attention.", "Command is still running")}, 30_000)

			const response = await TestWrapper.executeCommandTool(command!, this)
			
			if (timeoutId)
				clearTimeout(timeoutId)

			// Re-populate file paths in case the command modified the workspace (vscode listeners do not
			//  trigger unless the user manually creates/deletes files)
			this.workspaceTracker.populateFilePaths()

			if (typeof response === 'string')
			{
				this.didRejectTool = true
				this.pushToolResult(block, response, undefined, true)
			}
			else
			{
				this.pushToolResult(block, response.text, response.images, true)
			}
			await this.saveCheckpoint()
		}	
    }


	async addNewChangesFlagToLastCompletionResultMessage() 
	{
		// Add newchanges flag if there are new changes to the workspace

		const hasNewChanges = await this.doesLatestTaskCompletionHaveNewChanges()
		const lastCompletionResultMessage = findLast(this.clineMessages, (m) => m.say === "completion_result")
		if (
			lastCompletionResultMessage &&
			hasNewChanges &&
			!lastCompletionResultMessage.text?.endsWith(COMPLETION_RESULT_CHANGES_FLAG)
		) {
			lastCompletionResultMessage.text += COMPLETION_RESULT_CHANGES_FLAG
		}
		await this.saveClineMessages()
	}	

	async loadContext(userContent: Anthropic.ContentBlockParam[]) {
		return await Promise.all([
			// This is a temporary solution to dynamically load context mentions from tool results. 
			// It checks for the presence of tags that indicate that the tool was rejected and feedback was provided 
			// (see formatToolDeniedFeedback, attemptCompletion, executeCommand, and consecutiveMistakeCount >= 3) or "<answer>" 
			// (see askFollowupQuestion), we place all user generated content in these tags so they can effectively 
			// be used as markers for when we should parse mentions). However if we allow multiple tools responses
			//  in the future, we will need to parse mentions specifically within the user content tags.
			// (Note: this caused the @/ import alias bug where file contents were being parsed as well, since v2 converted tool results to text blocks)
			Promise.all(
				userContent.map(async (block) => {
					if (block.type === "text") {
						// We need to ensure any user generated content is wrapped in one of these tags so that we know to parse mentions
						// FIXME: Only parse text in between these tags instead of the entire text block which may contain other tool results. 
						// This is part of a larger issue where we shouldn't be using regex to parse mentions in the first place (ie for cases where file paths have spaces)
						if (
							block.text.includes("<feedback>") ||
							block.text.includes("<answer>") ||
							block.text.includes("<task>") ||
							block.text.includes("<user_message>")
						) {
							let parsedText = await parseMentions(block.text, cwd, this.urlContentFetcher, this.fileContextTracker)

							// when parsing slash commands, we still want to allow the user to provide their desired context
							parsedText = parseSlashCommands(parsedText)

							return {
								...block,
								text: parsedText,
							}
						}
					}
					return block
				}),
			),
			
		])

		
	}
}




// update api_req_started. we can't use api_req_finished anymore since it's a unique case where it could come after a streaming message (ie in the middle of being updated or executed)
// fortunately api_req_finished was always parsed out for the gui anyways, so it remains solely for legacy purposes to keep track of prices in tasks from history
// (it's worth removing a few months from now)
function updateApiReqMsg(message:ClineMessage, cost:ApiMetrics, model:ModelInfo, cancelReason?:boolean, streamingFailedMessage?: string) 
{
	message.text = JSON.stringify({
		...JSON.parse(message.text || "{}"),
		tokensIn: cost.tokensIn,
		tokensOut: cost.tokensOut,
		cacheWrites: cost.cacheWrites ?? 0,
		cacheReads: cost.cacheReads ?? 0,
		cost: cost.cost ??	calculateApiCost(model, cost, false),
		failedReason: (cancelReason !== undefined) ? (cancelReason === true) ? "streaming_failed" : "user_cancelled" : "",
		streamingFailedMessage,
	} satisfies ClineApiReqInfo)
}

function toolResult(text: string, images?: string[]): string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>
{
	if (images && images.length > 0) {
		const textBlock: Anthropic.TextBlockParam = { type: "text", text }
		const imageBlocks: Anthropic.ImageBlockParam[] = formatImagesIntoBlocks(images)
		// Placing images after text leads to better results
		return [textBlock, ...imageBlocks]
	} else {
		return text
	}
}


// to avoid circular dependency
function formatImagesIntoBlocks (images?: string[]): Anthropic.ImageBlockParam[] 
{
	return images
		? images.map((dataUrl) => {
				// data:image/png;base64,base64string
				const [rest, base64] = dataUrl.split(",")
				const mimeType = rest.split(":")[1].split(";")[0]
				return {
					type: "image",
					source: {
						type: "base64",
						media_type: mimeType,
						data: base64,
					},
				} as Anthropic.ImageBlockParam
			})
		: []
}
