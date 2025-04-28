import { cwd } from "@/core/task";
import { ToolParamName, ToolUse } from "../core/assistant-message";
import { ClineAskUseMcpServer, ClineSayTool } from "../shared/ExtensionMessage";
import { getReadablePath, isLocatedInWorkspace } from "./path";


export function toJSON({name, params, partial}:ToolUse, content?:string, overrideTool?:any):string
{
	switch(name)
	{
		case "search_files":
			return JSON.stringify({
				tool: "searchFiles",
				path: getReadablePath(cwd || '', StringUtils.removeTag("path", params.path, partial)),
				regex: StringUtils.removeTag("regex", params.regex, partial),
				filePattern: StringUtils.removeTag("file_pattern", params.file_pattern, partial),
				content: content ?? '',
				operationIsLocatedInWorkspace: isLocatedInWorkspace(params.path),
			} satisfies ClineSayTool)
		case "use_mcp_tool":
			return JSON.stringify({
				type: "use_mcp_tool",
				serverName: (content === undefined) ? StringUtils.removeTag("server_name", params.server_name) : params.server_name ?? "",
				toolName: (content === undefined) ? StringUtils.removeTag("tool_name", params.tool_name) : params.tool_name,
				arguments: (content === undefined) ? StringUtils.removeTag("arguments", params.arguments) : params.arguments
			} satisfies ClineAskUseMcpServer)
		case "list_code_definition_names"://list_code_definition_names
			return toolToJSON('listCodeDefinitionNames', content ?? '', cwd, params.path, partial)
		case 'list_files':
			return toolToJSON((params.recursive === "true") ? "listFilesRecursive" : "listFilesTopLevel", content ?? '', cwd, params.path, partial)
		case 'read_file':
			return toolToJSON('readFile', content ?? '', cwd, params.path, partial)
		case 'write_to_file':
		case 'replace_in_file':
			return toolToJSON(overrideTool, content, cwd, params.path, partial)
		case 'access_mcp_resource':
			return JSON.stringify({
				type:"access_mcp_resource",
				serverName: StringUtils.removeTag("server_name", params.server_name, partial),
				uri: StringUtils.removeTag("uri", params.uri, partial)
			} satisfies ClineAskUseMcpServer);
		case 'ask_followup_question':
			return StringUtils.removeTag("question", params.question)
		case 'execute_command':
			return StringUtils.removeTag("command", params.command)
	}
	return ''
}


function toolToJSON(tool: "editedExistingFile" | "newFileCreated" | "readFile"  | "listFilesRecursive" | "listFilesTopLevel" | 'listCodeDefinitionNames', 
		content?: string, cwd?: string, path?: string, partial: boolean = false): string {
	return JSON.stringify({
		tool,
		path: getReadablePath(cwd || '', StringUtils.removeTag("path", path, partial)),
		content,
		operationIsLocatedInWorkspace: isLocatedInWorkspace(path)
	} satisfies ClineSayTool)
}

export function parseJSON(text?:string)
{
	if (!text)
		return {}
	try { 
		return JSON.parse(text)
	} catch { 
		return undefined
	}
}
