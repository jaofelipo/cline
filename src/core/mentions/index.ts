import * as vscode from "vscode"
import * as path from "path"
import { UrlContentFetcher } from "@services/browser/UrlContentFetcher"
import { mentionRegexGlobal } from "@shared/context-mentions"
import fs from "fs/promises"
import { diagnosticsToProblemsString } from "@integrations/diagnostics"
import { getCommitInfo } from "@utils/git"
import { getWorkingState } from "@utils/git"
import { FileContextTracker } from "../context/context-tracking/FileContextTracker"
import { toXMLString } from "@/utils/string"
import { extractTextFromFile, vsOpenFile } from "@/integrations/misc/vs-Integration"
import Anthropic from "@anthropic-ai/sdk"
import { parseSlashCommands } from "../slash-commands"

export function openMention(mention?: string): void 
{
	if (mention?.startsWith("/")) 
	{
		const relPath = mention.slice(1)
		const cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0)
		if (cwd)
		{
			const absPath = path.resolve(cwd, relPath)
			if (mention.endsWith("/")) 
				vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(absPath))
			else
				vsOpenFile(absPath)
		}
	} 
	else if (mention === "problems") 
	{
		vscode.commands.executeCommand("workbench.actions.view.problems")
	}
	else if (mention === "terminal") 
	{
		vscode.commands.executeCommand("workbench.action.terminal.focus")
	} 
	else if (mention?.startsWith("http")) 
	{
		vscode.env.openExternal(vscode.Uri.parse(mention))
	}
}

export async function parseContent(block:Anthropic.Messages.ContentBlockParam, cwd:string, urlFetcher:UrlContentFetcher, fileTracker:FileContextTracker)
{
	if (block.type === 'text')
	{
		if (block.text.includes("<feedback>") || block.text.includes("<answer>") || block.text.includes("<task>") || block.text.includes("<user_message>")) 
		{
			let parsedText = await parseMentions(block.text, cwd, urlFetcher, fileTracker)
			block.text = parseSlashCommands(parsedText) // when parsing slash commands, we still want to allow the user to provide their desired context
			return block
		}
	}
	return block
}

export async function parseMentions(text: string, cwd: string, urlFetcher: UrlContentFetcher, fileTracker?: FileContextTracker): Promise<string> 
{
	const mentions: Set<string> = new Set()

	const mentionMap: Record<string, (mention: string) => string> = {
		"http": 		(mention) => `'${mention}' (see below for site content)`,
		"/": 			(mention) => `'${mention.slice(1)}' (see below for ${mention.slice(1).endsWith("/") ? 'folder content' : 'file content'})`,
		"problems": 	(mention) => `Workspace Problems (see below for diagnostics)` ,
		"terminal": 	(mention) => `Terminal Output (see below for output)`, 
		"git-changes": 	(mention) => `Working directory changes (see below for details)`, 
		"git-commit": 	(mention) => `Git commit '${mention}' (see below for commit info)`, 
	}
	
	let parsedText = text.replace(mentionRegexGlobal, (match, mention) => {
		mentions.add(mention)
		let prefix = ["http", "/", "problems", 'terminal', 'git-changes'].find(key => mention.startsWith(key) || mention === key)
		if (!prefix && /^[a-f0-9]{7,40}$/.test(mention))
			prefix = "git-commit"
		return prefix ? mentionMap[prefix](mention) : match
	})

	for (const mention of mentions) 
	{
		if (mention.startsWith("http")) 
		{
			parsedText += "\n\n" + toXMLString('url_content', await urlFetcher.urlToMarkdown(mention), { url: mention })
		}
		else if (mention.startsWith("/")) 
		{
			const mentionPath = mention.slice(1)
			const isFile = mention.endsWith("/") === false
			parsedText += "\n\n" + toXMLString( isFile ? "file_content" : "folder_content", await getContent(mentionPath, cwd), { path: mentionPath })

			if (isFile && fileTracker)  // Track that this file was mentioned and its content was included
				await fileTracker.trackFile(mentionPath, "file_mentioned")
		} 
		else if (mention === "problems") 
		{
			parsedText += "\n\n" + toXMLString('workspace_diagnostics', getWorkspaceProblems(cwd))
		}
		else if (mention === "terminal") 
		{
			parsedText += "\n\n" + toXMLString('terminal_output', getLatestTerminalOutput())
		} 
		else if (mention === "git-changes") 
		{
			parsedText += "\n\n" + toXMLString('git_working_state', await getWorkingState(cwd))			
		} 
		else if (/^[a-f0-9]{7,40}$/.test(mention))
		{
			parsedText += "\n\n" + toXMLString('git_commit', await getCommitInfo(mention, cwd), { hash: mention })
		}
	}
	await urlFetcher.closeBrowser()

	return parsedText
}

