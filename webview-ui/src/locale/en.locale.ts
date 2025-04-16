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
    SettingView:{
        settingsTitle: "Settings",
        doneButton: "Done",
        planMode: "Plan Mode",
        actMode: "Act Mode",  
        customInstructionsPlaceholder: 'e.g. "Run unit tests at the end", "Use TypeScript with async/await", "Speak in Spanish"',
        customInstructionsLabel: "Custom Instructions",
        customInstructionsDescription: "These instructions are added to the end of the system prompt sent with every request.",
        separateModels: "Use different models for Plan and Act modes",
        separateModelsDescription: "Switching between Plan and Act mode will persist the API and model used in the previous mode. This may be " +
                                "helpful e.g. when using a strong reasoning model to architect a plan for a cheaper coding model to act on.",
        allowsTelemetry: "Allow anonymous error and usage reporting",
        advancedLabel: "Advanced Settings",
        allowsTelemetryDescription: "Help improve Cline by sending anonymous usage data and error reports. No code, prompts, or personal information are ever sent. See our " +
            "<url>https://docs.cline.bot/more-info/telemetry<label>telemetry overview<url> and <url>https://cline.bot/privacy<label>privacy policy<url> for more details" 
        ,
        debugSection: "Debug",
        resetStateButton: "Reset State",
        resetStateDescription: "This will reset all global state and secret storage in the extension.",
        feedbackMessage: "If you have any questions or feedback, feel free to open an issue at <url>https://github.com/cline/cline<label>Cline Github Project"
      },    
}
