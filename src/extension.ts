import * as vscode from 'vscode';
import * as config from './config';
import { MysqlProvider, MysqlCommand } from './mysql';
import { RedisProvider } from './redis';

export function activate(context: vscode.ExtensionContext) {

    config.Logger.getInstance();

    const mysqlProvider = new MysqlProvider(context);
    mysqlProvider.init()
    const mysqlCommand = new MysqlCommand(context, mysqlProvider);
    mysqlCommand.init()

    const redisProvider = new RedisProvider(context);
    redisProvider.registerTreeDataProvider()
    redisProvider.registerCommand()


    // context.globalState.update('conn', [1, 2, 3])
    // let connArr = context.globalState.get('conn');
    // log.appendLine("--------------");
    // log.appendLine(<string>connArr);
    // log.appendLine(<string>vscode.workspace.rootPath);
}

export function deactivate() { }
