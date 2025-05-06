import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import { createDirectoriesForFile } from "@utils/fs"
import { arePathsEqual } from "@utils/path"
import { formatResponse } from "@core/prompts/responses"
import { DecorationController } from "./DecorationController"
import * as diff from "diff"
import { diagnosticsToProblemsString, getNewDiagnostics } from "../diagnostics"
import * as iconv from "iconv-lite"
import { cwd } from "@/core/task"
import { normalizeEOL } from "@/utils/string"
import { findInputDiffTabs, getInputDiffTabs, listenEvent } from "@/utils/vsCodeUtils"
import { detectEncoding } from "../misc/vs-Integration"

export const DIFF_VIEW_URI_SCHEME = "cline-diff"

export class DiffViewProvider 
{
	editType?: "create" | "modify"
	isEditing = false
	originalContent: string | undefined
	private createdDirs: string[] = []
	private documentWasOpen = false
	private relPath?: string
	private newContent?: string
	private diffEditor?: vscode.TextEditor
	private fadedOverlayController?: DecorationController
	private activeLineController?: DecorationController
	private streamedLines: string[] = []
	private preDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = []
	private fileEncoding: string = "utf8"

	constructor() {}

	async open(relPath:string): Promise<void> 
	{
		this.relPath = relPath
		const fileExists = (this.editType === "modify")
		const absolutePath = path.resolve(cwd, relPath)
		this.isEditing = true
		this.originalContent = ""
		this.fileEncoding = "utf8"
		if (fileExists) // if the file is already open, ensure it's not dirty before getting its contents
		{
			await vscode.workspace.textDocuments.some(async (doc) => arePathsEqual(doc.uri.fsPath, absolutePath) && doc.isDirty && (await doc.save(), true))
			const fileBuffer = await fs.readFile(absolutePath)
			this.fileEncoding = await detectEncoding(fileBuffer)
			this.originalContent = iconv.decode(fileBuffer, this.fileEncoding)
		}
		else
		{
			this.createdDirs = await createDirectoriesForFile(absolutePath) // for new files, create directories and keep track to delete if need roolback
			await fs.writeFile(absolutePath, "")
		}

		this.preDiagnostics = vscode.languages.getDiagnostics() // get diagnostics, to compare after editing to see needs to fix anything
		this.documentWasOpen = false // if file was already open, close it (must happen after showing the diff view, it's the only tab the column will close)
		
		vscode.window.tabGroups.all // close the tab if it's open (it's already saved above)
			.flatMap((tg) => tg.tabs)
			.filter( (tab) => tab.input instanceof vscode.TabInputText && arePathsEqual(tab.input.uri.fsPath, absolutePath))
			.forEach(async (tab) => (this.documentWasOpen = true) && await vscode.window.tabGroups.close(tab))

		this.diffEditor = await this.openDiffEditor(relPath)
		if (this.diffEditor)
		{
			this.fadedOverlayController = new DecorationController("fadedOverlay", this.diffEditor)
			this.activeLineController = new DecorationController("activeLine", this.diffEditor)
			// Apply faded overlay to all lines initially
			this.fadedOverlayController.addLines(0, this.diffEditor.document.lineCount)
			this.scrollEditorToLine(0) // will this crash for new files?
			this.streamedLines = []
		}
	}

