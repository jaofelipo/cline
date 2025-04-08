import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { vscode } from "@/utils/vscode";
import styles from "./AddLocalServerForm.module.css"; // Import CSS module
import { TextWithLink } from "@/components/basic/TextWithLink";
import { useExtensionState } from "@/context/ExtensionStateContext";

function AddLocalServerForm () 
{
	const { locale: { AddLocalServerForm: labels } } = useExtensionState()
	
	return (
		<div className={styles.formContainer}>
			<div className={styles.text}>
				{TextWithLink(labels.addLocalServer)}
			</div>

			<VSCodeButton appearance="primary"
				className={styles.button}
				onClick={() => vscode.postMessage({ type: "openMcpSettings" })} 
				children={labels.openMcpSettings}/>
		</div>
	)
}

export default AddLocalServerForm