import { AssistantMessageContent, ToolParamName, toolParamNamesSet, ToolUse, ToolUseName, toolUseNamesSet } from "."

//@Tielo
export class AssistantMessageParser 
{
    private content: AssistantMessageContent[] = []    
    private lastCheckpoint: number = 0
    private _message: string = ""
    public get message()    
    {
        return this._message
    }
    
	parseChunk(chunk:string):AssistantMessageContent[] 
	{
		let currentTool: ToolUse | undefined

        this._message += chunk

		let lastPosition = this.lastCheckpoint

		if (this.content.at(-1)?.partial) 
            this.content.pop()
		
        for (let i = lastPosition; i < this._message.length; i++) 
		{
            const char = this._message[i]
            if (char === '<') //check if it's open a tool definition or a param if is in a tool
			{
                const endTag = this._message.indexOf(">", i)
                
				if (endTag === -1) 
					break // Tag incompleta, espera próximo chunk

                const tagName = this._message.slice(i + 1, endTag)
                if (currentTool) 
				{
					if (tagName === `/${currentTool.name}`) //closing current tool
					{
                        currentTool.partial = false // end of a tool use
                        currentTool = undefined
                        this.lastCheckpoint = i = endTag
                    }
					else if (toolParamNamesSet.has(tagName as ToolParamName)) //check for params
					{
						let index = (currentTool.name === "write_to_file" && tagName === "content") ? this._message.lastIndexOf(`</content>`) : this._message.indexOf(`</${tagName}>`, i)

						index = (index > 0) ? index : this._message.length
						currentTool.params[tagName as ToolParamName] = this._message.substring(endTag + 1, index).trim()
						i = index + tagName.length + 2 //include the chars </
                    }
                    lastPosition = i + 1
                }
				else if (toolUseNamesSet.has(tagName)) //check if it's open a tool definition
				{
					this.parseText(this._message.substring(lastPosition, i).trim(), this.content, false)
					currentTool = {type: "tool_use", name: tagName as ToolUseName, params:{}, partial: true}
					this.content.push(currentTool)
                    this.lastCheckpoint = i
					i = endTag
                    lastPosition = i + 1
				}
            }
        }

		if (lastPosition < this._message.length && !currentTool) // Remaining text as partial
		{
            this.parseText(this._message.substring(lastPosition).trim(), this.content, true)
            lastPosition = this._message.length
        }

        return this.content;
    }

    private parseText(text:string, content: AssistantMessageContent[], partial:boolean)
	{
        if (text) 
            content.push({ type: "text", content: text, partial })
    }

    reset()
	{
        this.content = []
        this.lastCheckpoint = 0
        this._message = ""
    }
}