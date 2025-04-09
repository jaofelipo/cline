import React, { useEffect, useMemo, useRef, useState } from "react"
import styles from "./ContextMenu.module.css"
import { ContextMenuOptionType, ContextMenuQueryItem, getContextMenuOptions, SearchResult } from "@/utils/context-mentions"
import { cleanPathPrefix } from "@/components/common/CodeAccordian"

interface ContextMenuProps {
	onSelect: (type: ContextMenuOptionType, value?: string) => void
	searchQuery: string
	onMouseDown: () => void
	selectedIndex: number
	setSelectedIndex: (index: number) => void
	selectedType: ContextMenuOptionType | null
	queryItems: ContextMenuQueryItem[]
	dynamicSearchResults?: SearchResult[]
	isLoading?: boolean
}

const ContextMenu: React.FC<ContextMenuProps> = ({
	onSelect,
	searchQuery,
	onMouseDown,
	selectedIndex,
	setSelectedIndex,
	selectedType,
	queryItems,
	dynamicSearchResults = [],
	isLoading = false,
}) => {
	const menuRef = useRef<HTMLDivElement>(null)

	// State to show delayed loading indicator
	const [showDelayedLoading, setShowDelayedLoading] = useState(false)
	const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

	const filteredOptions = useMemo(() => {
		const options = getContextMenuOptions(searchQuery, selectedType, queryItems, dynamicSearchResults)
		return options
	}, [searchQuery, selectedType, queryItems, dynamicSearchResults])

	// Effect to handle delayed loading indicator (show "Searching..." after 500ms of searching)
	useEffect(() => {
		if (loadingTimeoutRef.current) {
			clearTimeout(loadingTimeoutRef.current)
			loadingTimeoutRef.current = null
		}

		if (isLoading && searchQuery) {
			setShowDelayedLoading(false)
			loadingTimeoutRef.current = setTimeout(() => {
				if (isLoading) {
					setShowDelayedLoading(true)
				}
			}, 500) // 500ms delay before showing "Searching..."
		} else {
			setShowDelayedLoading(false)
		}

		// Cleanup timeout on unmount or when dependencies change
		return () => {
			if (loadingTimeoutRef.current) {
				clearTimeout(loadingTimeoutRef.current)
				loadingTimeoutRef.current = null
			}
		}
	}, [isLoading, searchQuery])

	useEffect(() => {
		if (menuRef.current) {
			const selectedElement = menuRef.current.children[selectedIndex] as HTMLElement
			if (selectedElement) {
				const menuRect = menuRef.current.getBoundingClientRect()
				const selectedRect = selectedElement.getBoundingClientRect()

				if (selectedRect.bottom > menuRect.bottom) {
					menuRef.current.scrollTop += selectedRect.bottom - menuRect.bottom
				} else if (selectedRect.top < menuRect.top) {
					menuRef.current.scrollTop -= menuRect.top - selectedRect.top
				}
			}
		}
	}, [selectedIndex])

	const renderOptionContent = (option: ContextMenuQueryItem) => {
		switch (option.type) {
			case ContextMenuOptionType.Problems:
				return <span>Problems</span>
			case ContextMenuOptionType.Terminal:
				return <span>Terminal</span>
			case ContextMenuOptionType.URL:
				return <span>Paste URL to fetch contents</span>
			case ContextMenuOptionType.NoResults:
				return <span>No results found</span>
			case ContextMenuOptionType.Git:
				if (option.value) {
					return (
						<div className={styles.container}>
							<span className={styles.lineHeight}>{option.label}</span>
							<span
								className={styles.description}>
								{option.description}
							</span>
						</div>
					)
				} else {
					return <span>Git Commits</span>
				}
			case ContextMenuOptionType.File:
			case ContextMenuOptionType.Folder:
				if (option.value) {
					return (
						<>
							<span>/</span>
							{option.value?.startsWith("/.") && <span>.</span>}
							<span
								className={styles.filePath}>
								{cleanPathPrefix(option.value || "") + "\u200E"}
							</span>
						</>
					)
				} else {
					return <span>Add {option.type === ContextMenuOptionType.File ? "File" : "Folder"}</span>
				}
		}
	}

	const getIconForOption = (option: ContextMenuQueryItem): string => {
		switch (option.type) {
			case ContextMenuOptionType.File:
				return "file"
			case ContextMenuOptionType.Folder:
				return "folder"
			case ContextMenuOptionType.Problems:
				return "warning"
			case ContextMenuOptionType.Terminal:
				return "terminal"
			case ContextMenuOptionType.URL:
				return "link"
			case ContextMenuOptionType.Git:
				return "git-commit"
			case ContextMenuOptionType.NoResults:
				return "info"
			default:
				return "file"
		}
	}

	const isOptionSelectable = (option: ContextMenuQueryItem): boolean => {
		return option.type !== ContextMenuOptionType.NoResults && option.type !== ContextMenuOptionType.URL
	}

	return (
		<div
			className={styles.menuContainer}
			onMouseDown={onMouseDown}>
			<div
				ref={menuRef}
				className={styles.menu}>
				{/* Can't use virtuoso since it requires fixed height and menu height is dynamic based on # of items */}
				{showDelayedLoading && searchQuery && (
					<div
						className={styles.loading}>
						<i className={`codicon codicon-loading codicon-modifier-spin ${styles.loadingIcon}`} />
						<span>Searching...</span>
					</div>
				)}
				{filteredOptions.map((option, index) => (
					<div
						key={`${option.type}-${option.value || index}`}
						onClick={() => isOptionSelectable(option) && onSelect(option.type, option.value)}
						style={{
							padding: "8px 12px",
							cursor: isOptionSelectable(option) ? "pointer" : "default",
							color:
								index === selectedIndex && isOptionSelectable(option)
									? "var(--vscode-quickInputList-focusForeground)"
									: "",
							borderBottom: "1px solid var(--vscode-editorGroup-border)",
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							backgroundColor:
								index === selectedIndex && isOptionSelectable(option)
									? "var(--vscode-quickInputList-focusBackground)"
									: "",
						}}
						onMouseEnter={() => isOptionSelectable(option) && setSelectedIndex(index)}>
						<div
							className={styles.optionContent}>
							<i
								className={`codicon codicon-${getIconForOption(option)} ${styles.optionIcon}`}
							/>
							{renderOptionContent(option)}
						</div>
						{(option.type === ContextMenuOptionType.File ||
							option.type === ContextMenuOptionType.Folder ||
							option.type === ContextMenuOptionType.Git) &&
							!option.value && (
								<i
									className={`codicon codicon-chevron-right ${styles.chevron}`}
								/>
							)}
						{(option.type === ContextMenuOptionType.Problems ||
							option.type === ContextMenuOptionType.Terminal ||
							((option.type === ContextMenuOptionType.File ||
								option.type === ContextMenuOptionType.Folder ||
								option.type === ContextMenuOptionType.Git) &&
								option.value)) && (
							<i
								className={`codicon codicon-add ${styles.addIcon}`}
							/>
						)}
					</div>
				))}
			</div>
		</div>
	)
}

export default ContextMenu
