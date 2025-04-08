import React, { useState, useEffect } from "react"
import { vscode } from "@/utils/vscode"
import { TaskFeedbackType } from "@shared/WebviewMessage"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import styles from "./TaskFeedbackButtons.module.css"
import { useExtensionState } from '../../context/ExtensionStateContext'

interface TaskFeedbackButtonsProps {
	messageTs: number
	isFromHistory?: boolean
	style?: React.CSSProperties
}

const TaskFeedbackButtons: React.FC<TaskFeedbackButtonsProps> = ({ messageTs, isFromHistory = false, style }) => {
	const [feedback, setFeedback] = useState<TaskFeedbackType | null>(null)
	const [shouldShow, setShouldShow] = useState<boolean>(true)
	const { locale: { TaskFeedbackButtons: labels } } = useExtensionState()

	// Check localStorage on mount to see if feedback was already given for this message
	useEffect(() => {
		try {
			const feedbackHistory = localStorage.getItem("taskFeedbackHistory") || "{}"
			const history = JSON.parse(feedbackHistory)
			// Check if this specific message timestamp has received feedback
			if (history[messageTs]) {
				setShouldShow(false)
			}
		} catch (e) {
			console.error("Error checking feedback history:", e)
		}
	}, [messageTs])

	// Don't show buttons if this is from history or feedback was already given
	if (isFromHistory || !shouldShow) {
		return null
	}

	const handleFeedback = (type: TaskFeedbackType) => {
		if (feedback !== null) return // Already provided feedback

		setFeedback(type)

		// Send feedback to extension
		vscode.postMessage({
			type: "taskFeedback",
			feedbackType: type,
		})

		// Store in localStorage that feedback was provided for this message
		try {
			const feedbackHistory = localStorage.getItem("taskFeedbackHistory") || "{}"
			const history = JSON.parse(feedbackHistory)
			history[messageTs] = true
			localStorage.setItem("taskFeedbackHistory", JSON.stringify(history))
		} catch (e) {
			console.error("Error updating feedback history:", e)
		}
	}

	return (
		<div className={styles.container} style={style}>
			<div className={styles.buttonsContainer}>
				<div className={styles.buttonWrapper}>
					<VSCodeButton
						appearance="icon"
						onClick={() => handleFeedback("thumbs_up")}
						disabled={feedback !== null}
						title={labels.like}
						aria-label={labels.like}>
						<span className={styles.iconWrapper}>
							<span
								className={`codicon ${feedback === "thumbs_up" ? "codicon-thumbsup-filled" : "codicon-thumbsup"}`}
							/>
						</span>
					</VSCodeButton>
				</div>
				<div className={styles.buttonWrapper}>
					<VSCodeButton
						appearance="icon"
						onClick={() => handleFeedback("thumbs_down")}
						disabled={feedback !== null && feedback !== "thumbs_down"}
						title={labels.dislike}
						aria-label={labels.dislike}>
						<span className={styles.iconWrapper}>
							<span
								className={`codicon ${feedback === "thumbs_down" ? "codicon-thumbsdown-filled" : "codicon-thumbsdown"}`}
							/>
						</span>
					</VSCodeButton>
				</div>
				{/* <VSCodeButtonLink
					href="https://github.com/cline/cline/issues/new?template=bug_report.yml"
					appearance="icon"
					title="Report a bug"
					aria-label="Report a bug">
					<span className="codicon codicon-bug" />
				</VSCodeButtonLink> */}
			</div>
		</div>
	)
}

export default TaskFeedbackButtons
