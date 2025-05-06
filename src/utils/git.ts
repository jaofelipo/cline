import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)
const GIT_OUTPUT_LINE_LIMIT = 500

export interface GitCommit {
	hash: string
	shortHash: string
	subject: string
	author: string
	date: string
}

async function checkGitRepo(cwd: string): Promise<boolean> {
	try {
		await execAsync("git rev-parse --git-dir", { cwd })
		return true
	} catch (error) {
		return false
	}
}

async function checkGitInstalled(): Promise<boolean> {
	try {
		await execAsync("git --version")
		return true
	} catch (error) {
		return false
	}
}

export async function searchCommits(query: string, cwd: string): Promise<GitCommit[]> {
	try {
		const isInstalled = await checkGitInstalled()
		if (!isInstalled) {
			console.error("Git is not installed")
			return []
		}

		const isRepo = await checkGitRepo(cwd)
		if (!isRepo) {
			console.error("Not a git repository")
			return []
		}

		// Search commits by hash or message, limiting to 10 results
		const { stdout } = await execAsync(
			`git log -n 10 --format="%H%n%h%n%s%n%an%n%ad" --date=short ` + `--grep="${query}" --regexp-ignore-case`,
			{ cwd },
		)

		let output = stdout
		if (!output.trim() && /^[a-f0-9]+$/i.test(query)) {
			// If no results from grep search and query looks like a hash, try searching by hash
			const { stdout: hashStdout } = await execAsync(
				`git log -n 10 --format="%H%n%h%n%s%n%an%n%ad" --date=short ` + `--author-date-order ${query}`,
				{ cwd },
			).catch(() => ({ stdout: "" }))

			if (!hashStdout.trim()) {
				return []
			}

			output = hashStdout
		}

		const commits: GitCommit[] = []
		const lines = output
			.trim()
			.split("\n")
			.filter((line) => line !== "--")

		for (let i = 0; i < lines.length; i += 5) {
			commits.push({
				hash: lines[i],
				shortHash: lines[i + 1],
				subject: lines[i + 2],
				author: lines[i + 3],
				date: lines[i + 4],
			})
		}

		return commits
	} catch (error) {
		console.error("Error searching commits:", error)
		return []
	}
}

export async function getCommitInfo(hash: string, cwd: string): Promise<string> 
{
	try 
	{
		if (!await checkGitInstalled()) 
			return "Git is not installed"

		if (!await checkGitRepo(cwd))
			return "Not a git repository"

		const { stdout: info } = await execAsync(`git show --format="%H%n%h%n%s%n%an%n%ad%n%b" --no-patch ${hash}`, {cwd}) // Get commit info, stats, and diff separately
		const [fullHash, shortHash, subject, author, date, body] = info.trim().split("\n")

		const { stdout: stats } = await execAsync(`git show --stat --format="" ${hash}`, { cwd })

		const { stdout: diff } = await execAsync(`git show --format="" ${hash}`, { cwd })

		const summary = [
			`Commit: ${shortHash} (${fullHash})`,
			`Author: ${author}`,
			`Date: ${date}`,
			`\nMessage: ${subject}`,
			body ? `\nDescription:\n${body}` : "",
			"\nFiles Changed:",
			stats.trim(),
			"\nFull Changes:",
		].join("\n")

		const output = summary + "\n\n" + diff.trim()
		return truncateOutput(output, GIT_OUTPUT_LINE_LIMIT)
	} 
	catch (error) 
	{
		console.error("Error getting commit info:", error)
		return `Failed to get commit info: ${error instanceof Error ? error.message : String(error)}`
	}
}

export async function getWorkingState(cwd: string): Promise<string> 
{
	try 
	{
		if (!await checkGitInstalled()) 
			return "Git is not installed"

		if (!await checkGitRepo(cwd)) 
			return "Not a git repository"

		const { stdout: status } = await execAsync("git status --short", { cwd }) // Get status of working directory
		if (!status.trim()) 
			return "No changes in working directory"
	
		const { stdout: diff } = await execAsync("git diff HEAD", { cwd }) // Get all changes (both staged and unstaged) compared to HEAD
		const output = `Working directory changes:\n\n${status}\n\n${diff}`.trim()
		
		return truncateOutput(output, GIT_OUTPUT_LINE_LIMIT)
	}
	catch (error) 
	{
		console.error("Error getting working state:", error)
		return `Error fetching working state: ${error instanceof Error ? error.message : String(error)}`
	}
}


function truncateOutput(content: string, outputLimit?:number): string 
{
	if (outputLimit)
	{
		const lines = content.split("\n")
		if (lines.length > outputLimit) 
		{
			const beforeLimit = Math.floor(outputLimit * 0.2) // 20% of lines before
			const afterLimit = outputLimit - beforeLimit // remaining 80% after
			return [
				...lines.slice(0, beforeLimit),
				`\n[...${lines.length - outputLimit} lines omitted...]\n`,
				...lines.slice(-afterLimit),
			].join("\n")
		}
	}
	return content
}
