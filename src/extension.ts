import * as vscode from 'vscode';
import { MySQLProvider } from './mysql/mysqlProvider';
import { MySQLTreeItem } from './mysql/mysqlProvider';
import { TableWebView } from './mysql/TableWebView';

export async function activate(context: vscode.ExtensionContext) {
  // 添加激活日志
  console.log('MySQL Manager extension is now active!');

  const outputChannel = vscode.window.createOutputChannel('MySQL Manager');
  outputChannel.appendLine('Extension activated');

  const mysqlProvider = new MySQLProvider(context);

  // 注册树形视图
  const treeView = vscode.window.registerTreeDataProvider('mysqlExplorer', mysqlProvider);
  outputChannel.appendLine('Tree view provider registered');

  // 使用进度指示器来显示加载状态
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Window,
    title: "Loading MySQL connections..."
  }, async () => {
    await mysqlProvider.initialize();
  });

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('mysql-manager.addConnection', () => {
      mysqlProvider.addConnection();
    }),

    vscode.commands.registerCommand('mysql-manager.refresh', () => {
      mysqlProvider.refresh();
    }),

    vscode.commands.registerCommand('mysql-manager.deleteConnection', async (item) => {
      if (item.connection) {
        await item.connection.disconnect();
        mysqlProvider.refresh();
      }
    }),

    vscode.commands.registerCommand('mysql-manager.createDatabase', async (item) => {
      if (item.connection) {
        const name = await vscode.window.showInputBox({ prompt: 'Database name' });
        if (name) {
          try {
            await item.connection.createDatabase(name);
            mysqlProvider.refresh();
          } catch (error) {
            vscode.window.showErrorMessage(`Failed to create database: ${error.message}`);
          }
        }
      }
    }),

    vscode.commands.registerCommand('mysql-manager.dropDatabase', async (item) => {
      if (item.connection) {
        const confirm = await vscode.window.showWarningMessage(
          `Are you sure you want to drop database "${item.label}"?`,
          'Yes',
          'No'
        );
        if (confirm === 'Yes') {
          try {
            await item.connection.dropDatabase(item.label);
            mysqlProvider.refresh();
          } catch (error) {
            vscode.window.showErrorMessage(`Failed to drop database: ${error.message}`);
          }
        }
      }
    }),

    vscode.commands.registerCommand('mysql-manager.refreshTables', (item: MySQLTreeItem) => {
      if (item.type === 'database') {
        mysqlProvider.refresh(item);
      }
    }),

    vscode.commands.registerCommand('mysql-manager.reconnect', async (item: MySQLTreeItem) => {
      if (item.connection) {
        try {
          await item.connection.reconnect();
          mysqlProvider.refresh();
          vscode.window.showInformationMessage(`Successfully reconnected to ${item.label}`);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to reconnect: ${error.message}`);
        }
      }
    }),

    vscode.commands.registerCommand('mysql-manager.retryConnection', async (item: MySQLTreeItem) => {
      if (item.connection) {
        mysqlProvider.refresh(item);
      }
    }),

    vscode.commands.registerCommand('mysql-manager.openTableView', async (item: MySQLTreeItem) => {
      if (!item.connection || !item.database) {
        vscode.window.showErrorMessage('Invalid table selection');
        return;
      }

      try {
        // 确保连接是活跃的
        if (!item.connection.isConnected) {
          await item.connection.connect();
        }

        const tableView = TableWebView.getInstance(item.connection);
        await tableView.show(item.database, item.label);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open table view: ${error.message}`);
      }
    }),

    vscode.commands.registerCommand('mysql-manager.renameTable', async (item: MySQLTreeItem) => {
      if (!item.connection || !item.database) return;

      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new table name',
        value: item.label,
        validateInput: value => {
          return value && value !== item.label ? null : 'Please enter a different table name';
        }
      });

      if (newName) {
        try {
          await item.connection.renameTable(item.database, item.label, newName);
          mysqlProvider.refresh(item.parent);
          vscode.window.showInformationMessage(`Table renamed to ${newName}`);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to rename table: ${error.message}`);
        }
      }
    }),

    vscode.commands.registerCommand('mysql-manager.duplicateTable', async (item: MySQLTreeItem) => {
      if (!item.connection || !item.database) return;

      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new table name',
        value: `${item.label}_copy`,
        validateInput: value => {
          return value ? null : 'Please enter a table name';
        }
      });

      if (newName) {
        try {
          await item.connection.duplicateTable(item.database, item.label, newName);
          mysqlProvider.refresh(item.parent);
          vscode.window.showInformationMessage(`Table duplicated as ${newName}`);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to duplicate table: ${error.message}`);
        }
      }
    }),

    vscode.commands.registerCommand('mysql-manager.truncateTable', async (item: MySQLTreeItem) => {
      if (!item.connection || !item.database) return;

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to truncate table "${item.label}"? This will delete all data.`,
        { modal: true },
        'Yes'
      );

      if (confirm === 'Yes') {
        try {
          await item.connection.truncateTable(item.database, item.label);
          vscode.window.showInformationMessage(`Table ${item.label} truncated`);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to truncate table: ${error.message}`);
        }
      }
    }),

    vscode.commands.registerCommand('mysql-manager.deleteTable', async (item: MySQLTreeItem) => {
      if (!item.connection || !item.database) return;

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete table "${item.label}"? This cannot be undone.`,
        { modal: true },
        'Yes'
      );

      if (confirm === 'Yes') {
        try {
          await item.connection.deleteTable(item.database, item.label);
          mysqlProvider.refresh(item.parent);
          vscode.window.showInformationMessage(`Table ${item.label} deleted`);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to delete table: ${error.message}`);
        }
      }
    }),

    vscode.commands.registerCommand('mysql-manager.showCreateTable', async (item: MySQLTreeItem) => {
      if (!item.connection || !item.database) return;

      try {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `Getting create syntax for table ${item.label}...`,
          cancellable: false
        }, async () => {
          const syntax = await item.connection.getCreateTableSyntax(item.database, item.label);
          if (!syntax) {
            throw new Error('No create syntax returned');
          }

          const document = await vscode.workspace.openTextDocument({
            content: syntax,
            language: 'sql'
          });
          await vscode.window.showTextDocument(document);
        });
      } catch (error) {
        console.error('Show create table error:', error);
        vscode.window.showErrorMessage(`Failed to get create table syntax: ${error.message}`);
      }
    }),

    vscode.commands.registerCommand('mysql-manager.copyCreateTable', async (item: MySQLTreeItem) => {
      if (!item.connection || !item.database) return;

      try {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `Copying create syntax for table ${item.label}...`,
          cancellable: false
        }, async () => {
          const syntax = await item.connection.getCreateTableSyntax(item.database, item.label);
          if (!syntax) {
            throw new Error('No create syntax returned');
          }

          await vscode.env.clipboard.writeText(syntax);
          vscode.window.showInformationMessage('Create table syntax copied to clipboard');
        });
      } catch (error) {
        console.error('Copy create table error:', error);
        vscode.window.showErrorMessage(`Failed to copy create table syntax: ${error.message}`);
      }
    })
  );

  // 将 treeView 添加到订阅中
  context.subscriptions.push(treeView);
}

export function deactivate() { }