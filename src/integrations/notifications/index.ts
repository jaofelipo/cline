import { execa } from "execa"
import { platform } from "os"

async function showMacOSNotification(subtitle:string, message:string, title:string): Promise<void> 
{
	const script = `display notification "${message}" with title "${title}" subtitle "${subtitle}" sound name "Tink"`

	try {
		await execa("osascript", ["-e", script])
	} catch (error) {
		throw new Error(`Failed to show macOS notification: ${error}`)
	}
}

async function showWindowsNotification(subtitle:string, message:string): Promise<void> 
{
	const script = `
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

    $template = @"
    <toast>
        <visual>
            <binding template="ToastText02">
                <text id="1">${subtitle}</text>
                <text id="2">${message}</text>
            </binding>
        </visual>
    </toast>
"@

    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($template)
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Cline").Show($toast)
    `

	try {
		await execa("powershell", ["-Command", script])
	} catch (error) {
		throw new Error(`Failed to show Windows notification: ${error}`)
	}
}

async function showLinuxNotification(subtitle:string, message:string, title:string): Promise<void> 
{
	
	const fullMessage = subtitle ? `${subtitle}\n${message}` : message // Combine subtitle and message if subtitle exists

	try {
		await execa("notify-send", [title, fullMessage])
	} catch (error) {
		throw new Error(`Failed to show Linux notification: ${error}`)
	}
}

export async function showSystemNotification(subtitle:string, message:string, title:string="AI Coder"): Promise<void> 
{
	try {
		title = title.replace(/"/g, '\\"'),
		message = message.replace(/"/g, '\\"')
		subtitle = subtitle?.replace(/"/g, '\\"') || ""

		switch (platform()) 
		{
			case "darwin":
				await showMacOSNotification(subtitle, message, title)
				break
			case "win32":
				await showWindowsNotification(subtitle, message)
				break
			case "linux":
				await showLinuxNotification(subtitle, message, title)
				break
			default:
				throw new Error("Unsupported platform")
		}
	} 
	catch (error)
	{
		console.error("Could not show system notification", error)
	}
}
