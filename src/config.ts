import * as vscode from 'vscode';

export const TYPE_MYSQL = 1
export const TYPE_REDIS = 2
export const TYPE_DATABASE = 3
export const TYPE_TABLE = 4
export const TYPE_KEY = 5

export class Logger {
    private static instance = vscode.window.createOutputChannel("vsDatabase");
    private constructor() { }
    static getInstance(): Logger {
        return Logger.instance
    }
    static output(str: string): void {
        str = `[` + now() + `] ` + str
        Logger.instance.appendLine(str)
    }
}

function now(): string {
    let date = new Date();
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let months = String(month < 10 ? '0' + month : month)
    let day = date.getDate();
    let days = String(day < 10 ? '0' + day : day)
    let hour = date.getHours();
    let hours = String(hour < 10 ? '0' + hour : hour)
    let minute = date.getMinutes();
    let minutes = String(minute < 10 ? '0' + minute : minute)
    let second = date.getSeconds()
    let seconds = String(second < 10 ? '0' + second : second)
    return year + '-' + months + '-' + days + ' ' + hours + ':' + minutes + ':' + seconds
}

export function getConfig<T>(context: vscode.ExtensionContext, key: string): T | undefined {
    return context.globalState.get<T>(key);
}

// value cannot be a map
export function setConfig(context: vscode.ExtensionContext, key: string, value: any): void {
    context.globalState.update(key, value)
}
