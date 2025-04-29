
import path from "path"
import { ToolUse } from "../core/assistant-message";
import { en } from "./en";
import { ptBr } from "./pt";
import fs from 'fs/promises';
import osName from "os-name";
import defaultShell from "default-shell";
import os from "os"
import { string } from "zod";

const USER_EDITS = (userEdits: string) =>
    `The user made the following updates to your content:\n\n${userEdits}\n\n`;
  
const UPDATED_CONTENT = (relPath: string, finalContent?: string) =>
    `The updated content, which includes both your original modifications and the user's edits, has been successfully saved to ${relPath}. Here is the full, updated content of the file:\n\n<final_file_content path="${relPath}">\n${finalContent}\n</final_file_content>\n\n`;
  
const PLEASE_NOTE = 
    `Please note:\n` +
    `1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
    `2. Proceed with the task using this updated file content as the new baseline.\n` +
    `3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.\n` +
    `4. If you need to make further changes to this file, use this final_file_content as the new reference for your SEARCH/REPLACE operations, as it is now the current state of the file (including the user's edits and any auto-formatting done by the system).`;
  
//const NEW_PROBLEMS_MESSAGE = (newProblemsMessage: string) => newProblemsMessage;  

export const UPDATE_SUMMARY_MESSAGE = (userEdits: string, relPath: string, finalContent?: string, newProblemsMessage?: string) => 
    USER_EDITS(userEdits) +
    UPDATED_CONTENT(relPath.toPosix(), finalContent) +
    PLEASE_NOTE + 
    newProblemsMessage;

export const GENERATE_FILE_SAVE_CONFIRMATION_MESSAGE = (relPath: string, finalContent?: string,  newProblemsMessage?: string) => 
        `The content was successfully saved to ${relPath.toPosix()}.\n\n` +
        `Here is the full, updated content of the file:\n\n` +
        `<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
        `Please note: If you need to make further changes to this file, use this final_file_content as the new reference for your SEARCH/REPLACE operations, as it is now the current state of the file (including any auto-formatting done by the system).\n\n` +
        `${newProblemsMessage}`;









export const ERROR_DIFF = (error:Error) => toolError(`Error writing file: ${(error as Error)?.message}`)
export const FILE_EDIT_CREATE_MSG = (relPath:string, finalContent?:string, newProblemsMessage?:string, userEdits?:string) => 
    (userEdits) ? UPDATE_SUMMARY_MESSAGE(userEdits, relPath, finalContent, newProblemsMessage) : GENERATE_FILE_SAVE_CONFIRMATION_MESSAGE(relPath, finalContent, newProblemsMessage)



const toolError = (error:string) => `The tool execution failed with the following error:\n<error>\n${error}\n</error>`


export interface Labels {
    date:{
        day: string,
        days: string,
        hour: string,
        hours: string,
        minute: string,
        minutes: string,
        justNow: string,
        ago: string 
    },
    cline:{
        toolUseInstructionsReminder:string
        shellIntegrationWarning: string
        userFeedbackTitle: string
        clineTrouble:string
        claudeLimit:string
        nonClaudeLimit:string
        maxRequestsReached: (maxRequests:number, ask?:boolean) => string;
        unexpectedApi:string
        assistantFailure:string
        instanceAborted:string
        toolUsedErrorInterruption:string
        interruptedByApiErrorOrUser: (isError:boolean) => string
        toolError: (error:string) => string
        clineIgnoreError: (path: string) => string,
        tooManyMistakes: (feedback?: string) => string
        noToolsUsed: () =>  string
        interruptTask:string
        wasRecent:string
        taskResumption: (time:string, cwd:string, wasRecent:boolean, text?:string) => string
    },
    assistantMessage:
    {
        duplicateFileReadNotice: string
        contextTruncationNotice: string
        missingParamError:(toolName: string, paramName: string, relPath?: string) => string
        missingToolParameterError: (paramName: string) => string
        invalidToolnameArgumentError: (tool_name?:string) => string
        invalidMcpToolArgumentError: (serverName?:string, toolName?:string) => string
        defaultErrorFormatted: (action:string, error:Error) => string
        defaultError: (action:string, error:Error) => string
        resultWithFeedback: (response?:String) => string,
        toolDenied:string
        fileEditByUser: (relPath: string, userEdits: string, autoFormatted?: string, content?: string, newProblems?: string) => string
        fileEdit: (relPath: string, autoFormatted?: string, content?: string, newProblems?: string) => string
        reponseWithFeedback: (feedback?: string) => string
        browserClosed:string
        browserAction: (consoleLogs?:string) => string
        formattedAnswer: (text?:string) => string
        clineIgnoreInstructions: (content: string) => string
        clineRulesGlobalDirectoryInstructions: (globalClineRulesFilePath: string, content: string) => string
        clineRulesLocalDirectoryInstructions: (cwd: string, content: string) => string
        clineRulesLocalFileInstructions: (cwd: string, content: string) => string
        toolAlreadyUsed: (block:ToolUse) => string
        toolRejected: (block:ToolUse) => string
        partilToolRejected: (block:ToolUse) => string        
        toolDescription: (block:ToolUse) => string
        userFeedback: (output:string, feedbackText?:string) => string
        commandRunning: (output:string, full?:boolean) => string
        commandExecuted: (output: string) => string
        newTask:string
        newTaskWithFeedback: (text:string) => string
        condenseFeedback: (text:string) => string
        condense: string
        diffError: (error:Error, relPath: string, originalContent: string | undefined) => string
        switchToActMode: (text?:string) => string

        feedback: (text?:string) => string
        messages:{
            execute_command: (data:string[]) => string,
            read_file: (data:string[]) => string,
            write_to_file: (data:string[]) => string,
            replace_in_file: (data:string[]) => string,
            search_files: (data:string[]) => string,
            list_files: (data:string[]) => string,
            list_code_definition_names: (data:string[]) => string,
            browser_action: (data:string[]) => string,
            use_mcp_tool: (data:string[]) => string,
            access_mcp_resource: (data:string[]) => string,
            ask_followup_question: (data:string[]) => string,
            attempt_completion: (data:string[]) => string,
        }
        titles:{
            execute_command: string,
            search_files: string,
            list_files: string,
            list_code_definition_names: string,
            read_file: string,
            write_to_file: string,
            replace_in_file: string,
            browser_action: string,
            use_mcp_tool: string,
            access_mcp_resource: string,
            ask_followup_question: string,
            attempt_completion: string,
            load_mcp_documentation: string,
            new_task: string,
            plan_mode_respond: string,
            condense: string
        }
    }
    system:
    {
        BROWSER_ACTION:string,
        BROWSER_ACTION_TOOL:string,
        USE_THE_BROWSER:string,
        USE_BOWSER:string,
        HOW_USE_BROWSER:string,
        CUSTOM_INSTRUCTIONS: (customInstructions:string) => string,
        systemPrompt:string,
    }
}





const messages: Record<string, Labels> = {
    en,
    'pt-br': ptBr,
};

type Locale = keyof typeof messages; // Tipos suportados: 'en' | 'pt-br'

export function getTranslation (locale:Locale='en'):Labels { return messages[locale]}


async function loadTextFile(currentLang:string, category: string, key: string): Promise<string> 
{
    const filePath = `${currentLang}/${category}_${key}.txt`;
    const cacheKey = `${currentLang}_${category}_${key}`;
    try {
      const fullPath = path.join(__dirname, 'i18n', filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      return content.trim();
    } catch (error) {}
      
    return '';
  }





export const toolExemple1:string = `
    <execute_command>
    <command>npm run dev</command>
    <requires_approval>false</requires_approval>
    </execute_command>`

export const toolExemple2:string = `
    <use_mcp_tool>
    <server_name>weather-server</server_name>
    <tool_name>get_forecast</tool_name>
    <arguments>
    {
    "city": "San Francisco",
    "days": 5
    }
    </arguments>
    </use_mcp_tool>`

export const toolExemple3:string = `
    <access_mcp_resource>
    <server_name>weather-server</server_name>
    <uri>weather://san-francisco/current</uri>
    </access_mcp_resource>`

export const toolExemple4:string = `
    <write_to_file>
    <path>src/frontend-config.json</path>
    <content>
    {
    "apiEndpoint": "https://api.example.com",
    "theme": {
        "primaryColor": "#007bff",
        "secondaryColor": "#6c757d",
        "fontFamily": "Arial, sans-serif"
    },
    "features": {
        "darkMode": true,
        "notifications": true,
        "analytics": false
    },
    "version": "1.0.0"
    }
    </content>
    </write_to_file>`

export const toolExemple5:string = `
    <replace_in_file>
    <path>src/components/App.tsx</path>
    <diff> 
    <<<<<<< SEARCH
    import React from 'react';
    =======
    import React, { useState } from 'react';
    >>>>>>> REPLACE

    <<<<<<< SEARCH
    function handleSubmit() {
    saveData();
    setLoading(false);
    }

    =======
    >>>>>>> REPLACE

    <<<<<<< SEARCH
    return (
    <div>
    =======
    function handleSubmit() {
    saveData();
    setLoading(false);
    }

    return (
    <div>
    >>>>>>> REPLACE
    </diff>
    </replace_in_file>`



const systemInfo = (currentDirectory:string) => `
SYSTEM INFORMATION
Operating System: ${osName()}
Default Shell: ${defaultShell}
Home Directory: ${os.homedir().toPosix()}
Current Working Directory: ${currentDirectory}`
