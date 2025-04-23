import path from "path"
import * as vscode from "vscode"
import { waitForCondition } from "../umbit/utils/delayUtils"
import { cwd, isDesktop } from "../core/task"
import { ClineIgnoreController } from "../core/ignore/ClineIgnoreController"
import { TerminalInfo, TerminalManager } from "../integrations/terminal/TerminalManager"
import { listFiles } from "../services/glob/list-files"
import { formatResponse } from "../core/prompts/responses"
import { dateTimeformatter, dateTimeformatterTimeZone } from "./string"
import { FileContextTracker } from "@/core/context/context-tracking/FileContextTracker"
import { getContextWindowInfo } from "@/core/context/context-management/context-window-utils"
import { combineApiRequests } from "@/shared/combineApiRequests"
import { combineCommandSequences } from "@/shared/combineCommandSequences"
import { findLast } from "@/shared/array"

export async function getEnvironmentDetails(
    terminalManager: TerminalManager,
    clineIgnoreController: ClineIgnoreController,
    fileContextTracker:FileContextTracker,
    includeFileDetails: boolean = false) 
{
    let details = ""

    details += "\n\n# VSCode Visible Files" // Useful to know if the user went from one file to another between messages
    details += getVisibleFiles()
    details += "\n\n# VSCode Open Tabs"
    details += getOpenTabs()

    const busyTerminals = terminalManager.getTerminals(true)

    if (busyTerminals.length > 0) // wait for terminals to cool down
        await waitForCondition(() => busyTerminals.every((t) => !t.process?.isHot), 100, 15_000)

    details += generateTerminalDetails(busyTerminals, "# Actively Running Terminals", true);
    details += generateTerminalDetails(terminalManager.getTerminals(false), "# Inactive Terminals", false);

    details += getRecentModifiedFiles(fileContextTracker.getAndClearRecentlyModifiedFiles())

    details += generateCurrentTimeInfo()

    if (includeFileDetails) 
    {
        details += `\n\n# Current Working Directory (${cwd.toPosix()}) Files\n`
        if (isDesktop) // don't want to immediately access desktop since it would show permission popup
            details += "(Desktop files not shown automatically. Use list_files to explore if needed.)"
        else 
            details += formatResponse.formatFilesList(cwd, ...(await listFiles(cwd, true, 200)), clineIgnoreController);
    }
    
/*
    // Add context window usage information
    const { contextWindow, maxAllowedSize } = getContextWindowInfo(this.api)

    // Get the token count from the most recent API request to accurately reflect context management
    function getTotalTokensFromApiReqMessage (msg: ClineMessage) 
    {
        try 
        {
            if (msg.text)
            {
                const { tokensIn, tokensOut, cacheWrites, cacheReads } = JSON.parse(msg.text)
                return (tokensIn || 0) + (tokensOut || 0) + (cacheWrites || 0) + (cacheReads || 0)
            }
        }
        catch (e) {}
        return 0
    }

    const modifiedMessages = combineApiRequests(combineCommandSequences(this.clineMessages.slice(1)))
    const lastApiReqMessage = findLast(modifiedMessages, (msg) => {
        if (msg.say !== "api_req_started") {
            return false
        }
        return getTotalTokensFromApiReqMessage(msg) > 0
    })

    const lastApiReqTotalTokens = lastApiReqMessage ? getTotalTokensFromApiReqMessage(lastApiReqMessage) : 0
    const usagePercentage = Math.round((lastApiReqTotalTokens / contextWindow) * 100)

    details += "\n\n# Context Window Usage"
    details += `\n${lastApiReqTotalTokens.toLocaleString()} / ${(contextWindow / 1000).toLocaleString()}K tokens used (${usagePercentage}%)`

    details += "\n\n# Current Mode"
    if (this.chatSettings.mode === "plan") {
        details += "\nPLAN MODE\n" + formatResponse.planModeInstructions()
    } else {
        details += "\nACT MODE"
    }    
*/
    return `<environment_details>\n${details.trim()}\n</environment_details>`

    function getVisibleFiles():string
    {
        const visibleFiles = new Array()
        for (const editor of vscode.window.visibleTextEditors || []) 
        {
            const absolutePath = editor.document?.uri?.fsPath
            if (absolutePath && clineIgnoreController.validateAccess(absolutePath))
                visibleFiles.push(path.relative(cwd, absolutePath).toPosix())
        }
        return "\n" + (visibleFiles.length > 0)  ? visibleFiles.join("\n") : "(No visible files)" 
    }  
    
    function getOpenTabs(): string 
    {
        const openTabs = new Array()
        for (const group of vscode.window.tabGroups.all) 
        {
            for (const tab of group.tabs) 
            {
                const absolutePath = (tab.input as vscode.TabInputText)?.uri?.fsPath
                if (absolutePath && clineIgnoreController.validateAccess(absolutePath))
                    openTabs.push(path.relative(cwd, absolutePath).toPosix())
          }
        }
        return "\n" + (openTabs.length > 0 ? openTabs.join("\n") : "(No open tabs)")
    }

    function generateTerminalDetails(terminals:TerminalInfo[], sectionTitle:string, isBusyTerminal=true) 
    {
        const details = [sectionTitle];
        for (const terminal of terminals) 
        {
            if (isBusyTerminal)
                details.push(`## Original command: \`${terminal.lastCommand}\``);
            const newOutput = terminalManager.getUnretrievedOutput(terminal);
            if (newOutput)
                details.push((isBusyTerminal ? "" : `## ${terminal.lastCommand}\n`) + `### New Output\n${newOutput}`);
        }
        return (details.length > 1) ? "\n\n" + details.join('\n') : "";
    }

    function getRecentModifiedFiles(recentlyModifiedFiles: string[])
    {
        let details = ''
        if (recentlyModifiedFiles.length > 0) 
           details +=
            "\n\n# Recently Modified Files\nThese files have been modified since you last accessed them (file was just edited so you may need to re-read it before editing):"
            
        recentlyModifiedFiles.forEach((filePath) => details += `\n${filePath}`)
        return details
    }

    function generateCurrentTimeInfo()
    {
        // Add current time information with timezone
        const now = new Date()
        const timeZoneOffset = -now.getTimezoneOffset() / 60 // Convert to hours and invert sign to match conventional notation
        const timeZoneOffsetStr = `${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}:00`
        return `\n\n# Current Time\n${dateTimeformatter.format(now)} (${dateTimeformatterTimeZone}, UTC${timeZoneOffsetStr})`
    }
}