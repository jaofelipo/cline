import { VSCodeButton, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { useEffect, useState, memo } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { validateApiConfiguration } from "@/utils/validate"
import { vscode } from "@/utils/vscode"
import ApiOptions from "@/components/settings/ApiOptions"
import ClineLogoWhite from "@/assets/ClineLogoWhite"
import { TextWithLink } from "../basic/TextWithLink"
import styles from "./WelcomeView.module.css"

const WelcomeView = memo(() => 
{
	const { locale: { WelcomeView: labels }, apiConfiguration } = useExtensionState()

	const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>(undefined)
	
	const [showApiOptions, setShowApiOptions] = useState(false)

	const disableLetsGoButton = apiErrorMessage != null

	const handleLogin = () => {
		vscode.postMessage({ type: "accountLoginClicked" })
	}

	const handleSubmit = () => {
		vscode.postMessage({ type: "apiConfiguration", apiConfiguration })
	}

	useEffect(() => {
		setApiErrorMessage(validateApiConfiguration(apiConfiguration))
	}, [apiConfiguration])

	return (
		<div className={styles.container}>
			<div className={styles.content}>
				<h2>{labels.welcomeTitle}</h2>

				<div className={styles.logoWrapper}>
					<ClineLogoWhite className={styles.logo} />
				</div>

				<p>{TextWithLink(labels.welcomeText)}</p>

				<p className={styles.descriptionText} children={labels.descriptionText}/>

				<VSCodeButton appearance="primary" 
					onClick={handleLogin} 
					className={styles.primaryButton}
					children={labels.getStartedText}/>

				{!showApiOptions && (
					<VSCodeButton
						appearance="secondary"
						onClick={() => setShowApiOptions(!showApiOptions)}
						className={styles.secondaryButton}
						children={labels.useApiKeyButton}/>
				)}

				<div className={styles.apiOptionsWrapper}>
					{showApiOptions && (
						<div>
							<ApiOptions showModelOptions={false} />
							<VSCodeButton 
								onClick={handleSubmit} 
								disabled={disableLetsGoButton} 
								className={styles.submitButton} 
								children={labels.letsGoButton}/>
						</div>
					)}
				</div>
			</div>
		</div>
	)
})

export default WelcomeView
