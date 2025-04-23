import { EventEmitter } from "events"
import { stripAnsi } from "./ansiUtils"
import * as vscode from "vscode"
import { removeFromLastLine } from "@/utils/string"
import pWaitFor from "p-wait-for"

export interface TerminalProcessEvents {
	line: [line: string]
	continue: []
	completed: []
	error: [error: Error]
	no_shell_integration: []
}

const PROCESS_HOT_TIMEOUT_NORMAL = 2_000 // how long to wait after a process outputs anything before we consider it "cool" again
const PROCESS_HOT_TIMEOUT_COMPILING = 15_000

export class TerminalProcess extends EventEmitter<TerminalProcessEvents> 
{
	//waitForShellIntegration: boolean = true
	private isListening: boolean = true
	private buffer: string = ""
	private fullOutput: string = ""
	public get isHot():boolean 
	{
		return this.hotTimer !== null
	}
	private hotTimer: NodeJS.Timeout | null = null
	private terminal: vscode.Terminal
	private command:string

	constructor(terminal: vscode.Terminal, command: string)
	{
		super()
		this.terminal = terminal
		this.command = command
	}

	async run(command?: string) 
	{
		this.command = (command) ? command : this.command
		// docs recommend waiting 3s for shell integration to activate, but pWaitFor check before start the timer, if condition trully -> resolve/reject 
		await pWaitFor(() => this.terminal.shellIntegration !== undefined, { timeout: 4000, interval:100, before:true })

		if (this.terminal.shellIntegration?.executeCommand) 
		{
			const execution = this.terminal.shellIntegration.executeCommand(this.command)
			const stream = execution.read() // todo: need to handle errors
			let flags = {firstChunkProcessed: false, echoProcessed: false}

			for await (let data of stream) 
			{
				// 1. Process chunk and remove artifacts, needs to be processed to be more human readable
				data = this.cleanVSCodeIntegrationOutput(data, flags)

				if (data.includes("^C") || data.includes("\u0003"))  // Ctrl+C detection: if user presses Ctrl+C, treat as command terminated
				{
					this.hotTimer = this.clearAndCreateTimer(this.hotTimer, undefined)
					break
				}

				if (!flags.echoProcessed)  // first few chunks could be the command being echoed back, so we must ignore -> so 'echo' commands wont work ok
					data = this.removeCommandEchoes(data, this.command, flags)

				data = data.replace(/,/g, "") // FIXME: Shell integration stream data chunks have unexpected commas; need a better fix than removing them.

				// 2. Set isHot depending on the command
				const waitingTime = this.isCompiling(data) ? PROCESS_HOT_TIMEOUT_COMPILING : PROCESS_HOT_TIMEOUT_NORMAL
				this.hotTimer = this.clearAndCreateTimer(this.hotTimer, waitingTime) // Set to hot to stall API requests until terminal is cool again
				
				if (this.buffer.length === 0 && data) // For non-immediately show loading spinner, as soon as we get any output emit "" to let webview know to show spinner
					this.emit("line", "") // empty line to indicate start of command output stream

				this.buffer += data

				if (this.isListening) 
				{	
					const lines = this.buffer.split('\n')
					this.buffer = lines.pop() || ''
					lines.forEach((line) => this.emit("line", line.trimEnd()))
					this.fullOutput += lines.concat('\n')
				}
			}

			this.emitRemainingBufferIfListening()

			this.hotTimer = this.clearAndCreateTimer(this.hotTimer, undefined)
			this.emit("completed")
			this.emit("continue")
		}
		else  // terminals without shell integration, we can't know when the command completes, so just emit the continue event 
		{
			this.terminal.sendText(this.command, true)
			this.emit("completed")
			this.emit("continue")
			this.emit("no_shell_integration")
		}
		//return this.fullOutput -> solução sem guarda de fluxo
		return new Promise(resolve => this.once("continue", () => resolve(this.fullOutput)));
	}

	private emitRemainingBufferIfListening() 
	{
		if (this.buffer && this.isListening) 
		{
			const remainingBuffer = this.getUnretrievedOutput()
			if (remainingBuffer) 
				this.emit("line", remainingBuffer)
		}
	}	

	continue() 
	{
		this.emitRemainingBufferIfListening()
		this.isListening = false
		this.removeAllListeners("line")
		this.emit("continue")
	}

