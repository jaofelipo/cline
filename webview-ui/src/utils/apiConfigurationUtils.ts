import { ApiConfiguration, ApiProvider, ModelInfo, openAiModelInfoSaneDefaults} from "@shared/api"
import { LLMDataProvider } from "@shared/LLMDataProvider"

export function normalizeApiConfiguration(apiConfiguration?: ApiConfiguration): {
	selectedProvider: ApiProvider
	selectedModelId: string
	selectedModelInfo: ModelInfo
} {
	const provider = apiConfiguration?.apiProvider || "anthropic"
	const modelId = apiConfiguration?.apiModelId

	const getProviderData = (models: readonly ModelInfo[], defaultId?:string) => {
		let selectedModelInfo = models?.find((llm) => llm.name === modelId) ?? models[0] 
		return {selectedProvider: provider, selectedModelId:selectedModelInfo.name!, selectedModelInfo}
	}
	
	switch (provider) {
		case "anthropic":
			return getProviderData(LLMDataProvider[provider].llmModels!)
		case "bedrock":
			return getProviderData(LLMDataProvider[provider].llmModels!)
		case "vertex":
			return getProviderData(LLMDataProvider[provider].llmModels!)
		case "gemini":
			return getProviderData(LLMDataProvider[provider].llmModels!)
		case "openai-native":
			return getProviderData(LLMDataProvider[provider].llmModels!)
		case "deepseek":
			return getProviderData(LLMDataProvider[provider].llmModels!)
		case "qwen":
			const qwenModels = apiConfiguration?.qwenApiLine === "china" ? LLMDataProvider[provider].llmModels : LLMDataProvider[provider].llmAlter
			return getProviderData(qwenModels!)
		case "doubao":
			return getProviderData(LLMDataProvider[provider].llmModels!)
		case "mistral":
			return getProviderData(LLMDataProvider[provider].llmModels!)
		case "asksage":
			return getProviderData(LLMDataProvider[provider].llmModels!)
		case "openrouter":
		case "cline":
			return getProviderData(LLMDataProvider.openrouter.llmModels!)
		case "requesty":
			return getProviderData(LLMDataProvider.requesty.llmModels!)
		case "openai":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.openAiModelId || "",
				selectedModelInfo: apiConfiguration?.openAiModelInfo || openAiModelInfoSaneDefaults,
			}
		case "ollama":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.ollamaModelId || "",
				selectedModelInfo: openAiModelInfoSaneDefaults,
			}
		case "lmstudio":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.lmStudioModelId || "",
				selectedModelInfo: openAiModelInfoSaneDefaults,
			}
		case "vscode-lm":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.vsCodeLmModelSelector
					? `${apiConfiguration.vsCodeLmModelSelector.vendor}/${apiConfiguration.vsCodeLmModelSelector.family}`
					: "",
				selectedModelInfo: {
					...openAiModelInfoSaneDefaults,
					supportsImages: false, // VSCode LM API currently doesn't support images
				},
			}
		case "litellm":
			return getProviderData(LLMDataProvider[provider].llmModels!)
		case "xai":
			return getProviderData(LLMDataProvider[provider].llmModels!)
		case "sambanova":
			return getProviderData(LLMDataProvider[provider].llmModels!)
		default:
			return getProviderData(LLMDataProvider.anthropic.llmModels!)
	}
}