async function getContent(mentionPath: string, cwd: string): Promise<string> 
{
	const absPath = path.resolve(cwd, mentionPath)
	try 
	{
		const stats = await fs.stat(absPath)
		if (stats.isFile()) 
		{
			return await extractTextFromFile(absPath).catch((error) => "(Binary file, unable to display content)") ?? ''
		}
		else if (stats.isDirectory())
		{
			const entries = await fs.readdir(absPath, { withFileTypes: true })
			let content = ""
			const fileContentPromises: Promise<string | undefined>[] = []
			for (const entry of entries) 
				{
					content += `├── ${entry.name}${entry.isDirectory() ? "/" : ""}\n`
					if (entry.isFile()) 
						fileContentPromises.push(filePromise(mentionPath, entry.name, absPath))
				}
				if (content.length > 0) 
					content = content.replace(/├──([^├]*)$/, '└──$1')

				const fileContents = (await Promise.all(fileContentPromises)).filter(content => content)
			return `${content}\n${fileContents.join("\n\n")}`
		}
		return `Error fetching content: (Failed to read contents of ${mentionPath})`		
	} 
	catch (error) 
	{
		return `Error fetching content: Failed to access path "${mentionPath}": ${error.message}`
	}
}

async function filePromise(mentionPath: string, entryName: string, absPath: string): Promise<string | undefined> 
{
	const filePath = path.join(mentionPath, entryName)
	const content = await extractTextFromFile( path.resolve(absPath, entryName)).catch(error => undefined)
	return content ? toXMLString('file_content', content, {path:filePath.toPosix()}) : undefined
}

function getWorkspaceProblems(cwd: string): string 
{
	try 
	{	
		const result = diagnosticsToProblemsString(vscode.languages.getDiagnostics(), [vscode.DiagnosticSeverity.Error, vscode.DiagnosticSeverity.Warning], cwd)
		return result || "No errors or warnings detected."
	} 
	catch (error) 
	{
		return `Error fetching diagnostics: ${error.message}`
	}
}

/**
 * Gets the contents of the active terminal
 * @returns The terminal contents as a string
 */
export async function getLatestTerminalOutput(): Promise<string> 
{
	const originalClipboard = await vscode.env.clipboard.readText() // Store original clipboard content to restore later

	try 
	{
		await vscode.commands.executeCommand("workbench.action.terminal.selectAll")// Select terminal content
		await vscode.commands.executeCommand("workbench.action.terminal.copySelection")// Copy selection to clipboard
		await vscode.commands.executeCommand("workbench.action.terminal.clearSelection")// Clear the selection
		let terminalContents = (await vscode.env.clipboard.readText()).trim()// Get terminal contents from clipboard

		if (terminalContents !== originalClipboard)  // Check if there's actually a terminal open
		{
			const lines = terminalContents.split("\n") // Clean up command separation
			const lastLine = lines.pop()?.trim()
			if (lastLine) 
			{
				for (var i = lines.length - 1; i >= 0; i--) 
				{
					if (lines[i].trim().startsWith(lastLine)) 
						break 
				}
				terminalContents = lines.slice(Math.max(i, 0)).join("\n")
			}
	
			return terminalContents
		}
		return ""
	} 
	catch (error)
	{
		return `Error fetching terminal output: ${error.message}`
	}
	finally 
	{
		await vscode.env.clipboard.writeText(originalClipboard) // Restore original clipboard content
	}
}