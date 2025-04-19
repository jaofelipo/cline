
import { ApiStreamUsageChunk } from "../api/transform/stream"
import { ModelInfo } from "../shared/api"
import { ApiMetrics } from "../shared/ExtensionMessage"

export function calculateApiCost(modelInfo: ModelInfo, cost:ApiMetrics): number 
{
	let cacheWritesCost = (cost.cacheWrites && modelInfo.cacheWritesPrice)  ? (modelInfo.cacheWritesPrice / 1_000_000) * cost.cacheWrites : 0
	let cacheReadsCost = (cost.cacheReads && modelInfo.cacheReadsPrice) ? (modelInfo.cacheReadsPrice / 1_000_000) * cost.cacheReads : 0
	const baseInputCost = ((modelInfo.inputPrice || 0) / 1_000_000) * cost.tokensIn
	const outputCost = ((modelInfo.outputPrice || 0) / 1_000_000) * cost.tokensOut
	return cacheWritesCost + cacheReadsCost + baseInputCost + outputCost
//	return totalCost
}

export function updateCost(cost:any, chunk:ApiStreamUsageChunk)
{
	cost.tokensIn += chunk.inputTokens
	cost.tokensOut += chunk.outputTokens
	cost.cacheWrites += chunk.cacheWriteTokens ?? 0
	cost.cacheReads += chunk.cacheReadTokens ?? 0
	cost.totalCost = chunk.totalCost
}
