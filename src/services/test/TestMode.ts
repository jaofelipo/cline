
/**
 * Module for managing test mode state across the extension
 * This provides a centralized way to check if the extension is running in test mode
 * instead of relying on process.env which may not be consistent across different parts of the extension
 */
import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"
import { Logger } from "../logging/Logger"
import { createTestServer, shutdownTestServer } from "./TestServer"
import { execa } from "execa"
import { cwd, Task } from "@/core/task"
import { executeCommandTool } from "../terminal/executeCommand"

// State variable
let isTestMode = false

/**
 * Sets the test mode state
 * @param value Whether test mode is enabled
 */
export function setTestMode(value: boolean): void {
	isTestMode = value
}

/**
 * Checks if the extension is running in test mode
 * @returns True if in test mode, false otherwise
 */
export function isInTestMode(): boolean {
	return isTestMode
}

/**
 * Check if we're in test mode by looking for evals.env file in workspace folders
 */
function checkForTestMode(): boolean {
	// Get all workspace folders
	const workspaceFolders = vscode.workspace.workspaceFolders || []

	// Check each workspace folder for an evals.env file
	for (const folder of workspaceFolders) {
		const evalsEnvPath = path.join(folder.uri.fsPath, "evals.env")
		if (fs.existsSync(evalsEnvPath)) {
			Logger.log(`Found evals.env file at ${evalsEnvPath}, activating test mode`)
			return true
		}
	}

	return false
}

/**
 * Initialize test mode detection and setup file watchers
 * @param context VSCode extension context
 * @param webviewProvider The webview provider instance
 */
export function initializeTestMode(context: vscode.ExtensionContext, webviewProvider?: any): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = []

	// Check if we're in test mode
	const IS_TEST = checkForTestMode()

	// Set test mode state for other parts of the code
	if (IS_TEST) {
		Logger.log("Test mode detected: Setting test mode state to true")
		setTestMode(true)
		vscode.commands.executeCommand("setContext", "cline.isTestMode", true)

		// Set up test server if in test mode
		createTestServer(webviewProvider)
	}

	// Watch for evals.env files being added or removed
	const evalsEnvWatcher = vscode.workspace.createFileSystemWatcher("**/evals.env")

	// When an evals.env file is created, activate test mode if not already active
	evalsEnvWatcher.onDidCreate(async (uri) => {
		Logger.log(`evals.env file created at ${uri.fsPath}`)
		if (!isInTestMode()) {
			setTestMode(true)
			vscode.commands.executeCommand("setContext", "cline.isTestMode", true)
			createTestServer(webviewProvider)
		}
	})

	// When an evals.env file is deleted, deactivate test mode if no other evals.env files exist
	evalsEnvWatcher.onDidDelete(async (uri) => {
		Logger.log(`evals.env file deleted at ${uri.fsPath}`)
		// Only deactivate if this was the last evals.env file
		if (!checkForTestMode()) {
			setTestMode(false)
			vscode.commands.executeCommand("setContext", "cline.isTestMode", false)
			shutdownTestServer()
		}
	})

	disposables.push(evalsEnvWatcher)

	return disposables
}

/**
 * Clean up test mode resources
 */
export function cleanupTestMode(): void {
	// Shutdown the test server if it exists
	shutdownTestServer()
}



export class TestWrapper
{
	static async executeCommandTool(command: string, task:Task)
	{
		Logger.info("IS_TEST: " + isInTestMode())
		if (isInTestMode())  // Check if we're in test mode
		{
			Logger.info("Executing command in Node: " + command) 		// In test mode, execute the command directly in Node
			return await executeCommandInNode(command)
		}
		Logger.info("Executing command in VS code terminal: " + command)
		
		return await executeCommandTool.call(task, command)

		/**
		 * Executes a command directly in Node.js using execa
		 * This is used in test mode to capture the full output without using the VS Code terminal
		 * Commands are automatically terminated after 30 seconds using Promise.race
		 */
		async function executeCommandInNode(command: string): Promise<{text:string, images?:string[]} | string> 
		{
			try {
				// Create a child process
				const childProcess = execa(command, {
					shell: true,
					cwd,
					reject: false,
					all: true, // Merge stdout and stderr
				})

				// Set up variables to collect output
				let output = ""

				// Collect output in real-time
				if (childProcess.all) {
					childProcess.all.on("data", (data) => {
						output += data.toString()
					})
				}

				// Create a timeout promise that rejects after 30 seconds
				const timeoutPromise = new Promise<never>((_, reject) => {
					setTimeout(() => {
						if (childProcess.pid) {
							childProcess.kill("SIGKILL") // Use SIGKILL for more forceful termination
						}
						reject(new Error("Command timeout after 30s"))
					}, 30000)
				})

				// Race between command completion and timeout
				const result = await Promise.race([childProcess, timeoutPromise]).catch((error) => {
					// If we get here due to timeout, return a partial result with timeout flag
					Logger.info(`Command timed out after 30s: ${command}`)
					return {
						stdout: "",
						stderr: "",
						exitCode: 124, // Standard timeout exit code
						timedOut: true,
					}
				})

				// Check if timeout occurred
				const wasTerminated = result.timedOut === true

				// Use collected output or result output
				if (!output) {
					output = result.stdout || result.stderr || ""
				}

				Logger.info(`Command executed in Node: ${command}\nOutput:\n${output}`)

				// Add termination message if the command was terminated
				if (wasTerminated) {
					output += "\nCommand was taking a while to run so it was auto terminated after 30s"
				}

				// Format the result similar to terminal output
				return {text: `Command executed${wasTerminated ? " (terminated after 30s)" : ""} with exit code ${
						result.exitCode
					}.${output.length > 0 ? `\nOutput:\n${output}` : ""}`}
			} catch (error) {
				// Handle any errors that might occur
				const errorMessage = error instanceof Error ? error.message : String(error)
				return `Error executing command: ${errorMessage}`
			}
		}
	}
}

