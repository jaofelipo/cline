import Anthropic from "@anthropic-ai/sdk";
import { ToolUse, ToolUseName } from "../assistant-message";
import { AutoApprovalSettings, DEFAULT_AUTO_APPROVAL_SETTINGS } from "@/shared/AutoApprovalSettings";
import path from "path";
import { cwd } from ".";

export class TaskModel
{
    apiConversationHistory: Anthropic.MessageParam[]
    consecutiveMistakeCount: number = 0
    autoApprovalSettings: AutoApprovalSettings = DEFAULT_AUTO_APPROVAL_SETTINGS    

    constructor(conversation?: Anthropic.MessageParam[])
    {
        this.apiConversationHistory = (conversation) ? conversation : []
    }


    addToApiConversationHistory(role:"user"|"assistant", content:any[]|string) 
    {
        if (typeof content === 'string')
            content = [{type: "text",  text: content}]
        this.apiConversationHistory.push({role, content}) 
    }  

    // Check if the tool should be auto-approved based on the settings
    // Returns bool for most tools, and tuple for tools with nested settings
    shouldAutoApproveTool(toolName: ToolUseName, isSafeScope?:boolean): boolean
    {
        let autoApproveSafe = false
        let autoApproveNonSafe = false

        if (this.autoApprovalSettings.enabled) 
        {
            switch (toolName) 
            {
                case "read_file":
                case "list_files":
                case "list_code_definition_names":
                case "search_files":
                    autoApproveSafe = this.autoApprovalSettings.actions.readFiles
                    autoApproveNonSafe = this.autoApprovalSettings.actions.readFilesExternally ?? false
                    break
                case "write_to_file":
                case "replace_in_file":
                    autoApproveSafe = this.autoApprovalSettings.actions.editFiles
                    autoApproveNonSafe = this.autoApprovalSettings.actions.editFilesExternally ?? false
                    break
                case "execute_command":
                    autoApproveSafe = this.autoApprovalSettings.actions.executeSafeCommands ?? false
                    autoApproveNonSafe = this.autoApprovalSettings.actions.executeAllCommands ?? false
                    break
                case "browser_action":
                    return this.autoApprovalSettings.actions.useBrowser
                case "access_mcp_resource":
                case "use_mcp_tool":
                    return this.autoApprovalSettings.actions.useMcp
                default:
                    return false
            }
        }
   		// If the model says this command is safe and auto approval for safe commands is true, execute the command
		// If the model says the command is risky, but *BOTH* auto approve settings are true, execute the command
        return ((isSafeScope && autoApproveSafe) || (!isSafeScope && autoApproveSafe && autoApproveNonSafe))
    }

    // Check if the tool should be auto-approved based on the settings
    // and the path of the action. Returns true if the tool should be auto-approved
    // based on the user's settings and the path of the action.
    shouldAutoApproveToolWithPath(block:ToolUse): boolean 
    {
        const safeAccess: boolean = (block.params.path) ? path.resolve(cwd, block.params.path).startsWith(cwd) : false
        // Get auto-approve settings for local and external edits
        return this.shouldAutoApproveTool(block.name, safeAccess)
    }
}
