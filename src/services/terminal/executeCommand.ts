import { cwd, localeAssistant, Task } from "@/core/task";
import { resetTimer } from "@/utils/delayUtils";
import { setTimeout as delay } from "node:timers/promises"

// Tools
export async function executeCommandTool(this:Task, command: string): Promise<{text:string, images?:string[]} | string> 
{   
    const terminalInfo = await this.terminalManager.getOrCreateTerminal(cwd)
    terminalInfo.terminal.show() // weird visual bug when creating new terminals (even manually) where there's an empty space at the top.
    const process = this.terminalManager.prepareCommand(terminalInfo, command)

    let userFeedback: { text?: string; images?: string[] } | undefined
    let firstRun = true
    let result = ""
    let completed = false

    let outputBuffer: string[] = []
    let outputBufferSize: number = 0
    let chunkTimer: NodeJS.Timeout | undefined = undefined

    process.on("line", (line) => onLineReceived(this, line))
    process.once("completed", () => completed = true)
    process.once("no_shell_integration", async () => await this.say("shell_integration_warning"))

    const fullOutput = await process.run()

    await delay(50) // Wait for a short delay to ensure all messages are sent to the webview

    result = result.trim()

    if (userFeedback) 
    {
        await this.say("user_feedback", userFeedback.text, userFeedback.images)
        return {text: localeAssistant.userFeedback(result, userFeedback.text), images:userFeedback.images} 
    }

    return (completed) ? localeAssistant.commandExecuted(result) : localeAssistant.commandRunning(result, true)


    async function onLineReceived (task:Task, line: string): Promise<void>
    {
        result += line + "\n"
        if (firstRun) 
        {
            outputBuffer.push(line)
            outputBufferSize += Buffer.byteLength(line, "utf8")
            // Flush if buffer is large enough, then delay to zero
            let delay = (outputBuffer.length >= 20 || outputBufferSize >= 2048 /*2k*/) ? 0 : 100 //delay 100 ms if buffer less than 2kb or 20 line
            chunkTimer = resetTimer(chunkTimer, () => sendToWebView(task), delay)
        }
        else
        {
            task.say("command_output", line)
        }

        async function sendToWebView (task:Task) 
        {
            if (outputBuffer.length > 0)
            {
                firstRun = false
                const chunk = outputBuffer.join("\n")
                const response = await task.ask("command_output", chunk)
                if (response?.askResponse !== "yes") 
                    userFeedback = { text:response?.text, images:response?.images }
                process.continue()
            }
        }
    }
}
