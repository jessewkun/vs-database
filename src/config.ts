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