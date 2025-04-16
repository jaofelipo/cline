import { ApiDetails, ApiProvider, ModelInfo } from "./api";

export const LLMDataProvider:Record<ApiProvider, ApiDetails> = 
{
	"bedrock": {	name: "AWS Bedrock", 
					id:'bedrock',
					// https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html
					llmModels: [newModel("anthropic.claude-3-7-sonnet-20250219-v1:0", 8192, 200_000, true, true, true, 3.0, 15.0, 3.75, 0.3),
								newModel("amazon.nova-pro-v1:0", 5000, 300_000, true, false, false, 0.8, 3.2),
								newModel("amazon.nova-lite-v1:0", 5000, 300_000, true, false, false, 0.06, 0.24),
								newModel("amazon.nova-micro-v1:0", 5000, 128_000, false, false, false, 0.035, 0.14),
								newModel("anthropic.claude-3-5-sonnet-20241022-v2:0", 8192, 200_000, true, true, true, 3.0, 15.0, 3.75, 0.3),
								newModel("anthropic.claude-3-5-haiku-20241022-v1:0", 8192, 200_000, false, false, true, 1.0, 5.0, 1.0, 0.08),
								newModel("anthropic.claude-3-5-sonnet-20240620-v1:0", 8192, 200_000, true, false, false, 3.0, 15.0),
								newModel("anthropic.claude-3-opus-20240229-v1:0", 4096, 200_000, true, false, false, 15.0, 75.0),
								newModel("anthropic.claude-3-sonnet-20240229-v1:0", 4096, 200_000, true, false, false, 3.0, 15.0),
								newModel("anthropic.claude-3-haiku-20240307-v1:0", 4096, 200_000, true, false, false, 0.25, 1.25),								
								newModel("deepseek.r1-v1:0", 8_000, 64_000, false, false, false, 1.35, 5.4),
							] as const,
					requiredFields:["awsRegion"],
					regions:["us-east-1", "us-east-2", "us-west-2", "ap-south-1", "ap-northeast-1", "ap-northeast-2", "ap-southeast-1", "ap-southeast-2",
							  "ca-central-1", "eu-central-1", "eu-central-2", "eu-west-1", "eu-west-2", "eu-west-3", "sa-east-1", "us-gov-east-1","us-gov-west-1"],
					apiKeyName:'apiKey',
					message:`Authenticate by either providing the keys above or use the default AWS credential providers,i.e. ~/.aws/credentials or environment variables. 
							These credentials are only used locally to make API requests from this extension.`},
	"openrouter":{	name: "OpenRouter", 
					id:'openrouter',
					llmModels: [newModel("anthropic/claude-3.7-sonnet", 8192, 200_000, true, true, true, 3.0, 15.0, 3.75, 0.3,
						"Claude 3.7 Sonnet is an advanced large language model with improved reasoning, coding, and problem-solving capabilities. It introduces a hybrid " + 
						"reasoning approach, allowing users to choose between rapid responses and extended, step-by-step processing for complex tasks. The model demonstrates " + 
						"notable improvements in coding, particularly in front-end development and full-stack updates, and excels in agentic workflows, where it can autonomously " + 
						"navigate multi-step processes. \n\nClaude 3.7 Sonnet maintains performance parity with its predecessor in standard mode while offering an extended reasoning " + 
						"mode for enhanced accuracy in math, coding, and instruction-following tasks.\n\nRead more at the [blog post here](https://www.anthropic.com/news/claude-3-7-sonnet)"
					)] as const,
					apiKeyURL:"https://openrouter.ai/auth?callback_url=vscode://saoudrizwan.claude-dev/openrouter", 
					requiredFields:["openRouterApiKey"],
					apiKeyName:'openRouterApiKey' },
	"anthropic": {	name: "Anthropic", 
					id:'anthropic',
					//https://docs.anthropic.com/en/docs/about-claude/models
					llmModels: [
						newModel("claude-3-7-sonnet-20250219", 8192, 200_000, true, true, true, 3.0, 15.0, 3.75, 0.3),
						newModel("claude-3-5-sonnet-20241022", 8192, 200_000, true, true, true, 3.0, 15.0, 3.75, 0.3),
						newModel("claude-3-5-haiku-20241022", 8192, 200_000, false, false, true, 0.8, 4.0, 1.0, 0.08),
						newModel("claude-3-opus-20240229", 4096, 200_000, true, false, true, 15.0, 75.0, 18.75, 1.5),
						newModel("claude-3-haiku-20240307", 4096, 200_000, true, false, true, 0.25, 1.25, 0.3, 0.03)] as const,
					requiredFields:["apiKey"],
					apiKeyName:'apiKey'},
	"ollama": {		name: "Ollama", 
					id:'ollama',
					apiKeyName:'apiKey',
					requiredFields:["ollamaModelId"],
					message:`Ollama allows you to run models locally on your computer. For instructions on how to get
							started, see their<url>https://github.com/ollama/ollama/blob/main/README.md<label>quickstart guide.`},
	"lmstudio": {	name: "LM Studio", 
					id:'lmstudio',
					apiKeyName:'apiKey',
					requiredFields:["lmStudioModelId"],
					message:`LM Studio allows you to run models locally on your computer. For instructions on how to get started, see their,
							<url>https://lmstudio.ai/docs<label>quickstart guide. <url>
							You will also need to start LM Studio's
							<url>https://lmstudio.ai/docs/basics/server<label>local server <url>
							feature to use it with this extension.`},
	// SambaNova
	// https://docs.sambanova.ai/cloud/docs/get-started/supported-models
	"sambanova": {	name: "SambaNova",
					id: "sambanova",
					llmModels: [
						newModel("Meta-Llama-3.3-70B-Instruct", 4096, 128_000, false, false, false, 0, 0),
						newModel("DeepSeek-R1-Distill-Llama-70B", 4096, 32_000, false, false, false, 0, 0),
						newModel("Llama-3.1-Swallow-70B-Instruct-v0.3", 4096, 16_000, false, false, false, 0, 0),
						newModel("Llama-3.1-Swallow-8B-Instruct-v0.3", 4096, 16_000, false, false, false, 0, 0),
						newModel("Meta-Llama-3.1-405B-Instruct", 4096, 16_000, false, false, false, 0, 0),
						newModel("Meta-Llama-3.1-8B-Instruct", 4096, 16_000, false, false, false, 0, 0),
						newModel("Meta-Llama-3.2-1B-Instruct", 4096, 16_000, false, false, false, 0, 0),
						newModel("Qwen2.5-72B-Instruct", 4096, 16_000, false, false, false, 0, 0),
						newModel("Qwen2.5-Coder-32B-Instruct", 4096, 16_000, false, false, false, 0, 0),
						newModel("QwQ-32B-Preview", 4096, 16_000, false, false, false, 0, 0),
						newModel("QwQ-32B", 4096, 16_000, false, false, false, 0.5, 1.0),
						newModel("DeepSeek-V3-0324", 4096, 8192, true, false, false, 1.5, 1.5)] as const,
					requiredFields:["openAiNativeApiKey"],
					apiKeyName:'openAiNativeApiKey' },
	"requesty":	{	name: "Requesty",
					id: "requesty",
					llmModels: [
						newModel("anthropic/claude-3-7-sonnet-latest", 8192, 200_000, true, false, true, 3.0, 15.0, 3.75, 0.3,
							"Anthropic's most intelligent model. Highest level of intelligence and capability.")] as const,
					requiredFields:["openAiNativeApiKey"],
					apiKeyName:'openAiNativeApiKey'},
	// X AI
	// https://docs.x.ai/docs/api-reference
	"xai": {		name: "xAI",
					id: "xai",
					llmModels: [
						newModel("grok-3-beta", 8192, 131072, false, false, false, 3.0, 15.0),
						newModel("grok-3-fast-beta", 8192, 131072, false, false, false, 5.0, 25.0),
						newModel("grok-3-mini-beta", 8192, 131072, false, false, false, 0.3, 0.5),
						newModel("grok-3-mini-fast-beta", 8192, 131072, false, false, false, 0.6, 4.0),
						newModel("grok-2-latest", 8192, 131072, false, false, false, 2.0, 10.0),
						newModel("grok-2", 8192, 131072, false, false, false, 2.0, 10.0),
						newModel("grok-2-1212", 8192, 131072, false, false, false, 2.0, 10.0),
						newModel("grok-2-vision-latest", 8192, 32768, true, false, false, 2.0, 10.0),
						newModel("grok-2-vision", 8192, 32768, true, false, false, 2.0, 10.0),
						newModel("grok-2-vision-1212", 8192, 32768, true, false, false, 2.0, 10.0),
						newModel("grok-vision-beta", 8192, 8192, true, false, false, 5.0, 15.0),
						newModel("grok-beta", 8192, 131072, false, false, false, 5.0, 15.0)] as const,
					requiredFields:["openAiNativeApiKey"],
					apiKeyName:'openAiNativeApiKey'},
	// AskSage Models
	// https://docs.asksage.ai/
	"asksage": {	name: "AskSage",
					id: "asksage",
					llmModels: [
						newModel("claude-35-sonnet", 8192, 200_000, false, false, false, 0, 0),
						newModel("gpt-4o", 4096, 128_000, false, false, false, 0, 0),
						newModel("gpt-4o-gov", 4096, 128_000, false, false, false, 0, 0),
						newModel("aws-bedrock-claude-35-sonnet-gov", 8192, 200_000, false, false, false, 0, 0),
						newModel("claude-37-sonnet", 8192, 200_000, false, false, false, 0, 0)] as const,
					apiKeyURL: "https://api.asksage.ai/server", 						
					requiredFields:["openAiNativeApiKey"],
					apiKeyName:'openAiNativeApiKey'},
	// LiteLLM
	// https://docs.litellm.ai/docs/
	'litellm': {	name: "LiteLLM",
					id: "litellm",
					llmModels: [newModel("gpt-3.5-turbo", -1, 128_000, true, false, true, 0, 0)] as const,
					requiredFields:["openAiNativeApiKey"],
					apiKeyName:'openAiNativeApiKey'},
	// Mistral
	// https://docs.mistral.ai/getting-started/models/models_overview/
	'mistral': 	{	name: "Mistral",
					id: "mistral",
					llmModels: [
						newModel("codestral-2501", 256_000, 256_000, false, false, false, 0.3, 0.9),
						newModel("mistral-large-2411", 256_000, 256_000, false, false, false, 0.3, 0.9),
						newModel("pixtral-large-2411", 131_000, 131_000, true, false, false, 2.0, 6.0),
						newModel("ministral-3b-2410", 131_000, 131_000, false, false, false, 0.04, 0.04),
						newModel("ministral-8b-2410", 131_000, 131_000, false, false, false, 0.1, 0.1),
						newModel("mistral-small-latest", 131_000, 131_000, true, false, false, 0.1, 0.3),
						newModel("mistral-small-2501", 32_000, 32_000, false, false, false, 0.1, 0.3),
						newModel("pixtral-12b-2409", 131_000, 131_000, true, false, false, 0.15, 0.15),
						newModel("open-mistral-nemo-2407", 131_000, 131_000, false, false, false, 0.15, 0.15),
						newModel("open-codestral-mamba", 256_000, 256_000, false, false, false, 0.15, 0.15)] as const,
					requiredFields:["openAiNativeApiKey"],
					apiKeyName:'openAiNativeApiKey'},
	// Doubao
	// https://www.volcengine.com/docs/82379/1298459
	// https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement
	'doubao':	{	name: "Bytedance Doubao",
					id: "doubao",
					llmModels: [
						newModel("doubao-1-5-pro-256k-250115", 12_288, 256_000, false, false, false, 0.7, 1.3),
						newModel("doubao-1-5-pro-32k-250115", 12_288, 256_000, false, false, false, 0.11, 0.3),
						newModel("deepseek-v3-250324", 12_288, 128_000, false, false, false, 0.55, 2.19),
						newModel("deepseek-r1-250120", 32_768, 64_000, false, false, false, 0.27, 1.09)] as const,
					requiredFields:["openAiNativeApiKey"],
					apiKeyName:'openAiNativeApiKey'},
	// Qwen
	// https://bailian.console.aliyun.com/
	'qwen':		{ 	name: "Alibaba Qwen International",
					id: "qwen",
					llmModels: [
						newModel("qwen-coder-plus-latest", 129_024, 131_072, false, false, false, 3.5, 7, 3.5, 7),
						newModel("qwen2.5-coder-32b-instruct", 8_192, 131_072, false, false, false, 0.002, 0.006, 0.002, 0.006),
						newModel("qwen2.5-coder-14b-instruct", 8_192, 131_072, false, false, false, 0.002, 0.006, 0.002, 0.006),
						newModel("qwen2.5-coder-7b-instruct", 8_192, 131_072, false, false, false, 0.001, 0.002, 0.001, 0.002),
						newModel("qwen2.5-coder-3b-instruct", 8_192, 32_768, false),
						newModel("qwen2.5-coder-1.5b-instruct", 8_192, 32_768, false),
						newModel("qwen2.5-coder-0.5b-instruct", 8_192, 32_768, false),
						newModel("qwen-plus-latest", 129_024, 131_072, false, false, false, 0.8, 2.0, 0.8, 2.0),
						newModel("qwen-turbo-latest", 1_000_000, 1_000_000, false, false, false, 0.8, 2.0, 0.8, 2.0),
						newModel("qwen-max-latest", 30_720, 32_768, false, false, false, 2.4, 9.6, 2.4, 9.6),
						newModel("qwen-coder-plus", 129_024, 131_072, false, false, false, 3.5, 7.0, 3.5, 7.0),
						newModel("qwen-plus", 129_024, 131_072, false, false, false, 0.8, 2.0, 0.8, 2.0),
						newModel("qwen-turbo", 1_000_000, 1_000_000, false, false, false, 0.3, 0.6, 0.3, 0.6),
						newModel("qwen-max", 30_720, 32_768, false, false, false, 2.4, 9.6, 2.4, 9.6),
						newModel("deepseek-v3", 8_000, 64_000, false, false, true, 0, 0.28, 0.14, 0.014),
						newModel("deepseek-r1", 8_000, 64_000, false, false, true, 0, 2.19, 0.55, 0.14),
						newModel("qwen-vl-max", 30_720, 32_768, true, false, false, 3.0, 9.0, 3.0, 9.0),
						newModel("qwen-vl-max-latest", 129_024, 131_072, true, false, false, 3.0, 9.0, 3.0, 9.0),
						newModel("qwen-vl-plus", 6_000, 8_000, true, false, false, 1.5, 4.5, 1.5, 4.5),
						newModel("qwen-vl-plus-latest", 129_024, 131_072, true, false, false, 1.5, 4.5, 1.5, 4.5)] as const,
					llmAlter: [
						newModel("qwen-coder-plus-latest", 129_024, 131_072, false, false, false, 3.5, 7, 3.5, 7),
						newModel("qwen2.5-coder-32b-instruct", 8_192, 131_072, false, false, false, 0.002, 0.006, 0.002, 0.006),
						newModel("qwen2.5-coder-14b-instruct", 8_192, 131_072, false, false, false, 0.002, 0.006, 0.002, 0.006),
						newModel("qwen2.5-coder-7b-instruct", 8_192, 131_072, false, false, false, 0.001, 0.002, 0.001, 0.002),
						newModel("qwen2.5-coder-3b-instruct", 8_192, 32_768, false),
						newModel("qwen2.5-coder-1.5b-instruct", 8_192, 32_768, false),
						newModel("qwen2.5-coder-0.5b-instruct", 8_192, 32_768, false),
						newModel("qwen-plus-latest", 129_024, 131_072, false, false, false, 0.8, 2.0, 0.8, 2.0),
						newModel("qwen-turbo-latest", 1_000_000, 1_000_000, false, false, false, 0.8, 2.0, 0.8, 2.0),
						newModel("qwen-max-latest", 30_720, 32_768, false, false, false, 2.4, 9.6, 2.4, 9.6),
						newModel("qwq-plus-latest", 8_192, 131_071, false),
						newModel("qwq-plus", 8_192, 131_071, false),
						newModel("qwen-coder-plus", 129_024, 131_072, false, false, false, 3.5, 7.0, 3.5, 7.0),
						newModel("qwen-plus", 129_024, 131_072, false, false, false, 0.8, 2.0, 0.8, 2.0),
						newModel("qwen-turbo", 1_000_000, 1_000_000, false, false, false, 0.3, 0.6, 0.3, 0.6),
						newModel("qwen-max", 30_720, 32_768, false, false, false, 2.4, 9.6, 2.4, 9.6),
						newModel("deepseek-v3", 8_000, 64_000, false, false, true, 0, 0.28, 0.14, 0.014),
						newModel("deepseek-r1", 8_000, 64_000, false, false, true, 0, 2.19, 0.55, 0.14),
						newModel("qwen-vl-max", 30_720, 32_768, true, false, false, 3.0, 9.0, 3.0, 9.0),
						newModel("qwen-vl-max-latest", 129_024, 131_072, true, false, false, 3.0, 9.0, 3.0, 9.0),
						newModel("qwen-vl-plus", 6_000, 8_000, true, false, false, 1.5, 4.5, 1.5, 4.5),
						newModel("qwen-vl-plus-latest", 129_024, 131_072, true, false, false, 1.5, 4.5, 1.5, 4.5)] as const,
					requiredFields:["openAiNativeApiKey"],
					apiKeyName:'openAiNativeApiKey'},
	// Gemini
	// https://ai.google.dev/gemini-api/docs/models/gemini
	"gemini":	{	name: "Gemini", 
					id:'gemini',
					// https://ai.google.dev/gemini-api/docs/models/gemini
					llmModels: [
						newModel("gemini-2.0-flash-001", 8192, 1_048_576, true),
						newModel("gemini-2.5-pro-exp-03-25", 65536, 1_048_576, true),
						newModel("gemini-2.5-pro-preview-03-25", 65536, 1_048_576, true, false, false, 2.5, 15.0),
						newModel("gemini-2.0-flash-lite-preview-02-05", 8192, 1_048_576, true),
						newModel("gemini-2.0-pro-exp-02-05", 8192, 2_097_152, true),
						newModel("gemini-2.0-flash-thinking-exp-01-21", 65_536, 1_048_576, true),
						newModel("gemini-2.0-flash-thinking-exp-1219", 8192, 32_767, true),
						newModel("gemini-2.0-flash-exp", 8192, 1_048_576, true),
						newModel("gemini-exp-1206", 8192, 2_097_152, true),
						newModel("gemini-1.5-flash-002", 8192, 1_048_576, true),
						newModel("gemini-1.5-flash-exp-0827", 8192, 1_048_576, true),
						newModel("gemini-1.5-flash-8b-exp-0827", 8192, 1_048_576, true),
						newModel("gemini-1.5-pro-002", 8192, 2_097_152, true),
						newModel("gemini-1.5-pro-exp-0827", 8192, 2_097_152, true)] as const,
					apiKeyURL:"https://ai.google.dev/", 
					requiredFields:["geminiApiKey"],
					apiKeyName:'geminiApiKey' },
	// Vertex AI
	// https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude
	// https://cloud.google.com/vertex-ai/generative-ai/pricing#partner-models
	"vertex": {		name: "GCP Vertex AI", 
					id:'vertex',
					// https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude
					llmModels: [
						newModel("claude-3-7-sonnet@20250219", 8192, 200_000, true, true, true, 3.0, 15.0),
						newModel("claude-3-5-sonnet-v2@20241022", 8192, 200_000, true, true, true, 3.0, 15.0, 3.75, 0.3),
						newModel("claude-3-5-sonnet@20240620", 8192, 200_000, true, false, true, 3.0, 15.0, 3.75, 0.3),
						newModel("claude-3-5-haiku@20241022", 8192, 200_000, false, false, true, 1.0, 5.0, 1.25, 0.1),
						newModel("claude-3-opus@20240229", 4096, 200_000, true, false, true, 15.0, 75.0, 18.75, 1.5),
						newModel("claude-3-haiku@20240307", 4096, 200_000, true, false, true, 0.25, 1.25, 0.3, 0.03),
						newModel("gemini-2.0-flash-001", 8192, 1_048_576, true, false, false, 0.1, 0.4),
						newModel("gemini-2.0-flash-thinking-exp-1219", 8192, 32_767, true),
						newModel("gemini-2.0-flash-exp", 8192, 1_048_576, true),
						newModel("gemini-2.5-pro-exp-03-25", 65536, 1_048_576, true),
						newModel("gemini-2.5-pro-exp-03-25", 65536, 1_048_576, true),
						newModel("gemini-2.5-pro-preview-03-25", 65536, 1_048_576, true, false, false, 2.5, 15.0),
						newModel("gemini-2.0-flash-thinking-exp-01-21", 65_536, 1_048_576, true),
						newModel("gemini-exp-1206", 8192, 2_097_152, true),
						newModel("gemini-1.5-flash-002", 8192, 1_048_576, true),
						newModel("gemini-1.5-flash-exp-0827", 8192, 1_048_576, true),
						newModel("gemini-1.5-flash-8b-exp-0827", 8192, 1_048_576, true),
						newModel("gemini-1.5-pro-002", 8192, 2_097_152, true),
						newModel("gemini-1.5-pro-exp-0827", 8192, 2_097_152, true)] as const,
					regions:["us-east5", "us-central1", "europe-west1", "europe-west4", "asia-southeast1"],
					apiKeyName:'apiKey',
					requiredFields:["vertexProjectId","vertexRegion"],
					message: `To use Google Cloud Vertex AI, you need to
							<url>https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude#before_you_begin
							<label>1) create a Google Cloud account › enable the Vertex AI API › enable the desired Claude models,
							<url>https://cloud.google.com/docs/authentication/provide-credentials-adc#google-idp
							<label>2) install the Google Cloud CLI › configure Application Default Credentials.`},
	// OpenAI Native
	// https://openai.com/api/pricing/
	"openai-native": {	name: "OpenAI", 
						id:'openai-native',
						//https://openai.com/api/pricing/
						llmModels: [
							newModel("gpt-4.1", 32_768, 1_047_576, true, false, true, 2, 8, 0, 0.5),
							newModel("gpt-4.1-mini", 32_768, 1_047_576, true, false, true, 0.4, 1.6, 0, 0.1),
							newModel("gpt-4.1-nano", 32_768, 1_047_576, true, false, true, 0.1, 0.4, 0, 0.025),
							newModel("o3-mini", 100_000, 200_000, false, false, true, 1.1, 4.4, 0, 0.55),
							newModel("o1", 100_000, 200_000, true, false, false, 15, 60, 0, 7.5),
							newModel("o1-preview", 32_768, 128_000, true, false, true, 15, 60, 0, 7.5),
							newModel("o1-mini", 65_536, 128_000, true, false, true, 1.1, 4.4, 0, 0.55),
							newModel("gpt-4o", 4_096, 128_000, true, false, true, 2.5, 10, 0, 1.25),
							newModel("gpt-4o-mini", 16_384, 128_000, true, false, true, 0.15, 0.6, 0, 0.075),
							newModel("chatgpt-4o-latest", 16_384, 128_000, true, false, false, 5, 15),
							newModel("gpt-4.5-preview", 16_384, 128_000, true, false, true, 55, 150)] as const,
						apiKeyURL:"https://platform.openai.com/api-keys", 
						requiredFields:["openAiNativeApiKey"],
						apiKeyName:'openAiNativeApiKey' },
	"together": {		name: "Together", 
						id:'together',
						apiKeyName:'apiKey',
						requiredFields:["openAiBaseUrl","openAiApiKey","openAiModelId"]},
	"vscode-lm": {		name: "VS Code LM API", 
						id:'vscode-lm',
						apiKeyName:'apiKey',
						requiredFields:["openAiBaseUrl","openAiApiKey","openAiModelId"]},
	"cline": {		name: "Cline", 
						id:'cline',
						apiKeyName:'apiKey',
						requiredFields:["openAiBaseUrl","openAiApiKey","openAiModelId"]},
	// Azure OpenAI
	// https://learn.microsoft.com/en-us/azure/ai-services/openai/api-version-deprecation
	// https://learn.microsoft.com/en-us/azure/ai-services/openai/reference#api-specs
	"openai": {		name: "OpenAI Compatible", 
					id:'openai',
					apiKeyName:'apiKey',
					requiredFields:["openAiBaseUrl","openAiApiKey","openAiModelId"]},
	// DeepSeek
	// https://api-docs.deepseek.com/quick_start/pricing
	"deepseek": {	name: "DeepSeek", 
					id:'deepseek',
					//https://api-docs.deepseek.com/quick_start/pricing
					llmModels: [ 
						newModel("deepseek-chat", 8_000, 64_000, false, false, true, 0, 1.1, 0.27, 0.07),
						newModel("deepseek-reasoner", 8_000, 64_000, false, false, true, 0, 2.19, 0.55, 0.14)] as const,
					requiredFields:["deepSeekApiKey"],
					apiKeyURL:"https://www.deepseek.com/", 
					apiKeyName:'deepSeekApiKey' },

	}


function newModel(name:string, maxTokens:number, contextWindow:number, supportsImages:boolean, 
	supportsComputerUse:boolean=false, supportsPromptCache:boolean=false, inputPrice?:number, 
	outputPrice?:number, cacheWritesPrice?:number, cacheReadsPrice?:number, description?:string): ModelInfo 
{
return {name, maxTokens, contextWindow, supportsImages, supportsComputerUse, supportsPromptCache, inputPrice, outputPrice, cacheWritesPrice, cacheReadsPrice, description};
}

export interface LLMProvider 
{
	name: string
	models: ModelInfo[]
}
