import { Locale } from "./locale";

export const ptBr:Locale = {
    McpConfigurationView:{
        headerTitle: "Servidores MCP",
        doneButton: "Feito",
        tabs: {
            marketplace: "Marketplace",
            remoteServers: "Server remoto",
            installed: "Instalados"
        }
    },
    AddLocalServerForm: {
        addLocalServer: "Adicione um servidor MCP local configurando-o em <code>cline_mcp_settings.json</code>. Você precisará especificar o nome do servidor, " + 
            "comando, argumentos e quaisquer variáveis de ambiente necessárias na configuração JSON. Saiba mais " + 
            "<url>https://docs.cline.bot/mcp-servers/configuring-mcp-servers#editing-mcp-settings-files<label>aqui.<url>",
        openMcpSettings: "Abrir cline_mcp_settings.json"
    },
    AddRemoteServerForm:{
        instruction: "Adicione um servidor MCP remoto fornecendo um nome e sua URL de endpoint. Veja mais " + 
            "<url>https://docs.cline.bot/mcp-servers/connecting-to-a-remote-server<label>aqui<url>",
        serverNameIsRequired: "Nome do servidor é obrigatório",
        serverUrlIsRequired: "URL do servidor é obrigatória",
        invalidUrlFormat: "Formato de URL inválido",
        failedToAddServer: "Falha ao adicionar servidor",
        serverName: "Nome do Servidor",
        serverUrl: "URL do Servidor",
        adding: "Adicionando...",
        addServer: "Adicionar Servidor",
        connectingToServer: "Conectando ao servidor... Isso pode levar alguns segundos.",
        editConfiguration: "Editar Configuração",
    },
    McpMarketplaceViewLabels:{
        retry: "Tentar novamente",
        searchMcps: "Pesquisar MCPs...",
        clearSearch: "Limpar pesquisa",
        filter: "Filtro:",
        allCategories: "Todas as Categorias",
        sort: "Ordenar:",
        newest: "Mais recentes",
        githubStars: "Estrelas no GitHub",
        name: "Nome",
        noMatchingMcps: "Nenhum servidor MCP correspondente encontrado",
        noMcpsInMarketplace: "Nenhum servidor MCP encontrado no marketplace"
    },
    TaskHeader: {
      task: "Tarefa",
      cost: "US$",
      seeMore: "Ver mais",
      seeLess: "Ver menos",
      tokens: "Tokens:",
      cache: "Cache:",
      apiCost: "Custo da API:",
      contextWindow: "Janela de Contexto:",
    },
    TaskFeedbackButtons: {
      like: "Isso ajudou",
      dislike: "Isso não ajudou",
    },
    ServersToggleModal: {
      mcpServers: "Servidores MCP",
    },
    WelcomeView:{
        welcomeTitle: "Hi, I'm Cline",
        welcomeText: "I can do all kinds of tasks thanks to the latest breakthroughs in <url>https://www.anthropic.com/claude/sonnet<label>Claude 3.7 Sonnet's<url> " + 
                    "agentic coding capabilities and access to tools that let me create & edit files, explore complex projects, use the browser, and execute terminal " + 
                    "commands <i>(with your permission, of course)</i>. I can even use MCP to create new tools and extend my own capabilities.",
        descriptionText: "Sign up for an account to get started for free, or use an API key that provides access to models like Claude 3.7 Sonnet.",
        getStartedText: "Get Started for Free",
        useApiKeyButton: "Use your own API key",
        letsGoButton: "Let's go!"        
    },
    SettingView:{
        settingsTitle: "Configurações",
        doneButton: "Concluído",
        planMode: "Plan Mode",
        actMode: "Act Mode",  
        customInstructionsPlaceholder: 'ex. "Execute testes unitários no final", "Use TypeScript com async/await", "Fale em português"',
        customInstructionsLabel: "Instruções Personalizadas",
        customInstructionsDescription: "Essas instruções são adicionadas ao final do prompt do sistema enviado com cada solicitação.",
        separateModels: "Use different models for Plan and Act modes",
        separateModelsDescription: "Switching between Plan and Act mode will persist the API and model used in the previous mode. This may be " +
                                "helpful e.g. when using a strong reasoning model to architect a plan for a cheaper coding model to act on.",
        allowsTelemetry: "Allow anonymous error and usage reporting",
        advancedLabel: "Advanced Settings",
        allowsTelemetryDescription: "Help improve Cline by sending anonymous usage data and error reports. No code, prompts, or personal information are ever sent. See our " +
            "<url>https://docs.cline.bot/more-info/telemetry<label>telemetry overview<url> and <url>https://cline.bot/privacy<label>privacy policy<url> for more details" 
        ,
        debugSection: "Depuração",
        resetStateButton: "Redefinir Estado",
        resetStateDescription: "Isso redefinirá todo o estado global e o armazenamento secreto na extensão.",
        feedbackMessage: `Se você tiver alguma dúvida ou feedback, sinta-se à vontade para abrir uma requisição em <url>https://github.com/cline/cline<label>Github Project`
    },
}
