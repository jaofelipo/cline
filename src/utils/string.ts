/**
 * Fixes incorrectly escaped HTML entities in AI model outputs
 * @param text String potentially containing incorrectly escaped HTML entities from AI models
 * @returns String with HTML entities converted back to normal characters
 */
export function fixModelHtmlEscaping(text: string): string 
{
	return text
		.replace(/&gt;/g, ">")
		.replace(/&lt;/g, "<")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&")
		.replace(/&apos;/g, "'")
}

/**
 * Removes invalid characters (like the replacement character �) from a string
 * @param text String potentially containing invalid characters
 * @returns String with invalid characters removed
 */
export function removeInvalidChars(text: string): string 
{
	return text.replace(/\uFFFD/g, "")
}

export function removePatternAtEnd(content:string, pattern:RegExp):string 
{
	const match = content.trimEnd().match(pattern)
	return (match) ? content.trimEnd().slice(0, -match[0].length) : content
}

export function removeIncompleteTagAtEnd(content: string): string
{
	const lastOpenBracketIndex = content.lastIndexOf("<")
	if (lastOpenBracketIndex !== -1) 
	{
		const tag = content.slice(lastOpenBracketIndex)
		if (!tag.includes(">"))  // If tag not complete, not including >, so remove it
		{
			let tagContent:string = (tag.startsWith("</")) ?  tag.slice(2).trim() : tag.slice(1).trim()
			const isLikelyTagName = /^[a-zA-Z_]+$/.test(tagContent) // Check if an incomplete tag name (letters and underscores only)
			// remove < or </ to keep from these artifacts showing up in chat (also handles closing thinking tags)
			if ((tag === "<" || tag === "</") || isLikelyTagName)  
				content = content.slice(0, lastOpenBracketIndex).trim()// If the tag is incomplete and at the end, remove it from the content
		}
	}
	return content
}

// Remove like '%', '$', '#', or '>'  at the end of the last line(vsode uses % at the beginning)
export 	function removeFromLastLine(data:string, regex:RegExp = /[%$#>]\s*$/)
{
	const lines = data.trimEnd().split("\n")
	if (lines.length > 0) 
		lines[lines.length - 1] = lines[lines.length - 1].replace(regex, "")
	return lines.join("\n").trimEnd()
}

export function contains(target:string, ...values: string[]): boolean 
{
    return values.some((comparison) => target.includes(comparison))
}

export function capitalizeFirstLetter(text:string):string 
{
    return text.charAt(0).toUpperCase() + text.slice(1)
}

export function toXMLString(tagName:string, content:any, keys:Record<string, string>={})
{
	const attrs = Object.entries(keys).map(([key, value]) => ` ${key}="${value}"`).join('')
	content = (typeof content === 'string') ? content : toXMLNode(content)
	return `<${tagName}${attrs}>\n${content}\n</${tagName}>`
}

function toXMLNode(target:any)
{
	return Object.entries(target as Record<string, any>)
		.map(([key, value]) => toXMLString(key, typeof value === 'string' ? value : String(value)))
		.join("\n")
}

export function replacePlaceholders(text: string, substitutions:Record<string, string>): string 
{
	let replacedText = text;

	for (const placeholder in substitutions) 
	{
		if (substitutions.hasOwnProperty(placeholder)) 
		replacedText = replacedText.replace(new RegExp(`{{${placeholder}}}`, 'g'), substitutions[placeholder]);
	}

	replacedText = replacedText.replace(/{{.*?}}/g, '') // remove any remain placeholders

	return replacedText;
}

export function normalizeEOL(content: string, eol: string): string 
{
    return content.replace(/\r\n|\n/g, eol).trimEnd() + eol  // trimEnd to fix issue where editor adds in extra new line automatically
}

/**
 * A helper function that returns a unique alphanumeric identifier called a nonce.
 *
 * @remarks This function is primarily used to help enforce content security
 * policies for resources/scripts being executed in a webview context.
 *
 * @returns A nonce
 */
export function generateNonce() 
{
	let text = ""
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	for (let i = 0; i < 32; i++) 
	{
		text += possible.charAt(Math.floor(Math.random() * possible.length))
	}
	return text
}

export const dateTimeformatter = 
	new Intl.DateTimeFormat(undefined, {year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hour12: true})

export const dateTimeformatterTimeZone = dateTimeformatter.resolvedOptions().timeZone