	async update(accumulatedContent:string, isFinal:boolean, relPath?:string)
	{
		if (relPath && !this.isEditing)  // update editor
			await this.open(relPath!) // open the editor and prepare to stream content in

		// Fix: prevent duplicate BOM -> Strip potential BOM from incoming content. VS Code's `applyEdit` might implicitly handle the BOM
		// when replacing from the start (0,0), and we want to avoid duplication. Final BOM is handled in `saveChanges`.
		if (accumulatedContent.startsWith("\ufeff")) 
			accumulatedContent = accumulatedContent.slice(1) // Remove the BOM character		

		this.newContent = accumulatedContent
		const accumulatedLines = accumulatedContent.split("\n")

		if (!isFinal)
			accumulatedLines.pop() // remove the last partial line only if it's not the final update

		const diffLines = accumulatedLines.slice(this.streamedLines.length)

		const diffEditor = this.diffEditor
		const document = diffEditor?.document
		if (!diffEditor || !document) 
			throw new Error("User closed text editor, unable to edit file...")

		const beginningOfDocument = new vscode.Position(0, 0) // Place cursor at the beginning for stream animation
		diffEditor.selection = new vscode.Selection(beginningOfDocument, beginningOfDocument)

		// Instead of animating each line, we'll update in larger chunks
		const currentLine = this.streamedLines.length + diffLines.length - 1
		if (currentLine >= 0)  // Only proceed if we have new lines
		{			
			// Replace all content up to the current line with accumulated lines
			// This is necessary (as compared to inserting one line at a time) to handle cases where html tags on previous lines are auto closed for example
			const edit = new vscode.WorkspaceEdit()
			const rangeToReplace = new vscode.Range(0, 0, currentLine + 1, 0)
			const contentToReplace = accumulatedLines.slice(0, currentLine + 1).join("\n") + "\n"
			edit.replace(document.uri, rangeToReplace, contentToReplace)
			await vscode.workspace.applyEdit(edit)

			this.activeLineController!.setActiveLine(currentLine) // Update decorations
			this.fadedOverlayController!.updateOverlayAfterLine(currentLine, document.lineCount)

			if (diffLines.length > 5)  // For larger changes, create a quick scrolling animation
			{
				const startLine = this.streamedLines.length
				const endLine = currentLine
				const totalLines = endLine - startLine
				const numSteps = 10 // Adjust this number to control animation speed
				const stepSize = Math.max(1, Math.floor(totalLines / numSteps))

				for (let line = startLine; line <= endLine; line += stepSize) // Create and await the smooth scrolling animation
				{
					this.diffEditor?.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.InCenter)
					await new Promise((resolve) => setTimeout(resolve, 16)) // ~60fps
				}				
			}

			this.scrollEditorToLine(currentLine) // Ensure we end at the final line
		}

