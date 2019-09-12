import * as vscode from 'vscode';
import { MysqlProvider } from './mysql';
import { RedisProvider } from './redis';

export function activate(context: vscode.ExtensionContext) {

    // let log = vscode.window.createOutputChannel("vsDatabase");

    const mysqlProvider = new MysqlProvider(context);
    mysqlProvider.registerTreeDataProvider()
    mysqlProvider.registerCommand()

    const redisProvider = new RedisProvider(context);
    redisProvider.registerTreeDataProvider()
    redisProvider.registerCommand()


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
