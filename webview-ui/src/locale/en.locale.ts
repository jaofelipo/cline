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
    }
}


