import * as vscode from 'vscode';

export const TYPE_MYSQL = 1
export const TYPE_REDIS = 2
export const TYPE_DATABASE = 3
export const TYPE_TABLE = 4
export const TYPE_KEY = 5

export var log: vscode.OutputChannel

export function initLog(): void {
    log = vscode.window.createOutputChannel("vsDatabase");
}

export function getConfig(context: vscode.ExtensionContext, key: string): string {
    return <string>context.globalState.get(key);
}

export function setConfig(context: vscode.ExtensionContext, key: string, value: any): void {
    if (typeof value != "string") {
        value = JSON.stringify(value)
    }
    context.globalState.update(key, value)
}