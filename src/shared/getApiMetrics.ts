import { ApiMetrics, ClineMessage } from "./ExtensionMessage"

/**
 * Calculates API metrics from an array of ClineMessages.
 *
 * This function processes 'api_req_started' messages that have been combined with their
 * corresponding 'api_req_finished' messages by the combineApiRequests function. It also takes into account 'deleted_api_reqs' messages, which are aggregated from deleted messages.
 * It extracts and sums up the tokensIn, tokensOut, cacheWrites, cacheReads, and cost from these messages.
 *
 * @param messages - An array of ClineMessage objects to process.
 * @returns An ApiMetrics object containing totalTokensIn, totalTokensOut, totalCacheWrites, totalCacheReads, and totalCost.
 *
 * @example
 * const messages = [
 *   { type: "say", say: "api_req_started", text: '{"request":"GET /api/data","tokensIn":10,"tokensOut":20,"cost":0.005}', ts: 1000 }
 * ];
 * const { totalTokensIn, totalTokensOut, totalCost } = getApiMetrics(messages);
 * // Result: { totalTokensIn: 10, totalTokensOut: 20, totalCost: 0.005 }
 */
export function getApiMetrics(messages: ClineMessage[]): ApiMetrics {
	
	const result: ApiMetrics = {
		tokensIn: 0,
		tokensOut: 0,
		cacheWrites: undefined,
		cacheReads: undefined,
		cost: 0
	}

	messages.forEach((message) => {
		if (message.type === "say" && (message.say === "api_req_started" || message.say === "deleted_api_reqs") && message.text) {
			try 
			{
				const parsedData = JSON.parse(message.text)
				const { tokensIn, tokensOut, cacheWrites, cacheReads, cost } = parsedData

				if (typeof tokensIn === "number") 
					result.tokensIn += tokensIn
				if (typeof tokensOut === "number") 
					result.tokensOut += tokensOut
				if (typeof cacheWrites === "number") 
					result.cacheWrites = (result.cacheWrites ?? 0) + cacheWrites
				if (typeof cacheReads === "number") 
					result.cacheReads = (result.cacheReads ?? 0) + cacheReads
				if (typeof cost === "number") 
					result.cost = (result.cost ?? 0) + cost
			} 
			catch (error) {}
		}
	})

	return result
}
