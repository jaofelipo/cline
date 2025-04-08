import { useRef, useState } from "react"
import { vscode } from "@/utils/vscode"
import { VSCodeButton, VSCodeLink, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { useEvent } from "react-use"
import { TextWithLink } from "@/components/basic/TextWithLink"
import { useExtensionState } from "@/context/ExtensionStateContext"
import styles from "./AddRemoteServerForm.module.css"

function AddRemoteServerForm ({ onServerAdded }: { onServerAdded: () => void }) 
{
	const { locale: { AddRemoteServerForm: labels } } = useExtensionState()
	
	const [serverName, setServerName] = useState("")
	const [serverUrl, setServerUrl] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState("")
	const [showConnectingMessage, setShowConnectingMessage] = useState(false)

	const submittedValues = useRef<{ name: string } | null>(null) // Store submitted values to check if the server was added

	useEvent("message", handleMessage.useCallback([isSubmitting, onServerAdded]))

	return (
		<div className={styles.container}>
			<div className={styles.description}>
				{TextWithLink(labels.instruction)}
			</div>

			<form onSubmit={handleSubmit}>
				<div className={styles.field}>
					<VSCodeTextField
						value={serverName}
						onChange={(e) => {
							setServerName((e.target as HTMLInputElement).value)
							setError("")
						}}
						disabled={isSubmitting}
						className={styles.input}
						placeholder="mcp-server"
						children={labels.serverName}/>
				</div>

				<div className={styles.field}>
					<VSCodeTextField
						value={serverUrl}
						onChange={(e) => {
							setServerUrl((e.target as HTMLInputElement).value)
							setError("")
						}}
						disabled={isSubmitting}
						placeholder="https://example.com/mcp-server"
						className={styles.input}
						children={labels.serverUrl}/>
				</div>

				{error && 
					<div className={styles.error} 
						children={error}/>}

				<div className={styles.buttonContainer}>
					<VSCodeButton type="submit"
						 disabled={isSubmitting} 
						 className={styles.input}
						 children={isSubmitting ? labels.adding : labels.addServer}/>

					{showConnectingMessage && (
						<div className={styles.connectingMessage} 
							children={labels.connectingToServer}/>
					)}
				</div>

				<VSCodeButton
					appearance="secondary"
					className={styles.secondaryButton}
					onClick={() => vscode.postMessage({ type: "openMcpSettings" })}
					children={labels.editConfiguration}/>
			</form>
		</div>
	)


	function handleSubmit (e: React.FormEvent<HTMLFormElement>) 
	{
		e.preventDefault()

		if (!serverName.trim()) {
			setError(labels.serverNameIsRequired)
			return
		}

		if (!serverUrl.trim()) {
			setError(labels.serverUrlIsRequired)
			return
		}

		try {
			new URL(serverUrl)
		} catch (err) {
			setError(labels.invalidUrlFormat)
			return
		}

		setError("")

		submittedValues.current = { name: serverName.trim() }

		setIsSubmitting(true)
		setShowConnectingMessage(true)
		vscode.postMessage({
			type: "addRemoteServer",
			serverName: serverName.trim(),
			serverUrl: serverUrl.trim(),
		})
	}

	function handleMessage(event:MessageEvent) 
	{
		const message = event.data

		if (message.type === "addRemoteServerResult" &&
			isSubmitting &&
			submittedValues.current &&
			message.addRemoteServerResult?.serverName === submittedValues.current.name) 
		{
			if (message.addRemoteServerResult.success)  // Handle success
			{
				setIsSubmitting(false)
				setServerName("")
				setServerUrl("")
				submittedValues.current = null
				onServerAdded()
				setShowConnectingMessage(false)
			} 
			else  // Handle error
			{
				setIsSubmitting(false)
				setError(message.addRemoteServerResult.error || labels.failedToAddServer)
				setShowConnectingMessage(false)
			}
		}
	}

}

export default AddRemoteServerForm