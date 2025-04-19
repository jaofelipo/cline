import { ClineMessage } from "./ExtensionMessage"

/**
 * Combines API request start and finish messages in an array of ClineMessages.
 *
 * This function looks for pairs of 'api_req_started' and 'api_req_finished' messages.
 * When it finds a pair, it combines them into a single 'api_req_combined' message.
 * The JSON data in the text fields of both messages are merged.
 *
 * @param messages - An array of ClineMessage objects to process.
 * @returns A new array of ClineMessage objects with API requests combined.
 *
 * @example
 * const messages = [
 *   { type: "say", say: "api_req_started", text: '{"request":"GET /api/data"}', ts: 1000 },
 *   { type: "say", say: "api_req_finished", text: '{"cost":0.005}', ts: 1001 }
 * ];
 * const result = combineApiRequests(messages);
 * // Result: [{ type: "say", say: "api_req_started", text: '{"request":"GET /api/data","cost":0.005}', ts: 1000 }]
 */
export function combineApiRequests(messages: ClineMessage[]): ClineMessage[] 
{
    const combinedApiRequests: ClineMessage[] = []
    let startedRequest

    for (const message of messages) 
	{
        if (message.type === "say" && message.say === "api_req_started") 
		{
            startedRequest = { ...message }
            combinedApiRequests.push(startedRequest)
        }
		else if (startedRequest && message.type === "say" && message.say === "api_req_finished") 
		{
            const startedData = JSON.parse(startedRequest.text || "{}")
            const finishedData = JSON.parse(message.text || "{}")
            startedRequest.text = JSON.stringify( {...startedData, ...finishedData} )
            startedRequest = null
        } 
		else if (message.type !== "say" || message.say !== "api_req_finished") 
		{
			combinedApiRequests.push(message)
        }
    }
    return combinedApiRequests
}