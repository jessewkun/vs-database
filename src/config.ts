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

export function getConfig<T>(context: vscode.ExtensionContext, key: string): T | undefined {
    return context.globalState.get<T>(key);
}

// value cannot be a map
export function setConfig(context: vscode.ExtensionContext, key: string, value: any): void {
    context.globalState.update(key, value)
}
