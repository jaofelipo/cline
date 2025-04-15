import { VSCodeButton, VSCodeCheckbox, VSCodeLink, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react"
import { memo, useCallback, useEffect, useState } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { validateApiConfiguration, validateModelId } from "@/utils/validate"
import { vscode } from "@/utils/vscode"
import SettingsButton from "@/components/common/SettingsButton"
import ApiOptions from "./ApiOptions"
import { TabButton } from "../mcp/configuration/McpConfigurationView"
import { useEvent } from "react-use"
import { ExtensionMessage } from "@shared/ExtensionMessage"
import BrowserSettingsSection from "./BrowserSettingsSection"
import { TextWithLink } from "../basic/TextWithLink"
import styles from './SettingsView.module.css'

const { IS_DEV } = process.env

const SettingsView = ({ onDone }: {onDone: () => void}) => {

	const {
		apiConfiguration,
		version,
		customInstructions,
		setCustomInstructions,
		openRouterModels,
		telemetrySetting,
		setTelemetrySetting,
		chatSettings,
		locale: { SettingView: labels },
		planActSeparateModelsSetting,
		setPlanActSeparateModelsSetting,
	} = useExtensionState()


	

	const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>(undefined)
	const [modelIdErrorMessage, setModelIdErrorMessage] = useState<string | undefined>(undefined)
	const [pendingTabChange, setPendingTabChange] = useState<"plan" | "act" | null>(null)

	const handleSubmit = (withoutDone: boolean = false) => {
		const apiValidationResult = validateApiConfiguration(apiConfiguration)
		const modelIdValidationResult = validateModelId(apiConfiguration, openRouterModels)

		// setApiErrorMessage(apiValidationResult)
		// setModelIdErrorMessage(modelIdValidationResult)

		let apiConfigurationToSubmit = apiConfiguration
		if (apiValidationResult || modelIdValidationResult) 
			apiConfigurationToSubmit = undefined

		vscode.postMessage({
			type: "updateSettings",
			planActSeparateModelsSetting,
			customInstructionsSetting: customInstructions,
			telemetrySetting,
			apiConfiguration: apiConfigurationToSubmit,
		})

		if (!withoutDone) 
			onDone()
		
	}

	useEffect(() => {
		setApiErrorMessage(undefined)
		setModelIdErrorMessage(undefined)
	}, [apiConfiguration])

	const handleMessage = useCallback(
		(event: MessageEvent) => {
			const message: ExtensionMessage = event.data
			switch (message.type) {
				case "didUpdateSettings":
					if (pendingTabChange) {
						vscode.postMessage({
							type: "togglePlanActMode",
							chatSettings: {
								mode: pendingTabChange,
							},
						})
						setPendingTabChange(null)
					}
					break
				case "scrollToSettings":
					setTimeout(() => {
						const elementId = message.text
						if (elementId) {
							const element = document.getElementById(elementId)
							if (element) {
								element.scrollIntoView({ behavior: "smooth" })

								element.style.transition = "background-color 0.5s ease"
								element.style.backgroundColor = "var(--vscode-textPreformat-background)"

								setTimeout(() => element.style.backgroundColor = "transparent", 1200)
							}
						}
					}, 300)
					break
			}
		},
		[pendingTabChange],
	)

	useEvent("message", handleMessage)

	const handleResetState = () => {
		vscode.postMessage({ type: "resetState" })
	}

	const handleTabChange = (tab: "plan" | "act") => {
		if (tab !== chatSettings.mode) 
		{
			setPendingTabChange(tab)
			handleSubmit(true)
		}
	}

	return (
		<div className={styles.settingsViewContainer}>
			<div className={styles.header}>
				<h3 className={styles.title}
					children={labels.settingsTitle}/>
				<VSCodeButton onClick={() => handleSubmit(false)}
					children={labels.doneButton}/>
			</div>
			<div className={styles.contentScrollable}>
				{/* Tabs container */}
				{planActSeparateModelsSetting ? (
					<div className={styles.planActTabsContainer}>
						<div className={styles.tabButtonsContainer}>
							<TabButton isActive={chatSettings.mode === "plan"} onClick={() => handleTabChange("plan")}>
								Plan Mode
							</TabButton>
							<TabButton isActive={chatSettings.mode === "act"} onClick={() => handleTabChange("act")}>
								Act Mode
							</TabButton>
						</div>

						{/* Content container */}
						<div className={styles.apiOptionsContentContainer}>
							<ApiOptions
								key={chatSettings.mode}
								showModelOptions={true}
								apiErrorMessage={apiErrorMessage}
								modelIdErrorMessage={modelIdErrorMessage}
							/>
						</div>
					</div>
				) : (
					<ApiOptions
						key={"single"}
						showModelOptions={true}
						apiErrorMessage={apiErrorMessage}
						modelIdErrorMessage={modelIdErrorMessage}
					/>
				)}

				<div className={styles.settingSection}>
					<VSCodeTextArea
						value={customInstructions ?? ""}
						className={styles.customInstructionsTextArea}
						resize="vertical"
						rows={4}
						placeholder={labels.customInstructionsPlaceholder}
						onInput={(e: any) => setCustomInstructions(e.target?.value ?? "")}>

						<span className={styles.customInstructionsLabel}
							children={labels.customInstructionsLabel}/>
					</VSCodeTextArea>
					<p className={styles.descriptionText}
						children={labels.customInstructionsDescription}/>
				</div>

				<div className={styles.settingSection}>
					<VSCodeCheckbox
						className={styles.checkbox}
						checked={planActSeparateModelsSetting}
						onChange={(e: any) => {
							const checked = e.target.checked === true
							setPlanActSeparateModelsSetting(checked)
						}}
						children={labels.separateModels}/>
					<p className={styles.descriptionText}
						children={labels.planActSeparateModels}/>
				</div>

				<div className={styles.settingSection}>
					<VSCodeCheckbox
						className={styles.checkbox}
						checked={telemetrySetting === "enabled"}
						onChange={(e: any) => {
							const checked = e.target.checked === true
							setTelemetrySetting(checked ? "enabled" : "disabled")
						}}
						children={labels.allowsTelemetry}/>
					<p className={styles.descriptionText}
						children={labels.helpImprove}/>
				</div>

				{/* Browser Settings Section */}
				<BrowserSettingsSection />

				<div className={styles.advancedSettingsButtonContainer}>
					<SettingsButton
						onClick={() => vscode.postMessage({ type: "openExtensionSettings" })}
						className={styles.advancedSettingsButton}>
						<i className="codicon codicon-settings-gear" />
						{labels.advancedLabel}
					</SettingsButton>
				</div>

				{IS_DEV && (
					<>
						<div className={styles.debugSectionLabel} children={labels.debugSection}/>
						<VSCodeButton onClick={handleResetState}
							className={styles.resetStateButton}
							children={labels.resetStateButton}/>
						<p className={styles.descriptionText}
						 	children={labels.resetStateDescription}/>
					</>
				)}

				<div className={styles.footer}>
					<p className={styles.feedbackMessage}
						children={TextWithLink(labels.feedbackMessage)}/>
					<p className={styles.versionText}>v{version}</p>
				</div>
			</div>
		</div>
	)
}

export default memo(SettingsView)
