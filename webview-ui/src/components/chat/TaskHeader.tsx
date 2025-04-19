import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import React, { memo, useEffect, useMemo, useRef, useState } from "react"
import { useWindowSize } from "react-use"
import { mentionRegexGlobal } from "@shared/context-mentions"
import { ClineMessage } from "@shared/ExtensionMessage"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { formatLargeNumber } from "@/utils/format"
import { formatSize } from "@/utils/format"
import { vscode } from "@/utils/vscode"
import Thumbnails from "@/components/common/Thumbnails"
import styles from "./TaskHeader.module.css"
import { normalizeApiConfiguration } from "@/utils/apiConfigurationUtils"
import { validateSlashCommand } from "@/utils/slash-commands"

interface TaskHeaderProps {
	task: ClineMessage
	tokensIn: number
	tokensOut: number
	doesModelSupportPromptCache: boolean
	cacheWrites?: number
	cacheReads?: number
	totalCost: number
	lastApiReqTotalTokens?: number
	onClose: () => void
}

const TaskHeader: React.FC<TaskHeaderProps> = ({
	task,
	tokensIn,
	tokensOut,
	doesModelSupportPromptCache,
	cacheWrites,
	cacheReads,
	totalCost,
	lastApiReqTotalTokens,
	onClose,
}) => {
	const { locale: { TaskHeader: labels }, apiConfiguration, currentTaskItem, checkpointTrackerErrorMessage } = useExtensionState()
	const [isTaskExpanded, setIsTaskExpanded] = useState(false)
	const [isTextExpanded, setIsTextExpanded] = useState(false)
	const [showSeeMore, setShowSeeMore] = useState(false)
	const textContainerRef = useRef<HTMLDivElement>(null)
	const textRef = useRef<HTMLDivElement>(null)

	const { selectedModelInfo } = useMemo(() => normalizeApiConfiguration(apiConfiguration), [apiConfiguration])
	const contextWindow = selectedModelInfo?.contextWindow

	// Open task header when checkpoint tracker error message is set
	const prevErrorMessageRef = useRef(checkpointTrackerErrorMessage)
	useEffect(() => {
		if (checkpointTrackerErrorMessage !== prevErrorMessageRef.current) {
			setIsTaskExpanded(true)
			prevErrorMessageRef.current = checkpointTrackerErrorMessage
		}
	}, [checkpointTrackerErrorMessage])

	// Reset isTextExpanded when task is collapsed
	useEffect(() => {
		if (!isTaskExpanded) {
			setIsTextExpanded(false)
		}
	}, [isTaskExpanded])


	const { height: windowHeight, width: windowWidth } = useWindowSize()

	useEffect(() => {
		if (isTextExpanded && textContainerRef.current) {
			const maxHeight = windowHeight * (1 / 2)
			textContainerRef.current.style.maxHeight = `${maxHeight}px`
		}
	}, [isTextExpanded, windowHeight])

	useEffect(() => {
		if (isTaskExpanded && textRef.current && textContainerRef.current) {
			// Use requestAnimationFrame to ensure DOM is fully updated
			requestAnimationFrame(() => {
				// Check if refs are still valid
				if (textRef.current && textContainerRef.current) {
					let textContainerHeight = textContainerRef.current.clientHeight
					if (!textContainerHeight) {
						textContainerHeight = textContainerRef.current.getBoundingClientRect().height
					}
					const isOverflowing = textRef.current.scrollHeight > textContainerHeight

					setShowSeeMore(isOverflowing)
				}
			})
		}
	}, [task.text, windowWidth, isTaskExpanded])

	const isCostAvailable = useMemo(() => {
		const openAiCompatHasPricing =
			apiConfiguration?.apiProvider === "openai" &&
			apiConfiguration?.openAiModelInfo?.inputPrice &&
			apiConfiguration?.openAiModelInfo?.outputPrice
		if (openAiCompatHasPricing) {
			return true
		}
		return (
			apiConfiguration?.apiProvider !== "vscode-lm" &&
			apiConfiguration?.apiProvider !== "ollama" &&
			apiConfiguration?.apiProvider !== "lmstudio" &&
			apiConfiguration?.apiProvider !== "gemini"
		)
	}, [apiConfiguration?.apiProvider, apiConfiguration?.openAiModelInfo])

	const shouldShowPromptCacheInfo =
		doesModelSupportPromptCache && apiConfiguration?.apiProvider !== "openrouter" && apiConfiguration?.apiProvider !== "cline"

	const ContextWindowComponent = (
		<>
			{isTaskExpanded && contextWindow && (
				<div 
					style={{
						display: "flex",
						flexDirection: windowWidth < 270 ? "column" : "row",
						gap: "4px",
					}}>
					<div className={styles.contextWindowColumn}>
						<span className={styles.contextWindowBold}>
							{/* {windowWidth > 280 && windowWidth < 310 ? "Context:" : "Context Window:"} */}
							{labels.contextWindow}
						</span>
					</div>
					<div className={styles.contextWindowValue}>
						<span>{formatLargeNumber(lastApiReqTotalTokens || 0)}</span>
						<div 
							style={{
								display: "flex",
								alignItems: "center",
								gap: "3px",
								flex: 1,
							}}>
							<div className={styles.contextWindowBarContainer}>
								<div
									className={styles.contextWindowBar}
									style={{
										width: `${((lastApiReqTotalTokens || 0) / contextWindow) * 100}%`,
									}}
								/>
							</div>
							<span>{formatLargeNumber(contextWindow)}</span>
						</div>
					</div>
				</div>
			)}
		</>
	)

	return (
		<div className={styles.taskHeader}>
			<div className={styles.taskHeaderInner}>
				<div className={styles.headerRow}>
					<div
						className={styles.taskTitle}
						onClick={() => setIsTaskExpanded(!isTaskExpanded)}>
						<div className={styles.taskTitleIcon}>
							<span className={`codicon codicon-chevron-${isTaskExpanded ? "down" : "right"}`}></span>
						</div>
						<div className={styles.taskTitleText}>
							<span style={{ fontWeight: "bold" }}>
								{labels.task}
								{!isTaskExpanded && ":"}
							</span>
							{!isTaskExpanded && <span style={{ marginLeft: 4 }}>{highlightText(task.text, false)}</span>}
						</div>
					</div>
					{!isTaskExpanded && isCostAvailable && (
						<div className={styles.costBadge}>
							{labels.cost}{totalCost?.toFixed(4)}
						</div>
					)}
					<VSCodeButton appearance="icon" onClick={onClose} className={styles.closeButton}>
						<span className="codicon codicon-close"></span>
					</VSCodeButton>
				</div>
				{isTaskExpanded && (
					<>
						<div
							ref={textContainerRef}
							style={{
								marginTop: -2,
								fontSize: "var(--vscode-font-size)",
								overflowY: isTextExpanded ? "auto" : "hidden",
								wordBreak: "break-word",
								overflowWrap: "anywhere",
								position: "relative",
							}}>
							<div
								ref={textRef}
								style={{
									display: "-webkit-box",
									WebkitLineClamp: isTextExpanded ? "unset" : 3,
									WebkitBoxOrient: "vertical",
									overflow: "hidden",
									whiteSpace: "pre-wrap",
									wordBreak: "break-word",
									overflowWrap: "anywhere",
								}}>
								{highlightText(task.text, false)}
							</div>
							{!isTextExpanded && showSeeMore && (
								<div className={styles.seeMore}>
									<div className={styles.seeMoreGradient} />
									<div
										className={styles.seeMoreButton}
										onClick={() => setIsTextExpanded(!isTextExpanded)}>
										{labels.seeMore}
									</div>
								</div>
							)}
						</div>
						{isTextExpanded && showSeeMore && (
							<div
								className={styles.seeLess}
								onClick={() => setIsTextExpanded(!isTextExpanded)}>
								{labels.seeLess}
							</div>
						)}
						{task.images && task.images.length > 0 && <Thumbnails images={task.images} />}
						<div className={styles.details}>
							<div className={styles.tokensRow}>
								<div className={styles.tokens}>
									<span style={{ fontWeight: "bold" }}>{labels.tokens}</span>
									<span className={styles.tokenValue}>
										<i
											className="codicon codicon-arrow-up"
											style={{
												fontSize: "12px",
												fontWeight: "bold",
												marginBottom: "-2px",
											}}
										/>
										{formatLargeNumber(tokensIn || 0)}
									</span>
									<span className={styles.tokenValue}>
										<i
											className="codicon codicon-arrow-down"
											style={{
												fontSize: "12px",
												fontWeight: "bold",
												marginBottom: "-2px",
											}}
										/>
										{formatLargeNumber(tokensOut || 0)}
									</span>
								</div>
								{!isCostAvailable && (
									<DeleteButton taskSize={formatSize(currentTaskItem?.size)} taskId={currentTaskItem?.id} />
								)}
							</div>

							{shouldShowPromptCacheInfo &&
								(cacheReads !== undefined ||
									cacheWrites !== undefined ||
									apiConfiguration?.apiProvider === "anthropic") && (
									<div className={styles.cacheInfo}>
										<span style={{ fontWeight: "bold" }}>{labels.cache}</span>
										<span className={styles.tokenValue}>
											<i
												className="codicon codicon-database"
												style={{
													fontSize: "12px",
													fontWeight: "bold",
													marginBottom: "-1px",
												}}
											/>
											+{formatLargeNumber(cacheWrites || 0)}
										</span>
										<span className={styles.tokenValue}>
											<i
												className="codicon codicon-arrow-right"
												style={{
													fontSize: "12px",
													fontWeight: "bold",
													marginBottom: 0,
												}}
											/>
											{formatLargeNumber(cacheReads || 0)}
										</span>
									</div>
								)}
							{ContextWindowComponent}
							{isCostAvailable && (
								<div className={styles.apiCostRow}>
									<div className={styles.apiCost}>
										<span style={{ fontWeight: "bold" }}>{labels.apiCost}</span>
										<span>{labels.cost}{totalCost?.toFixed(4)}</span>
									</div>
									<DeleteButton taskSize={formatSize(currentTaskItem?.size)} taskId={currentTaskItem?.id} />
								</div>
							)}
							{checkpointTrackerErrorMessage && (
								<div className={styles.warning}>
									<i className="codicon codicon-warning" />
									<span>
										{checkpointTrackerErrorMessage.replace(/disabling checkpoints\.$/, "")}
										{checkpointTrackerErrorMessage.endsWith("disabling checkpoints.") && (
											<>
												<a
													onClick={() => {
														vscode.postMessage({
															type: "openExtensionSettings",
															text: "enableCheckpoints",
														})
													}}
													style={{
														color: "inherit",
														textDecoration: "underline",
														cursor: "pointer",
													}}>
													disabling checkpoints.
												</a>
											</>
										)}
										{checkpointTrackerErrorMessage.includes("Git must be installed to use checkpoints.") && (
											<>
												{" "}
												<a
													href="https://github.com/cline/cline/wiki/Installing-Git-for-Checkpoints"
													style={{
														color: "inherit",
														textDecoration: "underline",
													}}>
													See here for instructions.
												</a>
											</>
										)}
									</span>
								</div>
							)}
						</div>
					</>
				)}
			</div>

		</div>
	)
}

