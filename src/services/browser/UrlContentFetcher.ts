import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { Browser, Page, launch } from "puppeteer-core"
import * as cheerio from "cheerio"
import TurndownService from "turndown"
// @ts-ignore
import PCR from "puppeteer-chromium-resolver"
import { ensureDirExists, fileExistsAtPath } from "@utils/fs"

interface PCRStats {
	puppeteer: { launch: typeof launch }
	executablePath: string
}

export class UrlContentFetcher 
{
	private static turndownService = new TurndownService()

	private context: vscode.ExtensionContext
	private browser?: Browser
	private page?: Page

	constructor(context: vscode.ExtensionContext) 
	{
		this.context = context
	}

	private async ensureChromiumExists(): Promise<PCRStats> 
	{
		const globalStoragePath = this.context?.globalStorageUri?.fsPath
		if (!globalStoragePath) 
			throw new Error("Global storage uri is invalid")
		
		const puppeteerDir = await ensureDirExists(globalStoragePath, "puppeteer")

		// if exist return the path to existing chromium, if not, will download to puppeteerDir/.chromium-browser-snapshots
		return puppeteerDir ? await PCR({downloadPath: puppeteerDir}) : undefined
	}

	async launchBrowser(): Promise<void> 
	{
		if (!this.browser) 
		{
			const stats = await this.ensureChromiumExists()
			this.browser = await stats?.puppeteer.launch({
				args: ["--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"],
				executablePath: stats.executablePath,
			})
			this.page = await this.browser?.newPage()// (latest version of puppeteer does not add headless to user agent)
		}
	}

	async closeBrowser(): Promise<void> 
	{
		await this.browser?.close()
		this.browser = undefined
		this.page = undefined
	}

	async urlToMarkdown(url: string): Promise<string> 
	{
		try
		{
			if (!this.browser) 
				await this.launchBrowser()

			// 	- networkidle2: waits for ≤2 active connections for 500ms (like Playwright's networkidle)
			//	- domcontentloaded: fires when basic DOM is ready (Good enough for most documentation sites)
			await this.page!.goto(url, {timeout: 10_000, waitUntil: ["domcontentloaded", "networkidle2"]})
			const content = cheerio.load( await this.page!.content() ) // use cheerio to parse and clean up the HTML
			content("script, style, nav, footer, header").remove()
			return UrlContentFetcher.turndownService.turndown(content.html())
		}
		catch (error) 
		{
			return `Error fetching content: ${error.message}`
		}
	}
}
