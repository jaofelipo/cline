import { ApiMetrics } from "./ExtensionMessage"

export type HistoryItem = {
	id: string
	ts: number
	task: string
	usage?:ApiMetrics
	size?: number
	shadowGitConfigWorkTree?: string
	conversationHistoryDeletedRange?: [number, number]
}
