import * as vscode from 'vscode';
import { MysqlProvider } from './database';

export function activate(context: vscode.ExtensionContext) {

    // let log = vscode.window.createOutputChannel("vsDatabase");

    const mysqlProvider = new MysqlProvider(context, '/Users/wangkun/localhost/javascript/vs-database');
    vscode.window.registerTreeDataProvider('vsMysql', mysqlProvider);
    vscode.commands.registerCommand('vsMysql.refreshEntry', () => vscode.window.showInformationMessage(`Successfully called refresh entry.`));
    vscode.commands.registerCommand('vsMysql.addEntry', () => vscode.window.showInformationMessage(`Successfully called add entry.`));
    vscode.commands.registerCommand('vsMysql.editEntry', () => vscode.window.showInformationMessage(`Successfully called edit entry`));
    vscode.commands.registerCommand('vsMysql.deleteEntry', () => vscode.window.showInformationMessage(`Successfully called delete entry`));


    // context.globalState.update('conn', [1, 2, 3])
    // let connArr = context.globalState.get('conn');
    // log.appendLine("--------------");
    // log.appendLine(<string>connArr);
    // log.appendLine(<string>vscode.workspace.rootPath);


    let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() { }
