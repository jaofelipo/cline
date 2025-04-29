import { serializeError } from "serialize-error";
import { Labels } from "./locale";
import path from "path";
import { ToolUse } from "../core/assistant-message";
import { LOCK_TEXT_SYMBOL } from "@/core/ignore/ClineIgnoreController";


export const en:Labels = {
    date:{
        day: 'day',
        days: 'days',
        hour: 'hour',
        hours: 'hours',
        minute: 'minute',
        minutes: 'minutes',
        justNow: 'just now',
        ago: 'ago'
    },
    cline:{
        toolUseInstructionsReminder: "# Reminder: Instructions for Tool Use\n" + 
            "Tool uses are formatted using XML-style tags. " + 
            "The tool name is enclosed in opening and closing tags, and each parameter is similarly enclosed within its own set of tags. " + 
            "Here's the structure:\n\n" +
                "<tool_name>\n"+
                    "<parameter1_name>value1</parameter1_name>\n"+
                    "<parameter2_name>value2</parameter2_name>\n"+
                    "...\n"+
                "</tool_name>\n\n"+
            "For example:\n\n"+
            "<attempt_completion>\n"+
                "<result> I have completed the task... </result>\n"+
            "</attempt_completion>\n\n"+
            "Always adhere to this format for all tool uses to ensure proper parsing and execution.",

        shellIntegrationWarning: "Shell integration warning.",
        userFeedbackTitle: "User Feedback",
        clineTrouble:"Cline is having trouble. Would you like to continue the task?",
        claudeLimit: 'This may indicate a failure in his thought process or inability to use a tool properly, which can be mitigated with some user guidance (e.g. "Try breaking down the task into smaller steps").',
        nonClaudeLimit: "Cline uses complex prompts and iterative task execution that may be challenging for less capable models. For best results, it's recommended to use Claude 3.5 Sonnet for its advanced agentic coding capabilities.",
        maxRequestsReached: (maxRequests:number, ask:boolean=false) => `Cline has auto-approved ${maxRequests.toString()} API requests. ${ask ? "Would you like to reset the count and proceed with the task?" : ""}`,
        unexpectedApi: "Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output.",
        assistantFailure: "Failure: I did not provide a response.",
        instanceAborted: "Cline instance aborted",
        toolUsedErrorInterruption: "\n\n[Response interrupted by a tool use result. Only one tool may be used at a time and should be placed at the end of the message.]",
        interruptedByApiErrorOrUser: (isError:boolean=false) => `\n\n[Response interrupted by ${(isError) ? "API Error" : "user feedback"}]`,
        toolError: (error:string) => `The tool execution failed with the following error:\n<error>\n${error}\n</error>`,
        clineIgnoreError: (path: string) => en.cline.toolError(
            `Access to ${path} is blocked by the .clineignore file settings. You must try to continue in the task without using this file, or ask the user to update the .clineignore file.`),
        tooManyMistakes: (feedback?: string) =>
            `You seem to be having trouble proceeding. The user has provided the following feedback to help guide you:\n<feedback>\n${feedback}\n</feedback>`,
        noToolsUsed: () => "[ERROR] You did not use a tool in your previous response! Please retry with a tool use.\n\n" +
            en.cline.toolUseInstructionsReminder +
            "\n\n# Next Steps\n\n" +
            "If you have completed the user's task, use the attempt_completion tool. \n" +
            "If you require additional information from the user, use the ask_followup_question tool. \n" +
            "Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. \n" +
            "(This is an automated message, so do not respond to it conversationally.)",
        interruptTask: "Task was interrupted before this tool call could be completed.",
        wasRecent: "\n\nIMPORTANT: If the last tool use was a replace_in_file or write_to_file that was interrupted, the file was reverted back to its original state " + 
            "before the interrupted edit, and you do NOT need to re-read the file as you already have its up-to-date contents.",
        taskResumption: (time:string, cwd:string, wasRecent:boolean, text?:string) => "[TASK RESUMPTION] This task was interrupted " + time + 
            ". It may or may not be complete, so " + 
            "please reassess the task context. Be aware that the project state may have changed since then. The current working directory is now '" + cwd + 
            "'. If the task has not been completed, retry the last step before interruption and proceed with completing the task.\n\nNote: If you previously attempted " + 
            "a tool use that the user did not provide a result for, you should assume the tool use was not successful and assess whether you should retry. " + 
            "If the last tool was a browser_action, the browser has been closed and you must launch a new browser if needed. " 
            + (wasRecent) ? en.cline.wasRecent : ""
            + (text) ? `\n\nNew instructions for task continuation:\n<user_message>\n${text}\n</user_message>` : "",
    },
    assistantMessage:
    {
        duplicateFileReadNotice: `[[NOTE] This file read has been removed to save space in the context window. Refer to the latest file read for the most up to date version of this file.]`,        
        newTask:"The user has created a new task with the provided context.",
        contextTruncationNotice: `[NOTE] Some previous conversation history with the user has been removed to maintain optimal context window length. The initial user task and the most recent exchanges have been retained for continuity, while intermediate conversation history has been removed. Please keep this in mind as you continue assisting the user.`,
        newTaskWithFeedback: (text:string) => `The user provided feedback instead of creating a new task:\n<feedback>\n${text}\n</feedback>`,
        condenseFeedback: (text:string) => `The user provided feedback on the condensed conversation summary:\n<feedback>\n${text}\n</feedback>`,
        fileEditByUser: (relPath: string, userEdits: string, autoFormatted?: string, content?: string, newProblems?: string) =>
            `The user made the following updates to your content:\n\n${userEdits}\n\n` +
            (autoFormatted
                ? `The user's editor also applied the following auto-formatting to your content:\n\n${autoFormatted}\n\n(Note: Pay close attention to changes such as single quotes being converted to double quotes, semicolons being removed or added, long lines being broken into multiple lines, adjusting indentation style, adding/removing trailing commas, etc. This will help you ensure future SEARCH/REPLACE operations to this file are accurate.)\n\n`
                : "") +
            `The updated content, which includes both your original modifications and the additional edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file that was saved:\n\n` +
            `<final_file_content path="${relPath.toPosix()}">\n${content}\n</final_file_content>\n\n` +
            `Please note:\n` +
            `1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
            `2. Proceed with the task using this updated file content as the new baseline.\n` +
            `3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
            `4. IMPORTANT: For any future changes to this file, use the final_file_content shown above as your reference. This content reflects the current state of the file, including both user edits and any auto-formatting (e.g., if you used single quotes but the formatter converted them to double quotes). Always base your SEARCH/REPLACE operations on this final version to ensure accuracy.\n` +
            `${newProblems}`,
        fileEdit: (relPath: string, autoFormatted?: string, content?: string, newProblems?: string) =>
            `The content was successfully saved to ${relPath.toPosix()}.\n\n` +
            (autoFormatted
                ? `Along with your edits, the user's editor applied the following auto-formatting to your content:\n\n${autoFormatted}\n\n(Note: Pay close attention to changes such as single quotes being converted to double quotes, semicolons being removed or added, long lines being broken into multiple lines, adjusting indentation style, adding/removing trailing commas, etc. This will help you ensure future SEARCH/REPLACE operations to this file are accurate.)\n\n`
                : "") +
            `Here is the full, updated content of the file that was saved:\n\n` +
            `<final_file_content path="${relPath.toPosix()}">\n${content}\n</final_file_content>\n\n` +
            `IMPORTANT: For any future changes to this file, use the final_file_content shown above as your reference. This content reflects the current state of the file, including any auto-formatting (e.g., if you used single quotes but the formatter converted them to double quotes). Always base your SEARCH/REPLACE operations on this final version to ensure accuracy.\n\n` +
            `${newProblems}`,
        diffError: (error:Error, relPath: string, originalContent: string | undefined) => 
            en.cline.toolError(`${(error as Error)?.message}\n\n This is likely because the SEARCH block content doesn't match ` + 
            `exactly with what's in the file, or if you used multiple SEARCH/REPLACE blocks they may not have been in the order they appear in the file.\n\n` + 
            `The file was reverted to its original state:\n\n<file_content path="${relPath.toPosix()}">\n${originalContent}\n</file_content>\n\n` +
            `Now that you have the latest state of the file, try the operation again with fewer, more precise SEARCH blocks. For large files especially, it may ` + 
            `be prudent to try to limit yourself to <5 SEARCH/REPLACE blocks at a time, then wait for the user to respond with the result of the operation before ` + 
            `following up with another replace_in_file call to make additional edits.\n(If you run into this error 3 times in a row, you may use the write_to_file ` + 
            `tool as a fallback.)`),
        condense: `The user has accepted the condensed conversation summary you generated. This summary covers important details of the historical conversation with the user which has been truncated.\n<explicit_instructions type="condense_response">It's crucial that you respond by ONLY asking the user what you should work on next. You should NOT take any initiative or make any assumptions about continuing with work. For example you should NOT suggest file changes or attempt to read any files.\nWhen asking the user what you should work on next, you can reference information in the summary which was just generated. However, you should NOT reference information outside of what's contained in the summary for this response. Keep this response CONCISE.</explicit_instructions>`,
        switchToActMode: (text?:string) => `[The user has switched to ACT MODE, so you may now proceed with the task.]` + text ? `\n\nThe user also provided the following message when switching to ACT MODE:\n<user_message>\n${text}\n</user_message>` : "",
        commandRunning: (output, full) => `Command is still running in the user's terminal.${(output.length > 0) ? `\nHere's the output so far:\n${output}` : ""}
                    ${(full) ? `\n\nYou will be updated on the terminal status and new output in the future.` : ""}`,
        feedback: (text?:string) => `<user_message>\n${text}\n</user_message>`,
        userFeedback: (output, feedbackText) => `${en.assistantMessage.commandRunning(output)}\n\nThe user provided the following feedback:\n<feedback>\n${feedbackText}\n</feedback>`,
        commandExecuted: (output) => `Command executed.${(output?.length > 0) ? `\nOutput:\n${output}` : ""}`,
        invalidMcpToolArgumentError: (serverName?: string, toolName?: string) => 
            en.cline.toolError(`Invalid JSON argument used with ${serverName} for ${toolName}. Please retry with a properly formatted JSON argument.`), 
        missingParamError:(toolName: string, paramName: string, relPath?: string) => `Cline tried to use ${toolName}${relPath ? ` for '${relPath.toPosix()}'` : ""} without value for required parameter '${paramName}'. Retrying...`,
        missingToolParameterError: (paramName: string) => en.cline.toolError(`Missing value for required parameter '${paramName}'. Please retry with complete response.\n\n${en.cline.toolUseInstructionsReminder}`),
        defaultError: (action:string, error:Error) => en.cline.toolError(`Error ${action}: ${JSON.stringify(serializeError(error))}`),
        defaultErrorFormatted: (action:string, error:Error) => `Error ${action}:\n${error.message ?? JSON.stringify(serializeError(error), null, 2)}`,
        invalidToolnameArgumentError: (tool_name?:string) => `Cline tried to use ${tool_name} with an invalid JSON argument. Retrying...`,
        toolDenied: `The user denied this operation.`,
        resultWithFeedback: (response) => `The user has provided feedback on the results. Consider their input to continue the task, and then attempt completion again.\n<feedback>\n${response}\n</feedback>`,
        reponseWithFeedback: (feedback?: string) =>
            `The user provided the following blocked by the:\n<feedback>\n${feedback}\n</feedback>`,
        browserClosed:`The browser has been closed. You may now proceed to using other tools.`,
        browserAction: (consoleLogs?:string) => `The browser action has been executed. The console logs and screenshot have been captured for your analysis.
            \n\nConsole logs:\n${consoleLogs ?? "(No new logs)"}\n\n
            (REMEMBER: if you need to proceed to using non-\`browser_action\` tools or launch a new browser, you MUST first close this browser. 
            For example, if after analyzing the logs and screenshot you need to edit a file, you must first close the browser before you can use the write_to_file tool.)`,
        formattedAnswer: (text) => `<answer>\n${text}\n</answer>`,
        clineIgnoreInstructions: (content: string) => `# .clineignore\n\n(The following is provided by a root-level .clineignore file where the user has specified ` +
             `files and directories that should not be accessed. When using list_files, you'll notice a ${LOCK_TEXT_SYMBOL} next to files that are blocked. ` + 
             `Attempting to access the file's contents e.g. through read_file will result in an error.)\n\n${content}\n.clineignore`,
        clineRulesGlobalDirectoryInstructions: (globalClineRulesFilePath: string, content: string) =>
            `# .clinerules/\n\nThe following is provided by a global .clinerules/ directory, located at ${globalClineRulesFilePath.toPosix()}, where the user has ` + 
            `specified instructions for all working directories:\n\n${content}`,

        clineRulesLocalDirectoryInstructions: (cwd: string, content: string) =>
            `# .clinerules/\n\nThe following is provided by a root-level .clinerules/ directory where the user has specified instructions for this working ` +
            `directory (${cwd.toPosix()})\n\n${content}`,

        clineRulesLocalFileInstructions: (cwd: string, content: string) =>
            `# .clinerules\n\nThe following is provided by a root-level .clinerules file where the user has specified instructions for this working ` +
            `directory (${cwd.toPosix()})\n\n${content}`,
        toolAlreadyUsed: (block:ToolUse) => `Tool [${block.name}] was not executed because a tool has already been used in this message.` + 
                `Only one tool may be used per message. You must assess the first tool's result before proceeding to use the next tool.`,
        toolRejected: (block:ToolUse) => `Skipping tool ${en.assistantMessage.toolDescription(block)} due to user rejecting a previous tool.`,
        partilToolRejected: (block:ToolUse) => `Tool ${en.assistantMessage.toolDescription(block)} was interrupted and not executed due to user rejecting a previous tool.`,
        toolDescription: (block:ToolUse) =>
        {
            switch (block.name)
            {
                case "execute_command":
                    return `[${block.name} for '${block.params.command}']`
                case "search_files":
                    return `[${block.name} for '${block.params.regex}'${(block.params.file_pattern) ? ` in '${block.params.file_pattern}'` : ""}]`
                case "list_files":
                case "list_code_definition_names":
                case "read_file":
                case "write_to_file":
                case "replace_in_file":
                    return `[${block.name} for '${block.params.path}']`
                case "browser_action":
                    return `[${block.name} for '${block.params.action}']`
                case "use_mcp_tool":
                case "access_mcp_resource":
                    return `[${block.name} for '${block.params.server_name}']`
                case "ask_followup_question":
                    return `[${block.name} for '${block.params.question}']`
                case "attempt_completion":
                case 'load_mcp_documentation':
                case 'condense':
                case 'plan_mode_respond':
                    return `[${block.name}]`
                case 'new_task':
                    return `[${block.name} for creating a new task]`
            }
        },
        messages:{
            search_files: (data:string[]) => `Cline wants to search files in ${path.basename(data[0])}/`,
            list_code_definition_names:(data:string[]) => `Cline wants to view source code definitions in ${path.basename(data[0])}/`,
            execute_command: (data:string[]) => '',
            read_file: (data:string[]) => `Cline wants to read ${path.basename(data[0])}`,
            write_to_file: (data:string[]) => '',
            replace_in_file: (data:string[]) => '',
            list_files: (data:string[]) => `Cline wants to view directory ${path.basename(data[0])}/`,
            browser_action: (data:string[]) => '',
            use_mcp_tool: (data:string[]) => `Cline wants to use ${data[0]} on ${data[1]}`,
            access_mcp_resource: (data:string[]) => '',
            ask_followup_question: (data:string[]) => '',
            attempt_completion: (data:string[]) => '',    
        },
        titles:{
            execute_command: "executing command",
            read_file: "reading file",
            write_to_file: "writing file",
            replace_in_file: "writing file",
            search_files: "searching files",
            list_files: "listing files",
            list_code_definition_names: "parsing source code definitions",
            browser_action: "executing browser action",
            use_mcp_tool: "executing MCP tool",
            access_mcp_resource: "accessing MCP resource",
            ask_followup_question: "asking question",
            attempt_completion: "attempting completion",
            load_mcp_documentation: "loading MCP documentation",
            new_task: "creating new task",
            plan_mode_respond: "responding to inquiry",
            condense: "condensing context window"
        }
    },
    system:
    {
        systemPrompt:'',
        BROWSER_ACTION: `\n
## browser_action
Description: Request to interact with a Puppeteer-controlled browser. Every action, except \`close\`, will be responded to with a screenshot of the browser's current state, along with any new console logs. You may only perform one browser action per message, and wait for the user's response including a screenshot and logs to determine the next action.
- The sequence of actions **must always start with** launching the browser at a URL, and **must always end with** closing the browser. If you need to visit a new URL that is not possible to navigate to from the current webpage, you must first close the browser, then launch again at the new URL.
- While the browser is active, only the \`browser_action\` tool can be used. No other tools should be called during this time. You may proceed to use other tools only after closing the browser. For example if you run into an error and need to fix a file, you must close the browser, then use other tools to make the necessary changes, then re-launch the browser to verify the result.
- The browser window has a resolution of **900x600** pixels. When performing any click actions, ensure the coordinates are within this resolution range.
- Before clicking on any elements such as icons, links, or buttons, you must consult the provided screenshot of the page to determine the coordinates of the element. The click should be targeted at the **center of the element**, not on its edges.
Parameters:
- action: (required) The action to perform. The available actions are:
    * launch: Launch a new Puppeteer-controlled browser instance at the specified URL. This **must always be the first action**.
        - Use with the \`url\` parameter to provide the URL.
        - Ensure the URL is valid and includes the appropriate protocol (e.g. http://localhost:3000/page, file:///path/to/file.html, etc.)
    * click: Click at a specific x,y coordinate.
        - Use with the \`coordinate\` parameter to specify the location.
        - Always click in the center of an element (icon, button, link, etc.) based on coordinates derived from a screenshot.
    * type: Type a string of text on the keyboard. You might use this after clicking on a text field to input text.
        - Use with the \`text\` parameter to provide the string to type.
    * scroll_down: Scroll down the page by one page height.
    * scroll_up: Scroll up the page by one page height.
    * close: Close the Puppeteer-controlled browser instance. This **must always be the final browser action**.
        - Example: \`<action>close</action>\`
- url: (optional) Use this for providing the URL for the \`launch\` action.
    * Example: <url>https://example.com</url>
- coordinate: (optional) The X and Y coordinates for the \`click\` action. Coordinates should be within the **900x600** resolution.
    * Example: <coordinate>450,300</coordinate>
- text: (optional) Use this for providing the text for the \`type\` action.
    * Example: <text>Hello, world!</text>
Usage:
<browser_action>
<action>Action to perform (e.g., launch, click, type, scroll_down, scroll_up, close)</action>
<url>URL to launch the browser at (optional)</url>
<coordinate>x,y coordinates (optional)</coordinate>
<text>Text to type (optional)</text>
</browser_action>`,
USE_THE_BROWSER: ", use the browser",
BROWSER_ACTION_TOOL: "\n- You can use the browser_action tool to interact with websites (including html files and locally running development servers) through a Puppeteer-controlled browser when you feel it is necessary in accomplishing the user's task. This tool is particularly useful for web development tasks as it allows you to launch a browser, navigate to pages, interact with elements through clicks and keyboard input, and capture the results through screenshots and console logs. This tool may be useful at key stages of web development tasks-such as after implementing new features, making substantial changes, when troubleshooting issues, or to verify the result of your work. You can analyze the provided screenshots to ensure correct rendering or identify errors, and review console logs for runtime issues.\n	- For example, if asked to add a component to a react website, you might create the necessary files, use execute_command to run the site locally, then use browser_action to launch the browser, navigate to the local server, and verify the component renders & functions correctly before closing the browser.",
USE_BOWSER: '\n- The user may ask generic non-development tasks, such as "what\'s the latest news" or "look up the weather in San Diego", in which case you might use the browser_action tool to complete the task if it makes sense to do so, rather than trying to create a website or using curl to answer the question. However, if an available MCP server tool or resource can be used instead, you should prefer to use it over browser_action.',
HOW_USE_BROWSER:" Then if you want to test your work, you might use browser_action to launch the site, wait for the user's response confirming the site was launched along with a screenshot, then perhaps e.g., click a button to test functionality if needed, wait for the user's response confirming the button was clicked along with a screenshot of the new state, before finally closing the browser.",
CUSTOM_INSTRUCTIONS: (customInstructions:string) => `
====

USER'S CUSTOM INSTRUCTIONS

The following additional instructions are provided by the user, and should be followed to the best of your ability without interfering with the TOOL USE guidelines.

${customInstructions.trim()}`,
    }
}
