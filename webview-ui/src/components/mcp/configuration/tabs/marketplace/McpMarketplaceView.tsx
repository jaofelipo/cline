// McpMarketplaceView.tsx
import { useEffect, useMemo, useState } from "react"
import {
	VSCodeButton,
	VSCodeProgressRing,
	VSCodeRadioGroup,
	VSCodeRadio,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react"
import { McpMarketplaceItem } from "@shared/mcp"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { vscode } from "@/utils/vscode"
import McpMarketplaceCard from "./McpMarketplaceCard"
import McpSubmitCard from "./McpSubmitCard"
import styles from "./McpMarketplaceView.module.css"

function McpMarketplaceView()
{
	const { mcpServers, locale: { McpMarketplaceViewLabels: labels } } = useExtensionState()
	const [items, setItems] = useState<McpMarketplaceItem[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [searchQuery, setSearchQuery] = useState("")
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
	const [sortBy, setSortBy] = useState<"newest" | "stars" | "name">("newest")

	const categories = useMemo(() => {
		const uniqueCategories = new Set(items.map((item) => item.category))
		return Array.from(uniqueCategories).sort()
	}, [items])

	const filteredItems = useMemo(() => {
		return items
			.filter((item) => {
				const matchesSearch =
					searchQuery === "" ||
					item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
					item.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
				const matchesCategory = !selectedCategory || item.category === selectedCategory
				return matchesSearch && matchesCategory
			})
			.sort((a, b) => {
				switch (sortBy) {
					case "stars":
						return b.githubStars - a.githubStars
					case "name":
						return a.name.localeCompare(b.name)
					case "newest":
						return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
					default:
						return 0
				}
			})
	}, [items, searchQuery, selectedCategory, sortBy])

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "mcpMarketplaceCatalog") {
				if (message.error) {
					setError(message.error)
				} else {
					setItems(message.mcpMarketplaceCatalog?.items || [])
					setError(null)
				}
				setIsLoading(false)
				setIsRefreshing(false)
			} else if (message.type === "mcpDownloadDetails") {
				if (message.error) {
					setError(message.error)
				}
			}
		}

		window.addEventListener("message", handleMessage)

		fetchMarketplace()

		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [])

	function fetchMarketplace (forceRefresh: boolean = false) 
	{
		if (forceRefresh)
			setIsRefreshing(true)
		else
			setIsLoading(true)
		setError(null)
		vscode.postMessage({ type: "fetchMcpMarketplace", bool: forceRefresh })
	}

	if (isLoading || isRefreshing) 
	{
		return (
			<div className={styles.loadingContainer} 
				children={<VSCodeProgressRing />}/>	)
	}

	if (error) 
	{
		return (
			<div className={styles.errorContainer}>
				<div className={styles.errorText}>{error}</div>
				<VSCodeButton appearance="secondary" 
					onClick={() => fetchMarketplace(true)}>
					<span className={`codicon codicon-refresh ${styles.errorButton}`} 
						children={labels.retry}/>
				</VSCodeButton>
			</div>
		)
	}

	return (
		<div className={styles.mainContainer}>
			<div className={styles.filterSection}>
				{/* Search row */}
				<VSCodeTextField
					className={styles.searchInput}
					placeholder={labels.searchMcps}
					value={searchQuery}
					onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}>
					<div
						slot="start"
						className={`codicon codicon-search ${styles.searchIcon}`}/>
					{searchQuery && (
						<div
							className={`codicon codicon-close ${styles.clearSearchIcon}`}
							aria-label={labels.clearSearch}
							onClick={() => setSearchQuery("")}
							slot="end"/>
					)}
				</VSCodeTextField>

				{/* Filter row */}
				<div className={styles.filterRow}>
					<span className={styles.filterLabel} 
						children={labels.filter}/>
					<div className={styles.dropdownContainer}>
						<VSCodeDropdown
							className={styles.dropdown}
							value={selectedCategory || ""}
							onChange={(e) => setSelectedCategory((e.target as HTMLSelectElement).value || null)}>
							<VSCodeOption value="" 
								children={labels.allCategories}/>
							
							{categories.map((category) => (
								<VSCodeOption key={category} value={category}>
									{category}
								</VSCodeOption>
							))}
						</VSCodeDropdown>
					</div>
				</div>

				{/* Sort row */}
				<div className={styles.sortRow}>
					<span className={styles.sortLabel} 
						children={labels.sort}/>
					<VSCodeRadioGroup
						className={styles.radioGroup}
						value={sortBy}
						onChange={(e) => setSortBy((e.target as HTMLInputElement).value as typeof sortBy)}>
						<VSCodeRadio value="newest" children={labels.newest}/>
						<VSCodeRadio value="stars" children={labels.githubStars}/>
						<VSCodeRadio value="name" children={labels.name}/>
					</VSCodeRadioGroup>
				</div>
			</div>

			<div className={styles.itemsContainer}>
				{filteredItems.length === 0 &&
					<div className={styles.noItems}>
						{searchQuery || selectedCategory ? labels.noMatchingMcps : labels.noMcpsInMarketplace}
					</div>
				}
				{filteredItems.length !== 0 &&
					filteredItems.map((item) => <McpMarketplaceCard key={item.mcpId} item={item} installedServers={mcpServers} />)
				}
				<McpSubmitCard />
			</div>
		</div>
	)
}

export default McpMarketplaceView