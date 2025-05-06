import * as vscode from "vscode"
import fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { getExtension, arePathsEqual, getMimeType } from "../../utils/path"
import mammoth from "mammoth"
import { isBinaryFile } from "isbinaryfile"
import deepEqual from "fast-deep-equal"
// @ts-ignore-next-line
import pdf from "pdf-parse/lib/pdf-parse"
import * as chardet from "jschardet"
import * as iconv from "iconv-lite"

export async function detectEncoding(fileBuffer: Buffer): Promise<string> 
{
	const detected = chardet.detect(fileBuffer)
	if (typeof detected === "string") 
		return detected
	if (detected && (detected as any).encoding) 
		return (detected as any).encoding
	return "utf8"
}

export async function extractTextFromFile(filePath: string):Promise<string | undefined>
{
	try 
	{
		await fs.access(filePath)

		switch (getExtension(filePath)) 
		{
			case ".pdf":
				return await pdf(await fs.readFile(filePath)).text
			case ".docx":
				return (await mammoth.extractRawText({ path: filePath })).value
			case ".ipynb":
				const data = await loadDecodedContent(filePath)
				const notebook = JSON.parse(data)
				const reducer = (result:string, {cell_type, source}:any) => 
					result + ((cell_type === "markdown" || cell_type === "code") && source) ? source.join("\n") + "\n" : ""
				return notebook.cells.reduce(reducer, "" /* initial value of accumulator*/)
			default:
				return await loadDecodedContent(filePath)
		}
	} 
	catch (error) {}
	
	return undefined
		//return (error && error.message) ? error.message : binaryDefaultResult
	
}

async function loadDecodedContent(filePath: string, binaryDefaultResult:string="")
{
	const isBinary = await isBinaryFile(filePath).catch(() => false)
	if (isBinary)
		throw new Error('Binary file')
	const fileBuffer = await fs.readFile(filePath)
	const encoding = await detectEncoding(fileBuffer)
	if (fileBuffer.byteLength > 300 * 1024) 
		throw new Error(`File is too large to read into context.`)
	return iconv.decode(fileBuffer, encoding)
}

export async function vsOpenSelectImages(): Promise<string[]> 
{
    const options: vscode.OpenDialogOptions = {
        canSelectMany: true,
        openLabel: "Select",
        filters: {
            Images: ["png", "jpg", "jpeg", "webp"], // supported by anthropic and openrouter
        },
    }
    const fileUris = await vscode.window.showOpenDialog(options) || []

    return await Promise.all(fileUris.map(uri => 
        fs.readFile(uri.fsPath)
        .then(buffer => `data:${getMimeType(uri.fsPath)};base64,${buffer.toString("base64")}`)))
}


export async function vsOpenImage(dataUri: string) 
{
	const matches = dataUri.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/)
	if (matches) 
	{
		const [, format, base64Data] = matches
		const imageBuffer = new Uint8Array(Buffer.from(base64Data, "base64"))
		const tempFilePath = path.join(os.tmpdir(), `temp_image_${Date.now()}.${format}`)
		try 
		{
			await vscode.workspace.fs.writeFile(vscode.Uri.file(tempFilePath), imageBuffer)
			await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(tempFilePath))
		} 
		catch (error) 
		{
			vscode.window.showErrorMessage(`Error opening image: ${error}`)
		}
	}
	else
	{
		vscode.window.showErrorMessage("Invalid data URI format")
	}
}

export async function vsOpenFile(absolutePath: string) 
{
	try 
	{
		const uri = vscode.Uri.file(absolutePath)
		await closeTab(uri.fsPath)
		const doc = await vscode.workspace.openTextDocument(uri)
		await vscode.window.showTextDocument(doc, { preview: false })
	} 
	catch 
	{
		vscode.window.showErrorMessage(`Could not open file!`);
	}
	
	async function closeTab(uriPath:string) 
	{
		try 
		{
			for (const group of vscode.window.tabGroups.all) 
			{
				const tab = group.tabs.find(t => t.input instanceof vscode.TabInputText && arePathsEqual(t.input.uri.fsPath, uriPath))
				if (tab) 
				{
					if (vscode.window.activeTextEditor?.viewColumn !== group.viewColumn && !tab.isDirty) 
						await vscode.window.tabGroups.close(tab)
					break;
				}
			}
		}
		catch {}
	}
}

