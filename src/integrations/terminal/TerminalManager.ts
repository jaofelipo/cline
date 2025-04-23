import * as vscode from "vscode"
import { arePathsEqual } from "../../utils/path"
import { TerminalProcess } from "./TerminalProcess"

/*
TerminalManager:
- Creates/reuses terminals
- Runs commands via runCommand(), returning a TerminalProcess
- Handles shell integration events

TerminalProcess extends EventEmitter and implements Promise:
- Emits 'line' events with output while promise is pending
- process.continue() resolves promise and stops event emission
- Allows real-time output handling or background execution

getUnretrievedOutput() fetches latest output for ongoing commands

Enables flexible command execution:
- Await for completion
- Listen to real-time events
- Continue execution in background
- Retrieve missed output later

Notes:
- it turns out some shellIntegration APIs are available on cursor, although not on older versions of vscode
- "By default, the shell integration script should automatically activate on supported shells launched from VS Code."
Supported shells:
Linux/macOS: bash, fish, pwsh, zsh
Windows: pwsh


Example:

const terminalManager = new TerminalManager(context);

// Run a command
const process = terminalManager.runCommand('npm install', '/path/to/project');

process.on('line', (line) => {
    console.log(line);
});

// To wait for the process to complete naturally:
await process;

// Or to continue execution even if the command is still running:
process.continue();

// Later, if you need to get the unretrieved output:
const unretrievedOutput = terminalManager.getUnretrievedOutput(terminalId);
console.log('Unretrieved output:', unretrievedOutput);

Resources:
- https://github.com/microsoft/vscode/issues/226655
- https://code.visualstudio.com/updates/v1_93#_terminal-shell-integration-api
- https://code.visualstudio.com/docs/terminal/shell-integration
- https://code.visualstudio.com/api/references/vscode-api#Terminal
- https://github.com/microsoft/vscode-extension-samples/blob/main/terminal-sample/src/extension.ts
- https://github.com/microsoft/vscode-extension-samples/blob/main/shell-integration-sample/src/extension.ts
*/

/*
The new shellIntegration API gives us access to terminal command execution output handling.
However, we don't update our VSCode type definitions or engine requirements to maintain compatibility
with older VSCode versions. Users on older versions will automatically fall back to using sendText
for terminal command execution.
Interestingly, some environments like Cursor enable these APIs even without the latest VSCode engine.
This approach allows us to leverage advanced features when available while ensuring broad compatibility.
*/
declare module "vscode" {
	// https://github.com/microsoft/vscode/blob/f0417069c62e20f3667506f4b7e53ca0004b4e3e/src/vscode-dts/vscode.d.ts#L7442
	interface Terminal {
		shellIntegration?: {
			cwd?: vscode.Uri
			executeCommand?: (command: string) => {
				read: () => AsyncIterable<string>
			}
		}
	}
	// https://github.com/microsoft/vscode/blob/f0417069c62e20f3667506f4b7e53ca0004b4e3e/src/vscode-dts/vscode.d.ts#L10794
	interface Window {
		onDidStartTerminalShellExecution?: (
			listener: (e: any) => any,
			thisArgs?: any,
			disposables?: vscode.Disposable[],
		) => vscode.Disposable
	}
}

export interface TerminalInfo {
	terminal: vscode.Terminal
	busy?: boolean
	lastCommand?: string
	id: number
	process?:TerminalProcess
}


// vscode.window.terminals provides a list of all open terminals, but we dont know they're busy or not
// To prevent creating too many terminals, we keep track
export class TerminalManager 
{
	private static availableTerminals: TerminalInfo[] = []
	private static nextTerminalId = 1

	private disposables: vscode.Disposable[] = []

	constructor() 
	{
		try 
		{
			// read stream here results in a more consistent output. This is most obvious when running the `date` command.
			let disposable = (vscode.window as vscode.Window).onDidStartTerminalShellExecution?.(async (e) =>  e?.execution?.read()) 
			if (disposable) 
				this.disposables.push(disposable)
		}
		catch (error) {}
	}

	prepareCommand(terminalInfo: TerminalInfo, command: string)
	{
		terminalInfo.busy = true
		terminalInfo.lastCommand = command
		terminalInfo.process = new TerminalProcess(terminalInfo.terminal, command)

		terminalInfo.process.once("completed", () => terminalInfo.busy = false)

		terminalInfo.process.once("no_shell_integration", () => { // if shell integration is not available, remove terminal 
			terminalInfo.process = undefined 
			this.removeTerminal(terminalInfo.id) // Remove the terminal so we can't reuse it (in case it's running a long-running process)
		})

		return terminalInfo.process
	}

	async getOrCreateTerminal(cwd: string): Promise<TerminalInfo>  
	{	
		// Find available terminal from our pool first (created for this task)
		// check paths are equals because can be changed by user or tool
		let availableTerminal = TerminalManager.getAllTerminals().find((t) =>  
			(t.busy) ? false : arePathsEqual(vscode.Uri.file(cwd).fsPath, t.terminal.shellIntegration?.cwd?.fsPath ?? "") 
		)

		if (!availableTerminal)  // If no matching terminal exists, try to find any non-busy terminal
		{
			availableTerminal = TerminalManager.availableTerminals.find((t) => t.busy === false)

			if (availableTerminal)  // If no matching terminal exists, try to find any non-busy terminal
			{	
				await availableTerminal.process?.run(`cd "${cwd}"`)
				return availableTerminal
			}
		}		
		return (availableTerminal) ? availableTerminal : TerminalManager.createTerminal(cwd)
	}	

	getTerminals(busy: boolean):TerminalInfo[]
	{
		return TerminalManager.availableTerminals.filter((t) => t.busy === busy)
	}

	getUnretrievedOutput(terminal:TerminalInfo): string 
	{
		return terminal.process?.getUnretrievedOutput() ?? ""
	}

	private removeTerminal(id: number) 
	{
		TerminalManager.availableTerminals = TerminalManager.availableTerminals.filter((t) => t.id !== id)
	}

	disposeAll() 
	{
		this.disposables.forEach((disposable) => disposable.dispose())
		this.disposables = []
	}

	static createTerminal(cwd?: string | vscode.Uri | undefined): TerminalInfo 
	{
		const terminal = vscode.window.createTerminal({cwd, name: "Cline", iconPath: new vscode.ThemeIcon("robot")})
		const newInfo: TerminalInfo = {terminal, id: this.nextTerminalId++}
		this.availableTerminals.push(newInfo)
		return newInfo
	}

	static getAllTerminals(): TerminalInfo[] 
	{
		this.availableTerminals = this.availableTerminals.filter((t) => t.terminal.exitStatus === undefined ) //undefined while the terminal is active
		return this.availableTerminals
	}	
}