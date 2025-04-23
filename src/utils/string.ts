/**
 * Fixes incorrectly escaped HTML entities in AI model outputs
 * @param text String potentially containing incorrectly escaped HTML entities from AI models
 * @returns String with HTML entities converted back to normal characters
 */
export function fixModelHtmlEscaping(text: string): string {
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
export function removeInvalidChars(text: string): string {
	return text.replace(/\uFFFD/g, "")
}

// Remove like '%', '$', '#', or '>'  at the end of the last line(vsode uses % at the beginning)
export 	function removeFromLastLine(data:string, regex:RegExp = /[%$#>]\s*$/)
{
	const lines = data.trimEnd().split("\n")
	if (lines.length > 0) 
		lines[lines.length - 1] = lines[lines.length - 1].replace(regex, "")
	return lines.join("\n").trimEnd()
}

export const dateTimeformatter = 
	new Intl.DateTimeFormat(undefined, {year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hour12: true})
export const dateTimeformatterTimeZone = dateTimeformatter.resolvedOptions().timeZone


