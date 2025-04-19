import path from "path";
import { Labels, toolExemple1, toolExemple2, toolExemple3, toolExemple4, toolExemple5, toolUseInstructionsReminder } from "./locale";
import { serializeError } from "serialize-error";
import { ToolUse } from "../core/assistant-message";

export const ptBr:Labels = {
    date:{
        day: 'dia',
        days: 'dias',
        hour: 'hora',
        hours: 'horas',
        minute: 'minuto',
        minutes: 'minutos',
        justNow: 'agora mesmo',
        ago: 'atrás'
    },
    cline:{
        toolUseInstructionsReminder: "# Reminder: Instructions for Tool Use\n" + 
            "Tool uses are formatted using XML-style tags. " + 
            "The tool name is enclosed in opening and closing tags, and each parameter is similarly enclosed within its own set of tags. " + 
            "Here's the structure:\n\n" +
                "<tool_name>\n" +
                    "<parameter1_name>value1</parameter1_name>\n" +
                    "<parameter2_name>value2</parameter2_name>\n" +
                    "...\n" +
                "</tool_name>\n\n" +
            "For example:\n\n" +
            "<attempt_completion>\n" +
                "<result> I have completed the task... </result>\n" +
            "</attempt_completion>\n\n" +
            "Always adhere to this format for all tool uses to ensure proper parsing and execution.",
        shellIntegrationWarning: "Aviso de integração do shell.",
        userFeedbackTitle: "Feedback do Usuário",
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
        tooManyMistakes: (feedback?: string) =>
            `You seem to be having trouble proceeding. The user has provided the following feedback to help guide you:\n<feedback>\n${feedback}\n</feedback>`,
        noToolsUsed: () => "[ERROR] You did not use a tool in your previous response! Please retry with a tool use.\n\n" +
            ptBr.cline.toolUseInstructionsReminder +
            "\n\n# Next Steps\n\n" +
            "If you have completed the user's task, use the attempt_completion tool. \n" +
            "If you require additional information from the user, use the ask_followup_question tool. \n" +
            "Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. \n" +
            "(This is an automated message, so do not respond to it conversationally.)",
        interruptTask: "Task was interrupted before this tool call could be completed.",
        "wasRecent": "\n\nIMPORTANTE: Se o último uso de ferramenta foi um replace_in_file ou write_to_file que foi interrompido, o arquivo foi revertido para " + 
            "seu estado original antes da edição interrompida, e você NÃO precisa reler o arquivo, pois já possui seu conteúdo atualizado.",
        "taskResumption": (time: string, cwd: string, wasRecent: boolean, text?:string) => "[TAREFA RETOMADA] Esta tarefa foi interrompida " + time + ". Ela pode ou não estar " +
            "concluída, então por favor, reavalie o contexto da tarefa. Esteja ciente de que o estado do projeto pode ter mudado desde então. O diretório " +
            "de trabalho atual agora é '" + cwd + "'. Se a tarefa não foi concluída, tente novamente o último passo antes da interrupção e prossiga com a " +
            "conclusão da tarefa.\n\nNota: Se você tentou anteriormente usar uma ferramenta e o usuário não forneceu um resultado, você deve assumir que " +
            "o uso da ferramenta não foi bem-sucedido e avaliar se deve tentar novamente. Se a última ferramenta foi uma browser_action, o navegador foi fechado " +
            "e você deve iniciar um novo navegador, se necessário. " 
            + (wasRecent) ? ptBr.cline.wasRecent : ""
            + (text) ? `\n\nNovas instruções para continuar a tarefa:\n<user_message>\n${text}\n</user_message>` : '',
    },
    assistantMessage:
    {
        commandRunning: (output) => `O comando ainda está em execução no terminal do usuário.${output ? `\nAqui está a saída até agora:\n${output}` : ""}`,
        userFeedback: (output, feedbackText) => `${ptBr.assistantMessage.commandRunning(output)}\n\nO usuário forneceu o seguinte feedback:\n<feedback>\n${feedbackText}\n</feedback>`,
        commandExecuted: (output) =>  `Comando executado.${output ? `\nSaída:\n${output}` : ""}`,
        invalidMcpToolArgumentError: (serverName: string, toolName: string) => 
            ptBr.cline.toolError(`Invalid JSON argument used with ${serverName} for ${toolName}. Please retry with a properly formatted JSON argument.`), 
        missingParamError:(toolName: string, paramName: string, relPath?: string) => `Cline tried to use ${toolName}${relPath ? ` for '${relPath.toPosix()}'` : ""} 
            without value for required parameter '${paramName}'. Retrying...`,
        missingToolParameterError: (paramName: string) => ptBr.cline.toolError(`Missing value for required parameter '${paramName}'. Please retry with complete response.\n\n${toolUseInstructionsReminder}`),
        defaultError: (action:string, error:Error) => ptBr.cline.toolError(`Error ${action}: ${JSON.stringify(serializeError(error))}`),
        defaultErrorFormatted: (action:string, error:Error) => `Error ${action}:\n${error.message ?? JSON.stringify(serializeError(error), null, 2)}`,
        invalidToolnameArgumentError: (tool_name?:string) => `Cline tried to use ${tool_name} with an invalid JSON argument. Retrying...`,
        resultWithFeedback: (response) => `The user has provided feedback on the results. Consider their input to continue the task, and then attempt completion again.\n<feedback>\n${response}\n</feedback>`,
        toolDenied: `The user denied this operation.`,
        toolDeniedWithFeedback: (feedback?: string) =>
            `The user denied this operation and provided the following feedback:\n<feedback>\n${feedback}\n</feedback>`,
        browserClosed:`The browser has been closed. You may now proceed to using other tools.`,
        browserAction: (consoleLogs?:string) => `The browser action has been executed. The console logs and screenshot have been captured for your analysis.
            \n\nConsole logs:\n${consoleLogs ?? "(No new logs)"}\n\n
            (REMEMBER: if you need to proceed to using non-\`browser_action\` tools or launch a new browser, you MUST first close this browser. 
            For example, if after analyzing the logs and screenshot you need to edit a file, you must first close the browser before you can use the write_to_file tool.)`,
        formattedAnswer: (text) => `<answer>\n${text}\n</answer>`,
        toolAlreadyUsed: (block:ToolUse) => `Tool [${block.name}] was not executed because a tool has already been used in this message.` + 
                `Only one tool may be used per message. You must assess the first tool's result before proceeding to use the next tool.`,
        toolRejected: (block:ToolUse) => `Skipping tool ${ptBr.assistantMessage.toolDescription(block)} due to user rejecting a previous tool.`,
        partilToolRejected: (block:ToolUse) => `Tool ${ptBr.assistantMessage.toolDescription(block)} was interrupted and not executed due to user rejecting a previous tool.`,
        toolDescription: (block:ToolUse) =>
        {
            switch (block.name)
            {
                case "execute_command":
                    return `[${block.name} for '${block.params.command}']`
                case "search_files":
                    return `[${block.name} for '${block.params.regex}'${block.params.file_pattern ? ` in '${block.params.file_pattern}'` : ""}]`
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
                    return `[${block.name}]`
                case 'load_mcp_documentation':
                case 'new_task':
                case 'plan_mode_respond':
                    throw new Error('Not implemented')                   
            }
        },
        messages:{
            search_files: (data:string[]) => `Cline wants to search files in ${path.basename(data[0])}/`,
            list_code_definition_names:(data:string[]) => `Cline wants to view source code definitions in ${path.basename(data[0])}/`,
            execute_command: (data:string[]) => '',
            read_file: (data:string[]) => `Cline wants to read ${path.basename(data[0])}`,
            write_to_file: (data:string[]) => `Cline wants to "edit" ${path.basename(data[0])}`,
            replace_in_file: (data:string[]) => `Cline wants to "create" ${path.basename(data[0])}`,
            list_files: (data:string[]) => `Cline wants to view directory ${path.basename(data[0])}/`,
            browser_action: (data:string[]) => `Cline wants to use a browser and launch ${data[0]}`,
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
BROWSER_ACTION_TOOL:"\n- You can use the browser_action tool to interact with websites (including html files and locally running development servers) through a Puppeteer-controlled browser when you feel it is necessary in accomplishing the user's task. This tool is particularly useful for web development tasks as it allows you to launch a browser, navigate to pages, interact with elements through clicks and keyboard input, and capture the results through screenshots and console logs. This tool may be useful at key stages of web development tasks-such as after implementing new features, making substantial changes, when troubleshooting issues, or to verify the result of your work. You can analyze the provided screenshots to ensure correct rendering or identify errors, and review console logs for runtime issues.\n	- For example, if asked to add a component to a react website, you might create the necessary files, use execute_command to run the site locally, then use browser_action to launch the browser, navigate to the local server, and verify the component renders & functions correctly before closing the browser.",
USE_BOWSER: '\n- The user may ask generic non-development tasks, such as "what\'s the latest news" or "look up the weather in San Diego", in which case you might use the browser_action tool to complete the task if it makes sense to do so, rather than trying to create a website or using curl to answer the question. However, if an available MCP server tool or resource can be used instead, you should prefer to use it over browser_action.',
HOW_USE_BROWSER:" Then if you want to test your work, you might use browser_action to launch the site, wait for the user's response confirming the site was launched along with a screenshot, then perhaps e.g., click a button to test functionality if needed, wait for the user's response confirming the button was clicked along with a screenshot of the new state, before finally closing the browser.",
CUSTOM_INSTRUCTIONS: (customInstructions:string) => `
====

USER'S CUSTOM INSTRUCTIONS

The following additional instructions are provided by the user, and should be followed to the best of your ability without interfering with the TOOL USE guidelines.

${customInstructions.trim()}`,

    }

};