	getUnretrievedOutput(): string 
	{
		const unretrieved = this.buffer
		this.fullOutput += unretrieved
		this.buffer = ""
		return removeFromLastLine(unretrieved, /[%$#>]\s*$/)
	}

	private clearAndCreateTimer(previousTimer: NodeJS.Timeout | null, waitingTime:number | undefined)
	{
		if (previousTimer) 
			clearTimeout(previousTimer)

		return (waitingTime) ? setTimeout(() => this.hotTimer = null, waitingTime) : null
	}

	private isCompiling(data:string):boolean
	{
		// Markers indicate the command is some kind of local dev recompiling the app, which we want to wait for output of before sending request to cline
		const compilings = ["compiling", "building", "bundling", "transpiling", "generating", "starting"]
		const nullifiers = ["compiled", "success", "finish", "complete", "succeed", "done", "end", "stop", "exit", "terminate", "error", "fail"]

		const dataLower = data.toLowerCase();
		return compilings.some((k) => dataLower.includes(k)) && nullifiers.every((k) => !dataLower.includes(k));
	}

	private cleanVSCodeIntegrationOutput(data:string, flags:{firstChunkProcessed:boolean, echoProcessed:boolean}):string
	{
		if (flags.firstChunkProcessed) 
			return stripAnsi(data)
	
		flags.firstChunkProcessed = true
	
		// bug where sometimes the command output makes its way into vscode shell integration metadata
		/*
		- ]633 is a custom sequence number used by VSCode shell integration:
		- \x1b\]633;: Start of OSC (Operating System Command) sequence for VS Code integration (prefix '\x1b' + ']633;').
		- OSC 633 ; A ST - Mark prompt start
		- OSC 633 ; B ST - Mark prompt end
		- OSC 633 ; C ST - Mark pre-execution (start of command output)
		- OSC 633 ; D [; <exitcode>] ST - Mark execution finished with optional exit code
		- OSC 633 ; E ; <commandline> [; <nonce>] ST - Explicitly set command line with optional nonce
		*/
	
		// if you print this data you see a bunch of escape sequences, ignore up to the first -> OSC 633 ; C
		let commandData = data.match(/\]633;C([\s\S]*?)\]633;D/)?.[1] ?? "" // Gets text between ]633;C (command start) and ]633;D (command end)
		commandData = removeFromLastLine(commandData, /[%$#>]\s*$/).trim() // Remove '%','$','#','>' at the end of the last line
		
		//\x1b\]633; -> start of OSC. \x07 -> ring bell char, end of OSC sequence
		const vscodeSequenceRegex = /\x1b\]633;.[^\x07]*\x07/g // https://code.visualstudio.com/docs/terminal/shell-integration#_vs-code-custom-sequences-osc-633-st
		
		const lastMatch = [...data.matchAll(vscodeSequenceRegex)].pop()
		if (lastMatch?.index !== undefined) 
			data = data.slice(lastMatch.index + lastMatch[0].length)
	
		if (commandData) // Place output back after removing vscode sequences
			data = commandData + "\n" + data
		
		data = stripAnsi(data) // remove ansi
		
		let lines = data?.split("\n") ?? [] // Split data by newlines
	
		lines[0] = (lines[0] ?? "")
						.replace(/[^\x20-\x7E]/g, "")// Remove non-human readable characters from the first line
						.replace(/^(.)\1/, "$1") // Remove first char if ot's duplicated
		
		// Remove everything up to the first alphanumeric character for first two lines
		lines.slice(0, 2).forEach((line, index) => lines[index] = line.replace(/^[^a-zA-Z0-9]*/, "")) 
		
		return lines.join("\n")
	}
	
	private removeCommandEchoes(data: string, command: string, flags:{firstChunkProcessed:boolean, echoProcessed:boolean}):string
	{
		const lines = data.split("\n");
		while (!flags.echoProcessed && lines.length)
		{
			if (command.includes(lines[0].trim())) 
				lines.splice(0, 1)
			else 
				flags.echoProcessed = true
		}
		return lines.join("\n")
	}
}

export type TerminalProcessResultPromise = TerminalProcess & Promise<void>

// this lets us create a mixin of both a TerminalProcess and a Promise: https://github.com/sindresorhus/execa/blob/main/lib/methods/promise.js
export function mergePromise(process:TerminalProcess, promise?:Promise<void>): TerminalProcessResultPromise 
{
	promise = promise ?? new Promise<void>((resolve, reject) => {
		process.once("continue", () => resolve())
		process.once("error", (error) => reject(error))
	})

	const nativePromisePrototype = (async () => {})().constructor.prototype
	for (const method of ["then", "catch", "finally"] as const) 
	{
        const descriptor = Reflect.getOwnPropertyDescriptor(nativePromisePrototype, method);
        if (descriptor) 
            Reflect.defineProperty(process, method, {...descriptor, value: descriptor.value.bind(promise)})
	}
	return process as TerminalProcessResultPromise
}