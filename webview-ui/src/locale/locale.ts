export interface Locale {
    McpConfigurationView:{
        headerTitle: string
        doneButton: string
        tabs: {
          marketplace: string
          remoteServers: string
          installed: string
        }
    },
    AddLocalServerForm: {
      addLocalServer: string;
      openMcpSettings: string;
    },
    AddRemoteServerForm:{
      instruction: string
      serverNameIsRequired: string
      serverUrlIsRequired: string
      invalidUrlFormat: string
      failedToAddServer: string
      serverName: string
      serverUrl: string
      adding: string
      addServer: string
      connectingToServer: string
      editConfiguration: string
    },
    McpMarketplaceViewLabels: {
      retry: string
      searchMcps: string
      clearSearch:string
      filter: string
      allCategories: string
      sort: string
      newest: string
      githubStars: string
      name: string
      noMatchingMcps: string
      noMcpsInMarketplace: string
    }    
}

