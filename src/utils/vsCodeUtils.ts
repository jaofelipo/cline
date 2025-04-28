import * as vscode from 'vscode';
import { arePathsEqual } from './path';

export async function listenEvent<T>(event:vscode.Event<T>,  predicate?:(data: T) => boolean, timeout?:number): Promise<T> 
{
    return new Promise<T>((resolve, reject) => 
    {
        const listener = event(data => {
            if (!predicate || predicate(data)) 
            {
                listener.dispose()
                resolve(data)
            }
        })

        if (timeout) 
        {
            setTimeout(() => {
                listener.dispose()
                reject(undefined)
            }, timeout)
        }
    })
}
function getTabs(predicate?: (tab: vscode.Tab) => boolean) 
{
    return vscode.window.tabGroups.all
        .flatMap((g) => g.tabs)
        .filter((t) => !predicate || predicate(t))
}

export function getInputDiffTabs(scheme?:string)
{
    return (vscode.window.tabGroups.all
        .flatMap((g) => g.tabs)
        .filter((t) => t.input instanceof vscode.TabInputTextDiff && (!scheme || t.input?.original?.scheme === scheme)))
}

export function findInputDiffTabs(fsPath:string, scheme?:string)
{
    return (vscode.window.tabGroups.all
        .flatMap((g) => g.tabs)
        .find((t) => 
            t.input instanceof vscode.TabInputTextDiff 
            && (!scheme || t.input?.original?.scheme === scheme)
            && arePathsEqual(t.input.modified.fsPath, fsPath)))
}