export type ApiStream = AsyncGenerator<ApiStreamTextChunk | ApiStreamReasoningChunk | ApiStreamUsageChunk>

interface ApiStreamTextChunk {
	type: "text"
	text: string
}

interface ApiStreamReasoningChunk {
	type: "reasoning"
	reasoning: string
}

export interface ApiStreamUsageChunk {
	type: "usage"
	inputTokens: number
	outputTokens: number
	cacheWriteTokens?: number
	cacheReadTokens?: number
	totalCost?: number // openrouter
}


