import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useEffect, useState } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { vscode } from "@/utils/vscode"
import AddRemoteServerForm from "./tabs/add-server/AddRemoteServerForm"
import McpMarketplaceView from "./tabs/marketplace/McpMarketplaceView"
import InstalledServersView from "./tabs/installed/InstalledServersView"
import styles from "./McpConfigurationView.module.css"

type TabViews = "marketplace" | "addRemote" | "installed"

function McpConfigurationView ({ onDone }: {onDone: () => void}) 
{
	const { mcpMarketplaceEnabled,  locale: { McpConfigurationView:lables } } = useExtensionState()
	const [activeTab, setActiveTab] = useState(mcpMarketplaceEnabled ? "marketplace" : "installed")

	useEffect(() => {
		if (!mcpMarketplaceEnabled && activeTab === "marketplace") 
			setActiveTab("installed") // If marketplace is disabled and we're on marketplace tab, switch to installed
	}, [mcpMarketplaceEnabled, activeTab])

	useEffect(() => {
		if (mcpMarketplaceEnabled) {
			vscode.postMessage({ type: "silentlyRefreshMcpMarketplace" })
			vscode.postMessage({ type: "fetchLatestMcpServersFromHub" })
		}
	}, [mcpMarketplaceEnabled])

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<h3 className={styles.headerTitle} children={lables.headerTitle}/>
				<VSCodeButton onClick={onDone} children={lables.doneButton}/>
			</div>

			<div className={styles.content}>
				{/* Tabs container */}
				<div className={styles.tabsContainer}>
					{mcpMarketplaceEnabled && (
						<TabButton 	isActive={activeTab === "marketplace"} 
							onClick={() => handleTabChange("marketplace")} 
							children={lables.tabs.marketplace}/>
					)}
					<TabButton isActive={activeTab === "addRemote"} 
						onClick={() => handleTabChange("addRemote")}
						children={lables.tabs.remoteServers}/>
					<TabButton 	isActive={activeTab === "installed"} 
						onClick={() => handleTabChange("installed")}
						children={lables.tabs.installed}/>
				</div>

				{/* Content container */}
				<div className={styles.tabContent}>
					{mcpMarketplaceEnabled && activeTab === "marketplace" && 
						<McpMarketplaceView />}
					{activeTab === "addRemote" && 
						<AddRemoteServerForm 
							onServerAdded={() => handleTabChange("installed")} />}
					{activeTab === "installed" && 
						<InstalledServersView />}
				</div>
			</div>
		</div>
	)


	function handleTabChange(tab:TabViews) 
	{
		setActiveTab(tab)
	}

}

export function TabButton({children, isActive, onClick}:{children: React.ReactNode; isActive: boolean; onClick: () => void}) 
{ 
	return (<button
	  			className={`${styles.tabButton} ${isActive ? styles.tabButtonActive : ""}`}
	  			onClick={onClick}
	  			children={children}/>)
}

export default McpConfigurationView
