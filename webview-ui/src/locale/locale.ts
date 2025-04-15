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
    },
    TaskHeader: {
      task: string
      cost: string
      seeMore: string
      seeLess: string
      tokens: string
      cache: string
      apiCost: string
      contextWindow: string
    },
    TaskFeedbackButtons: {
      like: string
      dislike: string
    },
    ServersToggleModal:{
      mcpServers: string
    },
    WelcomeView:{
      welcomeTitle:string,
      welcomeText:string,
      descriptionText:string,
      getStartedText:string,
      useApiKeyButton: string,
      letsGoButton:string
    },
    SettingView:{
      settingsTitle:string
      doneButton:string
      customInstructionsPlaceholder:string
      customInstructionsLabel:string
      customInstructionsDescription:string
      separateModels:string,
      planActSeparateModels:string,
      allowsTelemetry: string,
      advancedLabel:string,
      helpImprove:string,
      debugSection:string
      resetStateButton:string
      resetStateDescription:string
      feedbackMessage:string
    },
}


