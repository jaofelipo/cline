import Anthropic from "@anthropic-ai/sdk";

export class TaskModel
{
    public apiConversationHistory: Anthropic.MessageParam[]
    public consecutiveMistakeCount: number = 0

    constructor(conversation?: Anthropic.MessageParam[])
    {
        this.apiConversationHistory = (conversation) ? conversation : []
    }


    public addToApiConversationHistory(role:"user"|"assistant", content:any[]|string) 
    {
        if (typeof content === 'string')
            content = [{type: "text",  text: content}]
        this.apiConversationHistory.push({role, content}) 
    }  
}
