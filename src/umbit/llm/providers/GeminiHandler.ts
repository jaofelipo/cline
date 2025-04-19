import { Anthropic } from "@anthropic-ai/sdk"
import { Content, GoogleGenerativeAI, InlineDataPart, Part, TextPart } from "@google/generative-ai"
import {  ModelInfo } from "../../../shared/api"
import { LLMDataProvider } from "../../../shared/LLMDataProvider"
import { ApiStream } from "../../../api/transform/stream"

export class GeminiHandler
{
	private modelId: string
	private client: GoogleGenerativeAI

	constructor(apiModelId: string, geminiApiKey: string)
	{
		this.modelId = apiModelId
		this.client = new GoogleGenerativeAI(geminiApiKey)
	}

	async *createMessage(systemInstruction: string, messages: Anthropic.Messages.MessageParam[]): ApiStream
	{
		const gemini = this.client.getGenerativeModel({
			model: this.model.name!, 
			systemInstruction})

		const result = await gemini.generateContentStream({
			contents: messages.map(convertAnthropicMessageToGemini),
			generationConfig: {	temperature: 0}})

		for await (const chunk of result.stream) 
		{
			yield {type: 'text', text: chunk.text()}
		}

		const response = await result.response
		yield {
			type: "usage",
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
		}
	}

	getModel(): { id: string; info: ModelInfo } 
	{
		const model = LLMDataProvider.gemini.llmModels!.find(m => m.name === this.modelId)
		const selectedModel = model || LLMDataProvider.gemini.llmModels![0]
		return { id: selectedModel.name!, info: selectedModel }
	}	

	get model () 
	{
		return this.getModel().info
	}
}

export function convertAnthropicMessageToGemini(message: Anthropic.Messages.MessageParam): Content 
{
	return {
		role: message.role === "assistant" ? "model" : "user",
		parts: convertAnthropicContentToGemini(message.content),
	}

	function convertAnthropicContentToGemini(content: string | Anthropic.ContentBlockParam[]): Part[] 
	{
		if (typeof content === "string") 
			return [{ text: content } as TextPart]
		
		return content.flatMap((block) => {
			switch (block.type) {
				case "text":
					return { text: block.text } as TextPart
				case "image":
					if (block.source.type !== "base64") 
						throw new Error("Unsupported image source type")
					
					return {
						inlineData: {
							data: block.source.data,
							mimeType: block.source.media_type,
						},
					} as InlineDataPart
				default:
					throw new Error(`Unsupported content block type: ${block.type}`)
			}
		})
	}
}