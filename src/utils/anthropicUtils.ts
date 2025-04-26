import Anthropic from "@anthropic-ai/sdk"
import { TextBlockParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages.mjs"


//Convert string or string[] into Anthropic.ImageBlockParam parameters
export function imageBlocksParam(images?: string | string[]): Anthropic.ImageBlockParam[] 
{
    const imageArray = (typeof images === "string") ? [images] : images ?? []

    // data:image/png;base64,base64string
    return imageArray.map(dataUrl => {
        const [rest, base64] = dataUrl.split(",")
        const mimeType = rest.split(":")[1].split(";")[0]
        return {type: "image", source: { type: "base64", media_type: mimeType, data: base64 }} as Anthropic.ImageBlockParam	
    })
}

export function newText(content:string):TextBlockParam
{
    return  {type: "text", text: content}
}

export function newToolResult(id:string, content:string):ToolResultBlockParam
{
    return {type: "tool_result", tool_use_id: id, content}
}
