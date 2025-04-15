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
}
