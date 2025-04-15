import { Locale } from "./locale";

export const en:Locale = {
    McpConfigurationView:{
        headerTitle: "MCP Servers",
        doneButton: "Done",
        tabs: {
            marketplace: "Marketplace",
            remoteServers: "Remote Servers",
            installed: "Installed"
        }
    },
    AddLocalServerForm: {
        addLocalServer: "Add a local MCP server by configuring it in <code>cline_mcp_settings.json</code>. You'll need to specify the server name, " + 
            "command, arguments, and any required environment variables in the JSON configuration. Learn more " + 
            "<url>https://docs.cline.bot/mcp-servers/configuring-mcp-servers#editing-mcp-settings-files<label>here.<url>",
        openMcpSettings: "Open cline_mcp_settings.json"
    },
    AddRemoteServerForm:{
        instruction: "Add a remote MCP server by providing a name and its URL endpoint. Learn more " + 
            "<url>https://docs.cline.bot/mcp-servers/connecting-to-a-remote-server<label>here<url>",
        serverNameIsRequired: "Server name is required",
        serverUrlIsRequired: "Server URL is required",
        invalidUrlFormat: "Invalid URL format",
        failedToAddServer: "Failed to add server",
        serverName: "Server Name",
        serverUrl: "Server URL",
        adding: "Adding...",
        addServer: "Add Server",
        connectingToServer: "Connecting to server... This may take a few seconds.",
        editConfiguration: "Edit Configuration",
    },
    McpMarketplaceViewLabels:{
        retry: "Retry",
        searchMcps: "Search MCPs...",
        clearSearch: "Clear search",
        filter: "Filter:",
        allCategories: "All Categories",
        sort: "Sort:",
        newest: "Newest",
        githubStars: "GitHub Stars",
        name: "Name",
        noMatchingMcps: "No matching MCP servers found",
        noMcpsInMarketplace: "No MCP servers found in the marketplace",
    },
    TaskHeader: {
      task: "Task",
      cost: "$",
      seeMore: "See more",
      seeLess: "See less",
      tokens: "Tokens:",
      cache: "Cache:",
      apiCost: "API Cost:",
      contextWindow: "Context Window:",
    },
    TaskFeedbackButtons: {
      like: "This was helpful",
      dislike: "This wasn't helpful",
    },
    ServersToggleModal: {
      mcpServers: "MCP Servers",
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