		this.streamedLines = accumulatedLines // Update the streamedLines with the new accumulated content
		if (isFinal) 
		{
			// Handle any remaining lines if the new content is shorter than the original
			if (this.streamedLines.length < document.lineCount)
			{
				const edit = new vscode.WorkspaceEdit()
				edit.delete(document.uri, new vscode.Range(this.streamedLines.length, 0, document.lineCount, 0))
				await vscode.workspace.applyEdit(edit)
			}
			
			if (this.originalContent?.endsWith("\n") && !accumulatedContent.endsWith("\n"))  // Add empty last line if original content had one
					accumulatedContent += "\n"
			
			this.fadedOverlayController!.clear() // Clear decorations before applying final edit
			this.activeLineController!.clear()
		}
	}

	async saveChanges(): Promise<{newProblems?: string, userEdits?: string, autoFormatted?: string, finalContent?: string}> 
	{
		if (this.relPath && this.newContent && this.diffEditor) 
		{
			const absolutePath = path.resolve(cwd, this.relPath)
			const updatedDocument = this.diffEditor.document
	
			// If the edited content has different EOL characters, we don't want to show a diff with all the EOL differences.
			const eol = this.newContent.includes("\r\n") ? "\r\n" : "\n" //get the document's eol
			
			const preSaveContent = normalizeEOL(updatedDocument.getText(), eol) // contents before save, to avoid auto-formatting changes

			if (updatedDocument.isDirty)
				await updatedDocument.save()
		
			const finalContent = normalizeEOL(updatedDocument.getText(), eol) // get after save in case there is any auto-formatting 

			await vscode.window.showTextDocument(vscode.Uri.file(absolutePath), { preview: false })
			await this.closeAllDiffViews()

			const postDiagnostics = vscode.languages.getDiagnostics() // Only report new issues caused by AI changes. delayed linter won't trigger notifications ok	

			const newProblems = diagnosticsToProblemsString( getNewDiagnostics(this.preDiagnostics, postDiagnostics), [ 0 /*Error Only*/ ], cwd) 

			const normalizedNewContent = normalizeEOL(this.newContent, eol)

			let userEdits: string | undefined
			if (preSaveContent !== normalizedNewContent)  // user made changes before approving edit.notify model
				userEdits = this.createPrettyPatch(this.relPath, normalizedNewContent,	preSaveContent)

			// auto-formatting was done by the editor
			const autoFormatted = (preSaveContent !== finalContent) ? this.createPrettyPatch(this.relPath, preSaveContent, finalContent) : ''

			return { newProblems, userEdits, autoFormatted, finalContent}
		}
		return {}
	}

	async revertChanges(): Promise<void> 
	{
		if (this.relPath && this.diffEditor) 
		{
			const document = this.diffEditor.document
			const absolutePath = path.resolve(cwd, this.relPath)
			if (this.editType === "modify")  // revert document
			{
				const edit = new vscode.WorkspaceEdit()
				const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))
				
				edit.replace(document.uri, fullRange, this.originalContent ?? "")
				
				await vscode.workspace.applyEdit(edit)// Apply the edit and save, this wont show in local history (unless the user made changes and saved)
				await document.save()

				if (this.documentWasOpen) 
					await vscode.window.showTextDocument(vscode.Uri.file(absolutePath), {preview: false})

				await this.closeAllDiffViews()
			}
			else
			{
				if (document.isDirty)
					await document.save()

				await this.closeAllDiffViews()
				await fs.unlink(absolutePath)

				for (const dir of this.createdDirs.reverse()) // Remove only the directories we created, in reverse order
				{
					await fs.rmdir(dir);
				}
			}
			await this.reset() // edit is done
		}
	}

	private async closeAllDiffViews() 
	{
		const tabsToClose = getInputDiffTabs(DIFF_VIEW_URI_SCHEME)
			.filter(t => !t.isDirty)
			.map(t => vscode.window.tabGroups.close(t))
		
		await Promise.all(tabsToClose)
	}

	private async openDiffEditor(relPath:string): Promise<vscode.TextEditor | undefined> 
	{
		const uri = vscode.Uri.file(path.resolve(cwd, relPath))

		const diffTab = findInputDiffTabs(uri.fsPath, DIFF_VIEW_URI_SCHEME) // If is already open then we should activate that instead of opening a new diff

		if (diffTab && diffTab.input instanceof vscode.TabInputTextDiff) 
			return await vscode.window.showTextDocument(diffTab.input.modified)

		const editor = listenEvent(vscode.window.onDidChangeActiveTextEditor, (editor) => arePathsEqual(editor?.document.uri.fsPath, uri.fsPath), 10_000)

			const fileName = path.basename(uri.fsPath)

			vscode.commands.executeCommand(
				"vscode.diff",
				vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${fileName}`).with({
					query: Buffer.from(this.originalContent ?? "").toString("base64")
				}),
				uri,
				`${fileName}: ${(this.editType === "modify") ? "Original ↔ Cline's Changes" : "New File"} (Editable)`,
			)

		return await editor
	}

	private scrollEditorToLine(line: number)
	{
		line = line + 4
		this.diffEditor?.revealRange(new vscode.Range(line, 0, line, 0),	vscode.TextEditorRevealType.InCenter)
	}

	scrollToFirstDiff() 
	{
		const currentContent = this.diffEditor?.document.getText()
		if (currentContent) 
		{
		const diffs = diff.diffLines(this.originalContent || "", currentContent)
			let count = 0
			for (const part of diffs) 
			{
				if (part.added || part.removed)  // Found the first diff, scroll to it
					return this.diffEditor?.revealRange(new vscode.Range(count, 0, count, 0), vscode.TextEditorRevealType.InCenter)
				if (!part.removed) 
					count += part.count || 0
			}
		}
	}

	async reset()  // close editor if open?
	{
		this.editType = undefined
		this.isEditing = false
		this.originalContent = undefined
		this.createdDirs = []
		this.documentWasOpen = false
		this.diffEditor = undefined
		this.fadedOverlayController = undefined
		this.activeLineController = undefined
		this.streamedLines = []
		this.preDiagnostics = []
	}

	async revertAndReset()
	{
		await this.revertChanges()
		await this.reset()
	}

	private createPrettyPatch(filename="file", old?:string, updated?:string)
	{
		const patch = diff.createPatch(filename.toPosix(), old || "", updated || "")
		return patch.split("\n").slice(4).join("\n") //slice 4 to remove header
	}
}
