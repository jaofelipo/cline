import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import styles from './TextWithLink.module.css'

export function TextWithLink(message:string): (string | JSX.Element)[] 
{
    const result: (string | JSX.Element)[] = [];
    const parts = message.split(/(<url>|<code>)/);
    for (let i = 0; i < parts.length; i++) 
	{
        const part = parts[i];
        if (part === '<url>') 
		{
            const [url, label] = (parts[++i] || "").split('<label>')
			if (url)
				result.push(<VSCodeLink href={url} className={styles.link} children={label || "__"}/>)
        } 
		else 
		{
            result.push((part === '<code>') ? <code>{parts[++i]}</code> : part);
        }
    }
    return result;
}