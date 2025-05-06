import { Anthropic } from "@anthropic-ai/sdk"
import os from "os"
import * as path from "path"
import * as vscode from "vscode"
import { capitalizeFirstLetter } from "../../utils/string"
import { ImageBlockParam, TextBlockParam, ToolResultBlockParam, ToolUseBlockParam } from "@anthropic-ai/sdk/resources/messages.mjs"

export async function downloadTask(dateTs: number, conversationHistory: Anthropic.MessageParam[]) 
{
	const options = {
		filters: { Markdown: ["md"] },
		defaultUri: vscode.Uri.file(path.join(os.homedir(), "Downloads", createDateBasedFilename("cline_task_", "md", dateTs))),
	}	
	// Generate markdown
	const markdownContent = conversationHistory
		.map((message) => `**${ (message.role === "user") ? "User" : "Assistant" }:**\n\n${formatBlockToMarkdown(message.content)}\n\n`)
		.join("---\n\n")
	const saveUri = await vscode.window.showSaveDialog(options) // Prompt user for save location

	if (saveUri) 
	{
		try 
		{			
			await vscode.workspace.fs.writeFile(saveUri, new TextEncoder().encode(markdownContent)) // Write content to the selected location
			vscode.window.showTextDocument(saveUri, { preview: true })
		}
		catch (error) 
		{
			vscode.window.showErrorMessage(`Failed to save markdown file: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}

export function formatToMarkdown(content:any[], extra?:string)
{
	let request = formatBlockToMarkdown(content, "\n\n")
	if (extra)
		request += extra 
	return  {request}
}

export function findToolName(toolCallId:string, messages:Anthropic.MessageParam[]): string 
{
	for (const message of messages) 
	{
		if (Array.isArray(message.content)) 
		{
			for (const block of message.content) 
			{
				if (block.type === "tool_use" && block.id === toolCallId) 
					return block.name
			}
		}
	}
	return "Unknown Tool"
}

function createDateBasedFilename(prefix:string, extension:string, dateTs:number = Date.now()):string 
{
    const date = new Date(dateTs)
    const month = date.toLocaleString("en-US", { month: "short" }).toLowerCase()
    const day = date.getDate()
    const year = date.getFullYear()
    let hours = date.getHours()
    const minutes = date.getMinutes().toString().padStart(2, "0")
    const seconds = date.getSeconds().toString().padStart(2, "0")
    const ampm = hours >= 12 ? "pm" : "am"
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    
    return `${prefix}${month}-${day}-${year}_${hours}-${minutes}-${seconds}-${ampm}.${extension}`;
}

function formatBlockToMarkdown(block:string | Array<any> | ImageBlockParam | TextBlockParam | ToolResultBlockParam | ToolUseBlockParam , separator:string="\n"): string 
{
	if (Array.isArray(block)) 
		return block.map(b => formatBlockToMarkdown(b)).join(separator);
	
	if (typeof block === "string") 
		return block;

	switch (block.type) 
	{
		case "text":
			return block.text
		case "image":
			return `[Image]`
		case "tool_use":
			let input = (typeof block.input === "object")
				? Object.entries(block.input ?? {})
					.map(([key, value]) => `${capitalizeFirstLetter(key)}: ${value}`)
					.join("\n")
				: String(block.input)
			return `[Tool Use: ${block.name}]\n${input}`
		case "tool_result":
			let result = `[${"Tool"}${block.is_error ? " (Error)" : ""}]`
			if (block.content) 
                result += `\n${formatBlockToMarkdown(block.content)}`
			return result
	}
}