import path from "path"
import ignore, { Ignore } from "ignore"
import * as vscode from "vscode"
import { loadFileAt } from "../../utils/fsUtils"
import { toPosixPath } from "../../utils/path"

export const LOCK_TEXT_SYMBOL = "\u{1F512}"

/**
 * Controls LLM access to files by enforcing ignore patterns.
 * Designed to be instantiated once in Cline.ts and passed to file manipulation services.
 * Uses the 'ignore' library to support standard .gitignore syntax in .clineignore files.
 */
export class ClineIgnoreController 
{
	private cwd: string
	private ignoreInstance: Ignore
	private disposables: vscode.Disposable[] = []
	clineIgnoreContent: string | undefined
	
	constructor(cwd: string) 
	{
		this.cwd = cwd
		this.ignoreInstance = ignore()
		this.clineIgnoreContent = undefined
		this.setupFileWatcher() // Set up file watcher for .clineignore		
		this.loadClineIgnore()
	}

	/**
	 * Set up the file watcher for .clineignore changes
	 */
	private setupFileWatcher(): void 
	{
		const clineignorePattern = new vscode.RelativePattern(this.cwd, ".clineignore")
		const fileWatcher = vscode.workspace.createFileSystemWatcher(clineignorePattern)

		this.disposables.push( // Watch for changes and updates
			fileWatcher.onDidChange(() => this.loadClineIgnore() ),
			fileWatcher.onDidCreate(() => this.loadClineIgnore() ),
			fileWatcher.onDidDelete(() => this.loadClineIgnore() ),
		)
		this.disposables.push(fileWatcher) // Add fileWatcher itself to disposables
	}

	/**
	 * Load custom patterns from .clineignore if it exists.
	 * Supports "!include <filename>" to load additional ignore patterns from other files.
	 */
	private async loadClineIgnore(): Promise<void> 
	{
		try 
		{
			this.ignoreInstance = ignore() // Reset ignore instance to prevent duplicate patterns
			this.clineIgnoreContent = await loadFileAt(this.cwd, ".clineignore") ?? undefined
			if (this.clineIgnoreContent)
			{
				await this.processIgnoreContent(this.clineIgnoreContent)
				this.ignoreInstance.add(".clineignore")
			}
		}
		catch (error) {}
	}

	/**
	 * Process ignore content and apply all ignore patterns
	 */
	private async processIgnoreContent(content: string): Promise<void> 
	{
		if (content.includes("!include "))  // Optimization: first check if there are any !include directives and process
		{
			const lines = content.split(/\r?\n/)
			content = ""
			for (let line of lines)  //Process !include directives and combine all included file contents
			{
				if (line.trim().startsWith("!include ")) 
				{
					const includePath = line.replace("!include", '').trim()
					line = await loadFileAt(this.cwd, includePath) ?? ''
				}
				if (line.length > 0) 
					content += "\n" + line
			}	
		}

		this.ignoreInstance.add(content)
	}


	/**
	 * Check if a file should be accessible to the LLM
	 * @param filePath - Path to check (relative to cwd)
	 * @returns true if file is accessible, false if ignored
	 */
	validateAccess(filePath: string): boolean
	{
		if (!this.clineIgnoreContent)  // Always allow access if .clineignore does not exist
			return true
		try 
		{
			const absolutePath = path.resolve(this.cwd, filePath) // Normalize path to be relative to cwd and use forward slashes
			const relativePath = toPosixPath( path.relative(this.cwd, absolutePath) )
			return this.ignoreInstance.ignores(relativePath) === false // Ignore expects paths to be path.relative()'d
		}
		catch (error) {} // Ignore error, will throw error for paths outside cwd. allow access all files outside cwd.
		
		return true
	}

	/***
	* Check if a terminal command should be allowed to execute based on file access patterns
	* @param command - Terminal command to validate
	* @returns path of file that is being accessed if it is being accessed, undefined if command is allowed
	*/
	validateCommand(command: string): string | undefined
	{
		if (!this.clineIgnoreContent)  // Always allow access if .clineignore does not exist
			return undefined

		// Split command into parts and get the base command
		const parts = command.trim().split(/\s+/)
		const baseCommand = parts[0].toLowerCase()

		// Commands that read file contents
		const fileReadingCommands = ["cat", "less", "more", "head", "tail", "grep", "awk", "sed",/*PS*/ "get-content", "gc", "type", "select-string", "sls"]

		if (fileReadingCommands.includes(baseCommand))
		{
			for (const arg in parts) // Check each argument that could be a file path
			{
				// Skip command flags/options (Unix and PowerShell) and Ignore PowerShell parameter names
				if (!arg.startsWith("-") && !arg.startsWith("/") && !arg.includes(":"))
				{
					if ( this.validateAccess(arg) === false) // Validate file access
						return arg
				}
			}
		}
		return undefined
	}

	/**
	 * Filter an array of paths, removing those that should be ignored
	 * @param paths - Array of paths to filter (relative to cwd)
	 * @returns Array of allowed paths
	 */
	filterPaths(paths: string[]): string[] 
	{
		return paths.filter(path => this.validateAccess(path))
	}

	/**
	 * Clean up resources when the controller is no longer needed
	 */
	dispose(): void 
	{
		this.disposables.forEach((d) => d.dispose())
		this.disposables = []
	}

	static async create(cwd:string)
	{
		const result = new ClineIgnoreController(cwd)
		await result.loadClineIgnore()
		return result
	}
}