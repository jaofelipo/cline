import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { vscode } from "@/utils/vscode"
import { memo } from "react"
import { formatLargeNumber } from "@/utils/format"
import styles from "./HistoryPreview.module.css"

type HistoryPreviewProps = {
	showHistoryView: () => void
}

const HistoryPreview = ({ showHistoryView }: HistoryPreviewProps) => {
	const { taskHistory } = useExtensionState()
	const handleHistorySelect = (id: string) => {
		vscode.postMessage({ type: "showTaskWithId", text: id })
	}

	const formatDate = (timestamp: number) => {
		const date = new Date(timestamp)
		return date
			?.toLocaleString("en-US", {
				month: "long",
				day: "numeric",
				hour: "numeric",
				minute: "2-digit",
				hour12: true,
			})
			.replace(", ", " ")
			.replace(" at", ",")
			.toUpperCase()
	}

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<span
					className={`codicon codicon-comment-discussion ${styles.commentIcon}`}
				></span>
				<span className={styles.headerText}>Recent Tasks</span>
			</div>

			<div className={styles.content}>
				{taskHistory
					.filter((item) => item.ts && item.task)
					.slice(0, 3)
					.map((item) => (
						<div key={item.id} className={styles.historyPreviewItem} onClick={() => handleHistorySelect(item.id)}>
							<div className={styles.itemContainer}>
								<div className={styles.itemDate}>
									<span>{formatDate(item.ts)}</span>
								</div>
								<div className={styles.itemTask}>
									{item.task}
								</div>
								<div className={styles.itemDetails}>
									<span>
										Tokens: ↑{formatLargeNumber(item.tokensIn || 0)} ↓{formatLargeNumber(item.tokensOut || 0)}
									</span>
									{!!item.cacheWrites && (
										<>
											{" • "}
											<span>
												Cache: +{formatLargeNumber(item.cacheWrites || 0)} →{" "}
												{formatLargeNumber(item.cacheReads || 0)}
											</span>
										</>
									)}
									{!!item.totalCost && (
										<>
											{" • "}
											<span>API Cost: ${item.totalCost?.toFixed(4)}</span>
										</>
									)}
								</div>
							</div>
						</div>
					))}
				<div className={styles.viewAllButtonContainer}>
					<VSCodeButton
						appearance="icon"
						onClick={() => showHistoryView()}
					>
						<div className={styles.viewAllButton}>
							View all history
						</div>
					</VSCodeButton>
				</div>
			</div>
		</div>
	)
}

export default memo(HistoryPreview)
