import { ClineMessage } from "./ExtensionMessage"

/**
 * Combines sequences of command and command_output messages in an array of ClineMessages.
 *
 * This function processes an array of ClineMessages objects, looking for sequences
 * where a 'command' message is followed by one or more 'command_output' messages.
 * When such a sequence is found, it combines them into a single message, merging
 * their text contents.
 *
 * @param messages - An array of ClineMessage objects to process.
 * @returns A new array of ClineMessage objects with command sequences combined.
 *
 * @example
 * const messages: ClineMessage[] = [
 *   { type: 'ask', ask: 'command', text: 'ls', ts: 1625097600000 },
 *   { type: 'ask', ask: 'command_output', text: 'file1.txt', ts: 1625097601000 },
 *   { type: 'ask', ask: 'command_output', text: 'file2.txt', ts: 1625097602000 }
 * ];
 * const result = simpleCombineCommandSequences(messages);
 * // Result: [{ type: 'ask', ask: 'command', text: 'ls\nfile1.txt\nfile2.txt', ts: 1625097600000 }]
 */
export function combineCommandSequences(messages: ClineMessage[]): ClineMessage[] 
{
    const result: ClineMessage[] = []

	let commandMsg = undefined

    for (const msg of messages) 
	{
        if (msg.ask === "command" || msg.say === "command") 
		{
			commandMsg = { ...msg }
			result.push(commandMsg)
		}
        else if (msg.ask === "command_output" || msg.say === "command_output") 
		{
			if (commandMsg)
			{
				if (!commandMsg.text?.includes(COMMAND_OUTPUT_STRING)) 
					commandMsg.text += `\n${COMMAND_OUTPUT_STRING}`

				if (msg.text?.length ?? 0 > 0) 
					commandMsg.text += "\n" + msg.text
			}
            commandMsg = undefined
		}
        else 
		{
			result.push(msg)
		}
    }
    return result;
}
export const COMMAND_OUTPUT_STRING = "Output:"
export const COMMAND_REQ_APP_STRING = "REQ_APP"
