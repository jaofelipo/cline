import { AssistantMessageContent, TextContent, ToolParamName, ToolUse } from "@/core/assistant-message"

export class ObjectUtils
{
    private static compareAssistantMessageContent(msg1:AssistantMessageContent, msg2: AssistantMessageContent): string | true
    {
        let result = ''
    
        // Verifica se os tipos são diferentes
        if (msg1.type !== msg2.type)
            return `[type:${msg1.type}:${msg2.type}]`
    
        // Comparação para TextContent
        if (msg1.type === 'text' && msg2.type === 'text') 
        {
            const text1 = msg1 as TextContent
            const text2 = msg2 as TextContent
    
            // Compara o campo content
            if (text1.content !== text2.content)
                result += `[content:${text1.content}:${text2.content}]`
            else
                result += text1.content
    
            // Compara o campo partial
            if (text1.partial !== text2.partial)
                result += `[partial:${text1.partial}:${text2.partial}]`
    
            return result || true
        }
    
        // Comparação para ToolUse
        if (msg1.type === 'tool_use' && msg2.type === 'tool_use') 
        {
            const tool1 = msg1 as ToolUse
            const tool2 = msg2 as ToolUse
    
            // Compara o campo name
            if (tool1.name !== tool2.name)
                result += `[name:${tool1.name}:${tool2.name}]`
            else
                result += tool1.name
    
            // Compara o campo partial
            if (tool1.partial !== tool2.partial)
                result += `[partial:${tool1.partial}:${tool2.partial}]`
    
            // Compara os params (chave-valor)
            const allParamKeys = new Set<ToolParamName>([
                ...Object.keys(tool1.params) as ToolParamName[],
                ...Object.keys(tool2.params) as ToolParamName[]
            ])
    
            for (const key of allParamKeys) {
                const param1 = tool1.params[key] ?? ''
                const param2 = tool2.params[key] ?? ''
                if (param1 !== param2)
                    result += `[${key}:${param1}:${param2}]`
            }
    
            return result || true
        }
    
        return result || true
    }
    
    static compareAssistantMessageArray(arr1: AssistantMessageContent[], arr2: AssistantMessageContent[]): string | true
    {
        const maxLength = Math.max(arr1.length, arr2.length)
        let result = ''
    
        for (let i = 0; i < maxLength; i++) 
        {
            const msg1 = arr1[i] || { type: 'text', content: '', partial: false }
            const msg2 = arr2[i] || { type: 'text', content: '', partial: false }
    
            const compareResponse = ObjectUtils.compareAssistantMessageContent(msg1, msg2)
            if (compareResponse !== true)
                result += `[index:${i}=>${compareResponse}]`
        }
    
        return result || true
    }

    static assistantMessageContentArrayToString(arr: AssistantMessageContent[]): string 
    {
        if (arr.length === 0)
            return '[]'
    
        let result = '['
    
        arr.forEach((msg, index) => {
            if (msg.type === 'text') {
                const text = msg as TextContent
                result += `{type:text,content:${JSON.stringify(text.content)},partial:${text.partial}}`
            } else {
                const tool = msg as ToolUse
                const paramsStr = JSON.stringify(tool.params)
                result += `{type:tool_use,name:${tool.name},params:${paramsStr},partial:${tool.partial}}`
            }
    
            if (index < arr.length - 1)
                result += ','
        })
    
        result += ']'
        return result
    }
}