import * as path from "path"
import * as vscode from "vscode"
import { getTaskMetadata, saveTaskMetadata } from "@core/storage/disk"
import type { FileMetadataEntry } from "./ContextTrackerTypes"

// This class is responsible for tracking file operations that may result in stale context.
// If a user modifies a file outside of Cline, the context may become stale and need to be updated.
// We do not want Cline to reload the context every time a file is modified, so we use this class merely
// to inform Cline that the change has occurred, and tell Cline to reload the file before making
// any changes to it. This fixes an issue with diff editing, where Cline was unable to complete a diff edit.
// a diff edit because the file was modified since Cline last read it.

// FileContextTracker
//
// This class is responsible for tracking file operations.
// If the full contents of a file are pass to Cline via a tool, mention, or edit, the file is marked as active.
// If a file is modified outside of Cline, we detect and track this change to prevent stale context.
export class FileContextTracker 
{
	private context: vscode.ExtensionContext
	readonly taskId: string

	// File tracking and watching
	private fileWatchers = new Map<string, vscode.FileSystemWatcher>()
	private recentlyModifiedFiles = new Set<string>()
	private recentlyEditedByCline = new Set<string>()

	constructor(context: vscode.ExtensionContext, taskId: string) 
	{
		this.context = context
		this.taskId = taskId
	}

	// Gets the current working directory or returns undefined if it cannot be determined
	private get cwd(): string | undefined
	{
		const cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0)
		if (!cwd) 
			console.info("No workspace folder available - cannot determine current working directory")
		return cwd
	}

	// File watchers are set up for each file that is tracked in the task metadata.
	async setupFileWatcher(filePath: string) 
	{
		const fileUri = vscode.Uri.file(path.resolve(this.cwd!, filePath)) // Create a file system watcher for this specific file
		const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(fileUri.fsPath), path.basename(fileUri.fsPath)))

		// Track file changes
		watcher.onDidChange(() => {
			if (this.recentlyEditedByCline.has(filePath)) 
				this.recentlyEditedByCline.delete(filePath) // This was an edit by Cline, no need to inform Cline
			else 
				this.trackFile(filePath, "user_edited") // user edit a file shared with LLM, need to track and inform 
		})
		this.fileWatchers.set(filePath, watcher) // Store the watcher so we can dispose it later
	}

	// Tracks a file operation in metadata and sets up a watcher for the file
	// This is the main entry point for FileContextTracker and is called when a file is passed to Cline via a tool, mention, or edit.
	async trackFile(filePath: string, operation: FileMetadataEntry["record_source"]) 
	{
		try 
		{
			if (this.cwd) 
			{
				await this.addFileToFileContextTracker(this.taskId, filePath, operation) // Add file to metadata
				if (!this.fileWatchers.has(filePath))  // Only setup watcher if it doesn't already exist for this file
					await this.setupFileWatcher(filePath)// Set up file watcher for this file
			}
		} 
		catch (error) 
		{
			console.error("Failed to track file operation:", error)
		}
	}

	// Adds a file to the metadata tracker
	// This handles the business logic of determining if the file is new, stale, or active.
	// It also updates the metadata with the latest read/edit dates.
	private async addFileToFileContextTracker(taskId: string, filePath: string, operation: FileMetadataEntry["record_source"]) 
	{
		const metadata = await getTaskMetadata(this.context, taskId)
		const newEntry: FileMetadataEntry = {
			path: filePath,
			record_state: "active",
			record_source: operation}

		for (const entry of metadata.files_in_context)  // Mark existing entries for this file as stale and get the lastest dates
		{
			if (entry.path === filePath) 
			{
				if (entry.record_state === "active")
					entry.record_state = "stale"

				newEntry.cline_read_date = Math.max(newEntry.cline_read_date ?? 0, entry.cline_read_date ?? 0)
				newEntry.cline_edit_date = Math.max(newEntry.cline_edit_date ?? 0, entry.cline_edit_date ?? 0)
				newEntry.user_edit_date = Math.max(newEntry.user_edit_date ?? 0, entry.user_edit_date ?? 0)
			}
		}

		const now = Date.now()
		switch (operation) 
		{
			case "user_edited": 
				newEntry.user_edit_date = now
				this.recentlyModifiedFiles.add(filePath)
				break
			case "cline_edited": 
				newEntry.cline_read_date = now
				newEntry.cline_edit_date = now
				break
			case "read_tool": 
			case "file_mentioned":
				newEntry.cline_read_date = now
				break
		}

		metadata.files_in_context.push(newEntry)
		await saveTaskMetadata(this.context, taskId, metadata)
	}

	// Returns (and then clears) the set of recently modified files
	getAndClearRecentlyModifiedFiles(): string[] 
	{
		const files = Array.from(this.recentlyModifiedFiles)
		this.recentlyModifiedFiles.clear()
		return files
	}

	// Marks a file as edited by Cline to prevent false positives in file watchers
	markFileAsEditedByCline(filePath: string): void 
	{
		this.recentlyEditedByCline.add(filePath)
	}

	// Disposes all file watchers
	dispose(): void 
	{
    	Array.from(this.fileWatchers.values()).forEach(watcher => watcher.dispose())
    	this.fileWatchers.clear()
	}
}