/**
 * Highlights slash-command in this text if it exists
 */
const highlightSlashCommands = (text: string, withShadow = true) => {
	const match = text.match(/^\s*\/([a-zA-Z0-9_-]+)(\s*|$)/)
	if (!match) {
		return text
	}

	const commandName = match[1]
	const validationResult = validateSlashCommand(commandName)

	if (!validationResult || validationResult !== "full") {
		return text
	}

	const commandEndIndex = match[0].length
	const beforeCommand = text.substring(0, text.indexOf("/"))
	const afterCommand = match[2] + text.substring(commandEndIndex)

	return [
		beforeCommand,
		<span key="slashCommand" className={withShadow ? "mention-context-highlight-with-shadow" : "mention-context-highlight"}>
			/{commandName}
		</span>,
		afterCommand,
	]
}

/**
 * Highlights & formats all mentions inside this text
 */
export const highlightMentions = (text: string, withShadow = true) => {
	const parts = text.split(mentionRegexGlobal)

	return parts.map((part, index) => {
		if (index % 2 === 0) {
			// This is regular text
			return part
		} else {
			// This is a mention
			return (
				<span
					key={index}
					className={withShadow ? "mention-context-highlight-with-shadow" : "mention-context-highlight"}
					style={{ cursor: "pointer" }}
					onClick={() => vscode.postMessage({ type: "openMention", text: part })}>
					@{part}
				</span>
			)
		}
	})
}

