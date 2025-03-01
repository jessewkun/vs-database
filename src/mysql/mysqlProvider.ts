import * as vscode from 'vscode';
import { MySQLConnection, MySQLConfig } from './mysqlConnection';

export class MySQLProvider implements vscode.TreeDataProvider<MySQLTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<MySQLTreeItem | undefined | null | void> = new vscode.EventEmitter<MySQLTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<MySQLTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private connections: Map<string, MySQLConnection> = new Map();
  private outputChannel: vscode.OutputChannel;
  private isLoading: boolean = false;

  constructor(private context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel('MySQL Manager');
  }

  async initialize(): Promise<void> {
    this.isLoading = true;
    this.refresh();

    try {
      await this.loadConnections();
    } finally {
      this.isLoading = false;
      this.refresh();
    }
  }

  private async loadConnections() {
    try {
      const configs = this.context.globalState.get<MySQLConfig[]>('mysql-connections', []);
      this.log('Loading saved connections...');

      this.connections.clear();

      // 只创建连接实例，不进行实际连接
      for (const config of configs) {
        const connection = new MySQLConnection(config);
        this.connections.set(config.id, connection);
        this.log(`Loaded connection config: ${config.name}`);
      }
    } catch (error) {
      this.log(`Error loading connections: ${error.message}`);
      vscode.window.showErrorMessage('Failed to load saved connections');
    }
  }

  async saveConnection(config: MySQLConfig) {
    const configs = Array.from(this.connections.values()).map(conn => conn.connectionConfig);
    await this.context.globalState.update('mysql-connections', configs);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MySQLTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: MySQLTreeItem): Promise<MySQLTreeItem[]> {
    if (this.isLoading) {
      return [new MySQLTreeItem(
        'Loading...',
        'connection',
        null,
        vscode.TreeItemCollapsibleState.None
      )];
    }

    if (!element) {
      // Root level - show connections
      return Array.from(this.connections.values()).map(
        conn => new MySQLTreeItem(
          conn.connectionConfig.name,
          'connection',
          conn,
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          conn.isConnected
        )
      );
    }

    if (element.type === 'connection' && element.connection) {
      // Connection level - show databases
      try {
        // 如果未连接，尝试建立连接
        if (!element.connection.isConnected) {
          this.log(`Connecting to ${element.label}...`);
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Connecting to ${element.label}...`,
            cancellable: false
          }, async () => {
            await element.connection.connect();
          });
          this.log(`Successfully connected to ${element.label}`);
        }

        const databases = await element.connection.getDatabases();
        return databases.map(
          db => new MySQLTreeItem(
            db,
            'database',
            element.connection,
            vscode.TreeItemCollapsibleState.Collapsed,
            db
          )
        );
      } catch (error) {
        this.log(`Failed to connect to ${element.label}: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to connect: ${error.message}`);
        return [new MySQLTreeItem(
          'Failed to connect',
          'error',
          null,
          vscode.TreeItemCollapsibleState.None
        )];
      }
    }

    if (element.type === 'database' && element.connection && element.database) {
      // Database level - show tables
      try {
        const tables = await element.connection.getTables(element.database);
        return tables.map(
          table => new MySQLTreeItem(
            table,
            'table',
            element.connection,
            vscode.TreeItemCollapsibleState.None,
            element.database
          )
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to get tables: ${error.message}`);
        return [];
      }
    }

    return [];
  }

  async addConnection() {
    try {
      this.log('Adding new connection...');

      const name = await vscode.window.showInputBox({
        prompt: 'Connection name',
        validateInput: (value) => {
          return value ? null : 'Connection name is required';
        }
      });

      const host = await vscode.window.showInputBox({
        prompt: 'Host',
        value: 'localhost',
        validateInput: (value) => {
          return value ? null : 'Host is required';
        }
      });

      const port = await vscode.window.showInputBox({
        prompt: 'Port',
        value: '3306',
        validateInput: (value) => {
          return /^\d+$/.test(value) ? null : 'Port must be a number';
        }
      });

      const user = await vscode.window.showInputBox({
        prompt: 'Username',
        value: 'root',
        validateInput: (value) => {
          return value ? null : 'Username is required';
        }
      });

      const password = await vscode.window.showInputBox({
        prompt: 'Password (optional)',
        password: true
      });

      if (!name || !host || !port || !user) {
        this.log('Connection cancelled: missing required fields');
        vscode.window.showErrorMessage('Required fields are missing');
        return;
      }

      const config: MySQLConfig = {
        id: Date.now().toString(),
        name,
        host,
        port: parseInt(port),
        user,
        password: password || ''
      };
      this.log('Connection config created');

      this.log('Attempting to connect...');
      const connection = new MySQLConnection(config);

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Connecting to MySQL...",
        cancellable: false
      }, async () => {
        const connected = await connection.connect();
        if (connected) {
          this.log('Connection successful');
          this.connections.set(config.id, connection);
          await this.saveConnection(config);
          this.refresh();
          vscode.window.showInformationMessage(`Successfully connected to ${config.name}`);
        } else {
          this.log('Connection failed');
          throw new Error('Failed to connect to MySQL server');
        }
      });

    } catch (error) {
      this.log(`Error: ${error.message}`);
      vscode.window.showErrorMessage(`Failed to connect: ${error.message}`);
    }
  }

  private log(message: string) {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
}

export class MySQLTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly type: 'connection' | 'database' | 'table' | 'error',
    public readonly connection: MySQLConnection | null,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly database?: string,
    private readonly isConnected: boolean = false
  ) {
    super(label, collapsibleState);

    this.contextValue = type;

    // 为表项添加点击命令
    if (type === 'table') {
      this.command = {
        command: 'mysql-manager.openTableView',
        title: 'Open Table View',
        arguments: [this]
      };
    }

    switch (type) {
      case 'connection':
        this.iconPath = new vscode.ThemeIcon(
          'database',
          isConnected ? undefined : new vscode.ThemeColor('descriptionForeground')
        );
        if (connection) {
          const config = connection.connectionConfig;
          this.description = isConnected
            ? `(${config.user}@${config.host}:${config.port})`
            : '(click to connect)';
        }
        break;
      case 'database':
        this.iconPath = new vscode.ThemeIcon('folder-opened');
        break;
      case 'table':
        this.iconPath = new vscode.ThemeIcon('table');
        break;
      case 'error':
        this.iconPath = new vscode.ThemeIcon('error');
        this.description = 'Click to retry';
        break;
    }
  }
}