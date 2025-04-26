class StringUtils 
{
    static removeStart(newContent: string, delimiter:string = "```"): string 
    {
      return (newContent.startsWith(delimiter)) ? newContent.split("\n").slice(1).join("\n").trim() : newContent
    }
  
    static removeEnd(newContent: string, delimiter:string = "```"): string 
    {
      return newContent.endsWith(delimiter) ? newContent.split("\n").slice(0, -1).join("\n").trim() : newContent;
    }

    static removeStartAndEnd(newContent: string, start:string = "```", end:string = "```"): string 
    {
        newContent = (newContent.startsWith(start)) ? newContent.split("\n").slice(1).join("\n").trim() : newContent
        return newContent.endsWith(end) ? newContent.split("\n").slice(0, -1).join("\n").trim() : newContent;
    }

    static htmlEntitiesMap = {  '&gt;': '>',
                                '&lt;': '<',
                                '&quot;': '"'};
    
     /** Convert &gt &lt &quot em texto equivalente*/ 
    static convertHtmlEntitiesToText(newContent: string): string 
    {
        return newContent.replace(/&gt;|&lt;|&quot;/g, (match) => StringUtils.htmlEntitiesMap[match as keyof typeof StringUtils.htmlEntitiesMap] || match);
    } 


    static regexTagCache = new Map<string, RegExp>();
    
    /**
     * If block is partial, remove partial closing tag so its not presented to user
     */
    static removeTag(tag: string, text?: string, partial: boolean = true) 
    {
        if (partial && text) // Dynamically constructs a regex to match closing tags, including optional whitespace, '<' or '</', and tag name.
        {
            let regex = StringUtils.regexTagCache.get(tag);
            if (!regex) 
            {
                regex = new RegExp(`\\s?<\/?${tag.split("").map((char) => `(?:${char})?`).join("")}$`, "g");
                StringUtils.regexTagCache.set(tag, regex);
            }    
            return text.replace(regex, "")
        }
        return text || ""
    }
    
}