export function getNewDiagnostics(oldDiagnostics: [vscode.Uri, vscode.Diagnostic[]][], newDiagnostics: [vscode.Uri, vscode.Diagnostic[]][]): [vscode.Uri, vscode.Diagnostic[]][] 
{
	const newProblems: [vscode.Uri, vscode.Diagnostic[]][] = []
	const oldMap = new Map(oldDiagnostics)

	for (const [uri, newDiags] of newDiagnostics) 
	{
		const oldDiags = oldMap.get(uri) || []
		const newProblemsForUri = newDiags.filter((newDiag) => !oldDiags.some((oldDiag) => deepEqual(oldDiag, newDiag)))

		if (newProblemsForUri.length > 0) 
			newProblems.push([uri, newProblemsForUri])
	}
	return newProblems
}

// Usage:
// const oldDiagnostics = // ... your old diagnostics array
// const newDiagnostics = // ... your new diagnostics array
// const newProblems = getNewDiagnostics(oldDiagnostics, newDiagnostics);

// Example usage with mocks:
//
// // Mock old diagnostics
// const oldDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
//     [vscode.Uri.file("/path/to/file1.ts"), [
//         new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), "Old error in file1", vscode.DiagnosticSeverity.Error)
//     ]],
//     [vscode.Uri.file("/path/to/file2.ts"), [
//         new vscode.Diagnostic(new vscode.Range(5, 5, 5, 15), "Old warning in file2", vscode.DiagnosticSeverity.Warning)
//     ]]
// ];
//
// // Mock new diagnostics
// const newDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
//     [vscode.Uri.file("/path/to/file1.ts"), [
//         new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), "Old error in file1", vscode.DiagnosticSeverity.Error),
//         new vscode.Diagnostic(new vscode.Range(2, 2, 2, 12), "New error in file1", vscode.DiagnosticSeverity.Error)
//     ]],
//     [vscode.Uri.file("/path/to/file2.ts"), [
//         new vscode.Diagnostic(new vscode.Range(5, 5, 5, 15), "Old warning in file2", vscode.DiagnosticSeverity.Warning)
//     ]],
//     [vscode.Uri.file("/path/to/file3.ts"), [
//         new vscode.Diagnostic(new vscode.Range(1, 1, 1, 11), "New error in file3", vscode.DiagnosticSeverity.Error)
//     ]]
// ];
//
// const newProblems = getNewProblems(oldDiagnostics, newDiagnostics);
//
// console.log("New problems:");
// for (const [uri, diagnostics] of newProblems) {
//     console.log(`File: ${uri.fsPath}`);
//     for (const diagnostic of diagnostics) {
//         console.log(`- ${diagnostic.message} (${diagnostic.range.start.line}:${diagnostic.range.start.character})`);
//     }
// }
//
// // Expected output:
// // New problems:
// // File: /path/to/file1.ts
// // - New error in file1 (2:2)
// // File: /path/to/file3.ts
// // - New error in file3 (1:1)

// will return empty string if no problems with the given severity are found
export function diagnosticsToProblemsString(diagnostics: [vscode.Uri, vscode.Diagnostic[]][], severities: vscode.DiagnosticSeverity[], cwd: string) 
{
	const severityLabels: Record<number, string> = {
		[vscode.DiagnosticSeverity.Error]: "Error",
		[vscode.DiagnosticSeverity.Warning]: "Warning",
		[vscode.DiagnosticSeverity.Information]: "Information",
		[vscode.DiagnosticSeverity.Hint]: "Hint"}

	let result = ""
	for (const [uri, fileDiagnostics] of diagnostics) 
	{
		const problems = fileDiagnostics.filter((d) => severities.includes(d.severity))
		if (problems.length > 0) 
		{
			result += `\n\n${path.relative(cwd, uri.fsPath).toPosix()}`
			for (const diagnostic of problems) 
			{
				const label = severityLabels[diagnostic.severity] || "Diagnostic"
				const line = diagnostic.range.start.line + 1 // VSCode lines are 0-indexed
				const source = diagnostic.source ? `${diagnostic.source} ` : ""
				result += `\n- [${source}${label}] Line ${line}: ${diagnostic.message}`
			}
		}		
	}
	return result.length > 0 ? result : undefined
}