/**
 * Handles parsing both mentions and slash-commands
 */
export const highlightText = (text?: string, withShadow = true) => {
	if (!text) {
		return text
	}

	const resultWithSlashHighlighting = highlightSlashCommands(text, withShadow)

	if (resultWithSlashHighlighting === text) {
		// no highlighting done
		return highlightMentions(resultWithSlashHighlighting, withShadow)
	}

	if (Array.isArray(resultWithSlashHighlighting) && resultWithSlashHighlighting.length === 3) {
		const [beforeCommand, commandElement, afterCommand] = resultWithSlashHighlighting as [string, JSX.Element, string]

		return [beforeCommand, commandElement, ...highlightMentions(afterCommand, withShadow)]
	}

	return [text]
}

const DeleteButton: React.FC<{
	taskSize: string
	taskId?: string
}> = ({ taskSize, taskId }) => (
	<VSCodeButton
		appearance="icon"
		onClick={() => vscode.postMessage({ type: "deleteTaskWithId", text: taskId })}
		style={{ padding: "0px 0px" }}>
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: "3px",
				fontSize: "10px",
				fontWeight: "bold",
				opacity: 0.6,
			}}>
			<i className={`codicon codicon-trash`} />
			{taskSize}
		</div>
	</VSCodeButton>
)

export default memo(TaskHeader)
