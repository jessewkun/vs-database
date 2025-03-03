import * as vscode from 'vscode';
import { MySQLConnection } from './mysqlConnection';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';

export class TableWebView {
  // 添加静态映射来跟踪所有打开的表视图
  private static readonly viewMap = new Map<string, TableWebView>();

  private panel: vscode.WebviewPanel | undefined;
  private connection: MySQLConnection;
  private database: string;
  private table: string;
  private templatePath: string;

  constructor(connection: MySQLConnection, database: string, table: string) {
    this.connection = connection;
    this.database = database;
    this.table = table;
    this.templatePath = path.join(__dirname, '../../src/mysql/tableView.html');
  }

  static createOrShow(connection: MySQLConnection, database: string, table: string): TableWebView {
    const identifier = `${connection.connectionConfig.id}_${database}.${table}`;

    // 检查是否已存在该表的视图
    let tableView = TableWebView.viewMap.get(identifier);

    if (tableView && tableView.panel) {
      // 如果视图已存在，显示并返回已存在的视图
      tableView.panel.reveal();
      return tableView;
    }

    // 如果不存在或已被销毁，创建新视图
    tableView = new TableWebView(connection, database, table);
    TableWebView.viewMap.set(identifier, tableView);
    tableView.show();
    return tableView;
  }

  private checkConnection(): void {
    if (!this.connection) {
      throw new Error('MySQL connection is not initialized');
    }
    if (!this.connection.isConnected) {
      throw new Error('MySQL connection is not connected');
    }
  }

  private async refreshView() {
    try {
      const structure = await this.connection.getTableStructure(this.database, this.table);
      const indexInfo = await this.connection.getTableIndexes(this.database, this.table);
      const tableInfo = await this.connection.getTableInfo(this.database, this.table);

      if (this.panel) {
        const template = fs.readFileSync(this.templatePath, 'utf8');
        const compiledTemplate = Handlebars.compile(template);

        const data = {
          connectionName: this.connection.connectionConfig.name,
          database: this.database,
          table: this.table,
          columnInfo: structure,
          indexInfo: indexInfo,
          tableInfo: {
            ...tableInfo,
            create_time: tableInfo.create_time ? new Date(tableInfo.create_time).toLocaleString() : 'N/A',
            update_time: tableInfo.update_time ? new Date(tableInfo.update_time).toLocaleString() : 'N/A'
          }
        };

        this.panel.webview.html = compiledTemplate(data);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        vscode.window.showErrorMessage(`Failed to refresh view: ${error.message}`);
      }
    }
  }

  async show() {
    try {
      this.checkConnection();
      await this.connection.useDatabase(this.database);

      const columnToShowIn = this.getNextViewColumn();

      this.panel = vscode.window.createWebviewPanel(
        'mysqlTableView',
        `${this.table}`,
        columnToShowIn,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      await this.refreshView();

      this.panel.webview.onDidReceiveMessage(async message => {
        try {
          this.checkConnection();
          switch (message.command) {
            case 'modifyEncoding':
              const charset = await vscode.window.showQuickPick(
                ['utf8mb4', 'utf8', 'latin1'],
                { placeHolder: 'Select character set' }
              );
              if (charset) {
                const collation = await vscode.window.showQuickPick(
                  charset === 'utf8mb4' ? ['utf8mb4_unicode_ci', 'utf8mb4_general_ci'] :
                    charset === 'utf8' ? ['utf8_unicode_ci', 'utf8_general_ci'] :
                      ['latin1_swedish_ci'],
                  { placeHolder: 'Select collation' }
                );
                if (collation) {
                  await this.connection.modifyTableEncoding(this.database, this.table, charset, collation);
                  await this.refreshView();
                }
              }
              break;

            case 'modifyComment':
              const comment = await vscode.window.showInputBox({
                prompt: 'Enter table comment',
                value: message.currentComment || ''
              });
              if (comment !== undefined) {
                await this.connection.modifyTableComment(this.database, this.table, comment);
                await this.refreshView();
              }
              break;

            case 'resetAutoIncrement':
              const value = await vscode.window.showInputBox({
                prompt: 'Enter new auto increment value',
                value: '1',
                validateInput: value => {
                  return /^\d+$/.test(value) ? null : 'Please enter a valid number';
                }
              });
              if (value) {
                await this.connection.resetAutoIncrement(this.database, this.table, parseInt(value));
                await this.refreshView();
                vscode.window.showInformationMessage(`Auto increment value reset to ${value}`);
              }
              break;

            case 'executeQuery':
              try {
                const results = await this.connection.executeQuery(message.sql);
                this.panel?.webview.postMessage({
                  command: 'queryResult',
                  data: results
                });
              } catch (error: unknown) {
                if (error instanceof Error) {
                  this.panel?.webview.postMessage({
                    command: 'queryError',
                    error: error.message
                  });
                  vscode.window.showErrorMessage(`Query failed: ${error.message}`);
                }
              }
              break;

            case 'showInfo':
              vscode.window.showInformationMessage(message.text);
              break;
          }
        } catch (error: unknown) {
          if (error instanceof Error) {
            vscode.window.showErrorMessage(`Operation failed: ${error.message}`);
          }
        }
      });

      // 处理面板关闭事件
      this.panel.onDidDispose(() => {
        const identifier = `${this.connection.connectionConfig.id}_${this.database}.${this.table}`;
        TableWebView.viewMap.delete(identifier);
        this.panel = undefined;
      });

    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error showing table:', error);
        vscode.window.showErrorMessage(`Failed to show table: ${error.message}`);
      }
    }
  }

  private getNextViewColumn(): vscode.ViewColumn {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return vscode.ViewColumn.One;
    }

    switch (activeEditor.viewColumn) {
      case vscode.ViewColumn.One:
        return vscode.ViewColumn.Two;
      case vscode.ViewColumn.Two:
        return vscode.ViewColumn.Three;
      default:
        return vscode.ViewColumn.One;
    }
  }
}