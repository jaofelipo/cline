import { ModelInfo } from "@shared/api"
import { ApiMetrics } from "@shared/ExtensionMessage"

// For OpenAI compliant usage, the input tokens count INCLUDES the cached tokens
// For Anthropic compliant usage, the input tokens count does NOT include the cached tokens
// Anthropic style doesn't need totalInputTokensForPricing as its inputTokens already represents the total
export function calculateApiCost(modelInfo: ModelInfo, cost:ApiMetrics, useOpenAIMode:boolean): number 
{
	cost.cacheWrites = cost.cacheWrites || 0
	cost.cacheReads = cost.cacheReads || 0

	let inputTokens = cost.tokensIn // Note: For OpenAI-style, this is non-cached tokens. For Anthropic-style, this is total input tokens.
	let totalInputTokensForPricing = undefined

	if(useOpenAIMode)
	{
		inputTokens = Math.max(0, cost.tokensIn - cost.cacheWrites - cost.cacheReads)
		totalInputTokensForPricing = cost.tokensIn
	}

	// Determine effective input price
	let effectiveInputPrice = modelInfo.inputPrice || 0
	if (modelInfo.inputPriceTiers && modelInfo.inputPriceTiers.length > 0 && totalInputTokensForPricing !== undefined) {
		// Ensure tiers are sorted by tokenLimit ascending before finding
		const sortedInputTiers = [...modelInfo.inputPriceTiers].sort((a, b) => a.tokenLimit - b.tokenLimit)
		// Find the first tier where the total input tokens are less than or equal to the limit
		const tier = sortedInputTiers.find((t) => totalInputTokensForPricing! <= t.tokenLimit)
		if (tier) {
			effectiveInputPrice = tier.price
		} else {
			// Should ideally not happen if Infinity is used for the last tier, but fallback just in case
			effectiveInputPrice = sortedInputTiers[sortedInputTiers.length - 1]?.price || 0
		}
	}

	// Determine effective output price (based on total *input* tokens for pricing)
	let effectiveOutputPrice = modelInfo.outputPrice || 0
	if (modelInfo.outputPriceTiers && modelInfo.outputPriceTiers.length > 0 && totalInputTokensForPricing !== undefined) {
		// Ensure tiers are sorted by tokenLimit ascending before finding
		const sortedOutputTiers = [...modelInfo.outputPriceTiers].sort((a, b) => a.tokenLimit - b.tokenLimit)
		const tier = sortedOutputTiers.find((t) => totalInputTokensForPricing! <= t.tokenLimit)
		if (tier) {
			effectiveOutputPrice = tier.price
		} else {
			// Should ideally not happen if Infinity is used for the last tier, but fallback just in case
			effectiveOutputPrice = sortedOutputTiers[sortedOutputTiers.length - 1]?.price || 0
		}
	}

	const cacheWritesCost = ((modelInfo.cacheWritesPrice || 0) / 1_000_000) * cost.cacheWrites
	const cacheReadsCost = ((modelInfo.cacheReadsPrice || 0) / 1_000_000) * cost.cacheReads
	// Use effectiveInputPrice for baseInputCost. Note: 'inputTokens' here is the potentially adjusted count (e.g., non-cached for OpenAI)
	const baseInputCost = (effectiveInputPrice / 1_000_000) * inputTokens
	
	const outputCost = (effectiveOutputPrice / 1_000_000) * cost.tokensOut // Use effectiveOutputPrice for outputCost

	const totalCost = cacheWritesCost + cacheReadsCost + baseInputCost + outputCost
	return totalCost
}
