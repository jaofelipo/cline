import fs from "fs/promises"
import getFolderSize from "get-folder-size"
import * as path from "path"

/**
 * Asynchronously creates all non-existing subdirectories for a given file path
 * and collects them in an array for later deletion.
 *
 * @param filePath - The full path to a file.
 * @returns A promise that resolves to an array of newly created directories.
 */
export async function createDirectoriesForFile(filePath: string): Promise<string[]> {
	const newDirectories: string[] = []
	const normalizedFilePath = path.normalize(filePath) // Normalize path for cross-platform compatibility
	const directoryPath = path.dirname(normalizedFilePath)

	let currentPath = directoryPath
	const dirsToCreate: string[] = []

	// Traverse up the directory tree and collect missing directories
	while (!(await fileExistsAtPath(currentPath))) {
		dirsToCreate.push(currentPath)
		currentPath = path.dirname(currentPath)
	}

	// Create directories from the topmost missing one down to the target directory
	for (let i = dirsToCreate.length - 1; i >= 0; i--) {
		await fs.mkdir(dirsToCreate[i])
		newDirectories.push(dirsToCreate[i])
	}

	return newDirectories
}

/**
 * Helper function to check if a path exists.
 *
 * @param path - The path to check.
 * @returns A promise that resolves to true if the path exists, false otherwise.
 */
export async function fileExistsAtPath(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath)
		return true
	} catch {
		return false
	}
}

/**
 * Checks if the path is a directory
 * @param filePath - The path to check.
 * @returns A promise that resolves to true if the path is a directory, false otherwise.
 */
export async function isDirectory(filePath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(filePath)
		return stats.isDirectory()
	} catch {
		return false
	}
}

/**
 * Gets the size of a file in kilobytes
 * @param filePath - Path to the file to check
 * @returns Promise<number> - Size of the file in KB, or 0 if file doesn't exist
 */
export async function getFileSizeInKB(filePath: string): Promise<number> {
	try {
		const stats = await fs.stat(filePath)
		const fileSizeInKB = stats.size / 1000 // Convert bytes to KB (decimal) - matches OS file size display
		return fileSizeInKB
	} catch {
		return 0
	}
}

// Common OS-generated files that would appear in an otherwise clean directory
const OS_GENERATED_FILES = [
	".DS_Store", // macOS Finder
	"Thumbs.db", // Windows Explorer thumbnails
	"desktop.ini", // Windows folder settings
]

/**
 * Recursively reads a directory and returns an array of absolute file paths.
 *
 * @param directoryPath - The path to the directory to read.
 * @param excludedPaths - Nested array of paths to ignore.
 * @returns A promise that resolves to an array of absolute file paths.
 * @throws Error if the directory cannot be read.
 */
export async function readDirectory (directoryPath: string, excludedPaths: string[][] = [])
{
	try {
		const filePaths = await fs
			.readdir(directoryPath, { withFileTypes: true, recursive: true })
			.then((entries) => entries.filter((entry) => !OS_GENERATED_FILES.includes(entry.name)))
			.then((entries) => entries.filter((entry) => entry.isFile()))
			.then((files) => files.map((file) => path.resolve(file.parentPath, file.name)))
			.then((filePaths) =>
				filePaths.filter((filePath) => {
					if (excludedPaths.length === 0) {
						return true
					}

					for (const excludedPathList of excludedPaths) {
						const pathToSearchFor = path.sep + excludedPathList.join(path.sep) + path.sep
						if (filePath.includes(pathToSearchFor)) {
							return false
						}
					}

					return true
				}),
			)

		return filePaths
	} catch {
		throw new Error(`Error reading directory at ${directoryPath}`)
	}
}

export async function ensureDirectory(...paths:string[]): Promise<string> 
{
    return (paths.length && paths[0].length) ? await fs.mkdir(path.join(...paths), { recursive: true }) || "" : "";
}

async function ensureFileExistsAtPaths(paths:string[], file:string): Promise<string | undefined>
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
        const filePath = await ensureFileExistsAtPaths(paths, filename)
        if (filePath) 
            await fs.writeFile(filePath, JSON.stringify(content));
    }
    catch (error)  // in the off chance this fails, we don't want to stop the task
    {
        console.error(`Failed to write file: ${filename}`, error);
    }
}

export async function getTaskDirSize(paths:string[])
{
    try 
    {
        const taskDir = await ensureDirectory(...paths)
        return await getFolderSize.loose(taskDir)// getFolderSize.loose silently ignores errors | returns # of bytes, size/1000/1000 = MB 
    }
    catch (error) {}
    return undefined
}


export async function loadFileAt(baseDir:string, filename:string): Promise<string | null>
{
    const filePath = path.resolve(baseDir, filename)
    return ( await fileExistsAtPath(filePath)) ? await fs.readFile(filePath, "utf8") : null
}

export async function loadFile(paths:string[], filename:string): Promise<string | null>
{
    const filePath = await ensureFileExistsAtPaths(paths, filename)
    return (filePath) ? await fs.readFile(filePath, "utf8") : null
}

export async function loadFileAndDelete(paths:string[], filename:string): Promise<string | null>
{
    const filePath = await ensureFileExistsAtPaths(paths, filename)
    if (filePath) 
    {
        const data = await fs.readFile(filePath, "utf8") 
        await fs.unlink(filePath)
        return data
    }
    return null
}

