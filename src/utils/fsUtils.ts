import path from "path"
import fs from "fs/promises"
import { fileExistsAtPath } from "./fs";

async function ensureDirectory(...paths:string[]): Promise<string> 
{
    return (paths.length && paths[0].length) ? await fs.mkdir(path.join(...paths), { recursive: true }) || "" : "";
}

async function fileExistsAtPaths(paths:string[], file:string): Promise<string | undefined>
{
	try 
	{
        if (paths.length && paths[0].length)
        {
            const baseDir = await fs.mkdir(path.join(...paths), { recursive: true })
            if (baseDir)
            {
                const filePath = path.join(baseDir, file)
                await fs.access(filePath)
                return filePath
            }
        }
	} catch {}
    return undefined
}

export async function writeFile(paths:string[], filename:string, content:any): Promise<void> 
{
    try 
    {
        const filePath = await fileExistsAtPaths(paths, filename);
        if (filePath) 
            await fs.writeFile(filePath, JSON.stringify(content));
    }
    catch (error)  // in the off chance this fails, we don't want to stop the task
    {
        console.error(`Failed to write file: ${filename}`, error);
    }
}

export async function loadFileAt(baseDir:string, filename:string): Promise<string | null>
{
    const filePath = path.resolve(baseDir, filename)
    return ( await fileExistsAtPath(filePath)) ? await fs.readFile(filePath, "utf8") : null
}

export async function loadFile(paths:string[], filename:string): Promise<string | null>
{
    const filePath = await fileExistsAtPaths(paths, filename)
    return (filePath) ? await fs.readFile(filePath, "utf8") : null
}

export async function loadFileAndDelete(paths:string[], filename:string): Promise<string | null>
{
    const filePath = await fileExistsAtPaths(paths, filename)
    if (filePath) 
    {
        const data = await fs.readFile(filePath, "utf8") 
        await fs.unlink(filePath)
        return data
    }
    return null
}
