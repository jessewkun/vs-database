import * as vscode from 'vscode';
import { MySQLConnection } from './mysqlConnection';

export class ServerInfoWebView {
  private static readonly viewMap = new Map<string, ServerInfoWebView>();
  private panel: vscode.WebviewPanel | undefined;
  private connection: MySQLConnection;
  private type: 'variables' | 'processes';

  constructor(connection: MySQLConnection, type: 'variables' | 'processes') {
    this.connection = connection;
    this.type = type;
  }

  static createOrShow(connection: MySQLConnection, type: 'variables' | 'processes'): ServerInfoWebView {
    const identifier = `${connection.connectionConfig.id}_${type}`;
    let view = ServerInfoWebView.viewMap.get(identifier);

    if (view && view.panel) {
      view.panel.reveal();
      return view;
    }

    view = new ServerInfoWebView(connection, type);
    ServerInfoWebView.viewMap.set(identifier, view);
    view.show();
    return view;
  }

  private async show() {
    try {
      const title = this.type === 'variables' ? 'Server Variables' : 'Server Processes';
      this.panel = vscode.window.createWebviewPanel(
        'mysqlServerInfo',
        title,
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      this.panel.onDidDispose(() => {
        const identifier = `${this.connection.connectionConfig.id}_${this.type}`;
        ServerInfoWebView.viewMap.delete(identifier);
        this.panel = undefined;
      });

      await this.updateContent();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to show ${this.type}: ${error.message}`);
    }
  }

  private async updateContent() {
    if (!this.panel) return;

    try {
      const data = this.type === 'variables'
        ? await this.connection.getServerVariables()
        : await this.connection.getServerProcesses();

      this.panel.webview.html = this.getHtmlContent(data);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to get ${this.type}: ${error.message}`);
    }
  }

  private getHtmlContent(data: any[]): string {
    const title = this.type === 'variables' ? 'Server Variables' : 'Server Processes';
    const columns = data.length > 0 ? Object.keys(data[0]) : [];

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { padding: 10px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 8px; border: 1px solid var(--vscode-panel-border); text-align: left; }
                th { background-color: var(--vscode-editor-background); }
            </style>
        </head>
        <body>
            <h2>${title}</h2>
            <table>
                <thead>
                    <tr>
                        ${columns.map(col => `<th>${col}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr>
                            ${columns.map(col => `<td>${row[col] || ''}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `;
  }
}