import * as vscode from 'vscode';
import { MySQLConnection } from './mysqlConnection';

export class TableWebView {
  // 添加静态映射来跟踪所有打开的表视图
  private static readonly viewMap = new Map<string, TableWebView>();

  private panel: vscode.WebviewPanel | undefined;
  private connection: MySQLConnection;
  private database: string;
  private table: string;

  constructor(connection: MySQLConnection, database: string, table: string) {
    this.connection = connection;
    this.database = database;
    this.table = table;
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

  async show() {
    try {
      this.checkConnection();
      await this.connection.useDatabase(this.database);

      const structure = await this.connection.getTableStructure(this.database, this.table);
      const indexInfo = await this.connection.getTableIndexes(this.database, this.table);

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

      // 在面板关闭时从映射中移除
      this.panel.onDidDispose(() => {
        const identifier = `${this.connection.connectionConfig.id}_${this.database}.${this.table}`;
        TableWebView.viewMap.delete(identifier);
        this.panel = undefined;
      });

      this.updateContent(structure, indexInfo);

      this.panel.webview.onDidReceiveMessage(async message => {
        try {
          this.checkConnection();
          switch (message.command) {
            case 'executeQuery':
              try {
                const results = await this.connection.executeQuery(message.sql);
                this.panel?.webview.postMessage({
                  command: 'queryResult',
                  data: results
                });
              } catch (error) {
                this.panel?.webview.postMessage({
                  command: 'queryError',
                  error: error.message
                });
                vscode.window.showErrorMessage(`Query failed: ${error.message}`);
              }
              break;
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Operation failed: ${error.message}`);
        }
      });
    } catch (error) {
      console.error('Error showing table:', error);
      vscode.window.showErrorMessage(`Failed to show table: ${error.message}`);
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

  private updateContent(columnInfo: any[], indexInfo: any[]) {
    if (!this.panel) return;

    this.panel.title = this.table;
    this.panel.webview.html = this.getHtmlContent(
      this.connection.connectionConfig.name,
      this.database,
      this.table,
      columnInfo,
      indexInfo
    );
  }

  private getHtmlContent(
    connectionName: string,
    database: string,
    table: string,
    columnInfo: any[],
    indexInfo: any[]
  ): string {
    return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        padding: 10px;
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                    }
                    .breadcrumb {
                        padding: 10px;
                        background-color: var(--vscode-editor-background);
                        border-bottom: 1px solid var(--vscode-panel-border);
                        margin-bottom: 20px;
                    }
                    .breadcrumb a {
                        color: var(--vscode-textLink-foreground);
                        text-decoration: none;
                    }
                    .breadcrumb a:hover {
                        text-decoration: underline;
                    }
                    .breadcrumb span {
                        color: var(--vscode-descriptionForeground);
                        margin: 0 8px;
                    }
                    .sql-editor {
                        width: 100%;
                        height: 100px;
                        margin: 10px 0;
                        padding: 8px;
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        font-family: var(--vscode-editor-font-family);
                    }
                    .section {
                        margin: 20px 0;
                        padding: 15px 0;
                    }
                    .section h3 {
                        margin-top: 0;
                        color: var(--vscode-sideBarTitle-foreground);
                        font-size: 1.1em;
                        margin-bottom: 15px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    th, td {
                        padding: 8px;
                        border: 1px solid var(--vscode-panel-border);
                        text-align: left;
                    }
                    th {
                        background-color: var(--vscode-editor-background);
                        font-weight: normal;
                        color: var(--vscode-foreground);
                    }
                    .execute-btn {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 16px;
                        cursor: pointer;
                    }
                    .execute-btn:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    #queryResult .error {
                        color: var(--vscode-errorForeground);
                        padding: 10px;
                        margin: 10px 0;
                        background-color: var(--vscode-inputValidation-errorBackground);
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                    }
                    #queryResultContent table {
                        margin-top: 10px;
                    }
                    #queryResultContent td {
                        max-width: 300px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    /* 添加标签页样式 */
                    .tabs {
                        margin: 20px 0 0 0;
                    }

                    .tab-buttons {
                        display: flex;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        margin-bottom: 15px;
                    }

                    .tab-button {
                        padding: 8px 16px;
                        border: none;
                        background: none;
                        color: var(--vscode-foreground);
                        cursor: pointer;
                        margin-right: 2px;
                        position: relative;
                    }

                    .tab-button.active {
                        color: var(--vscode-textLink-foreground);
                        font-weight: 500;
                    }

                    .tab-button.active::after {
                        content: '';
                        position: absolute;
                        bottom: -1px;
                        left: 0;
                        right: 0;
                        height: 2px;
                        background-color: var(--vscode-textLink-foreground);
                    }

                    .tab-button:hover:not(.active) {
                        color: var(--vscode-textLink-activeForeground);
                    }

                    .tab-content {
                        display: none;
                    }

                    .tab-content.active {
                        display: block;
                    }

                    /* 调整表格样式 */
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 0;
                    }

                    /* 添加新的样式 */
                    .tab-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 15px;
                    }

                    .display-mode {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }

                    .display-mode select {
                        padding: 4px 8px;
                        background-color: var(--vscode-dropdown-background);
                        color: var(--vscode-dropdown-foreground);
                        border: 1px solid var(--vscode-dropdown-border);
                        border-radius: 2px;
                    }

                    /* 优化纵向显示模式的样式 */
                    .vertical-row {
                        background: var(--vscode-editor-background);
                        border-radius: 4px;
                        margin-bottom: 16px;
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    }

                    .vertical-row:last-child {
                        margin-bottom: 0;
                    }

                    .vertical-row-header {
                        padding: 8px 12px;
                        background: var(--vscode-sideBarSectionHeader-background);
                        color: var(--vscode-sideBarSectionHeader-foreground);
                        font-size: 0.9em;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        border-radius: 4px 4px 0 0;
                    }

                    .vertical-table {
                        width: 100%;
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 0 0 4px 4px;
                        border-spacing: 0;
                    }

                    .vertical-table tr {
                        display: flex;
                    }

                    .vertical-table tr:not(:last-child) {
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }

                    .vertical-table td {
                        padding: 8px 12px;
                        line-height: 1.4;
                        border: none;
                    }

                    .vertical-table td:first-child {
                        flex: 0 0 200px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-foreground);
                        font-weight: 500;
                        border-right: 1px solid var(--vscode-panel-border);
                    }

                    .vertical-table td:last-child {
                        flex: 1;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                    }

                    /* 添加行号样式 */
                    .row-number {
                        color: var(--vscode-descriptionForeground);
                        font-size: 0.9em;
                    }

                    /* 优化 NULL 值的显示 */
                    .null-value {
                        color: var(--vscode-descriptionForeground);
                        font-style: italic;
                    }

                    /* 优化长文本的显示 */
                    .vertical-table td:last-child {
                        white-space: pre-wrap;
                        word-break: break-word;
                    }
                </style>
            </head>
            <body>
                <div class="breadcrumb">
                    <a href="#" onclick="return false;">${connectionName}</a>
                    <span>></span>
                    <a href="#" onclick="return false;">${database}</a>
                    <span>></span>
                    <a href="#" onclick="return false;">${table}</a>
                </div>

                <div class="section">
                    <textarea class="sql-editor" id="sqlEditor" placeholder="Enter your SQL query here...">SELECT * FROM ${table} LIMIT 10;</textarea>
                    <button class="execute-btn" onclick="executeQuery()">Execute</button>
                </div>

                <div class="tabs">
                    <div class="tab-buttons">
                        <button class="tab-button active" onclick="showTab('structure')">Table Structure</button>
                        <button class="tab-button" onclick="showTab('indexes')">Indexes</button>
                        <button class="tab-button" onclick="showTab('query-result')">Query Result</button>
                    </div>

                    <div id="structure" class="tab-content active">
                        <table>
                            <thead>
                                <tr>
                                    <th>Column</th>
                                    <th>Type</th>
                                    <th>Null</th>
                                    <th>Key</th>
                                    <th>Default</th>
                                    <th>Extra</th>
                                    <th>Comment</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${columnInfo.map(col => `
                                    <tr>
                                        <td>${col.Field}</td>
                                        <td>${col.Type}</td>
                                        <td>${col.Null}</td>
                                        <td>${col.Key}</td>
                                        <td>${col.Default || ''}</td>
                                        <td>${col.Extra}</td>
                                        <td>${col.Comment || ''}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div id="indexes" class="tab-content">
                        <table>
                            <thead>
                                <tr>
                                    <th>Key Name</th>
                                    <th>Column</th>
                                    <th>Type</th>
                                    <th>Unique</th>
                                    <th>Packed</th>
                                    <th>Cardinality</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${indexInfo.map(idx => `
                                    <tr>
                                        <td>${idx.Key_name}</td>
                                        <td>${idx.Column_name}</td>
                                        <td>${idx.Index_type}</td>
                                        <td>${idx.Non_unique ? 'No' : 'Yes'}</td>
                                        <td>${idx.Packed || 'No'}</td>
                                        <td>${idx.Cardinality}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div id="query-result" class="tab-content">
                        <div class="tab-header">
                            <div></div>
                            <div class="display-mode">
                                <label>Display Mode:</label>
                                <select id="displayMode" onchange="toggleDisplayMode()">
                                    <option value="horizontal">Horizontal</option>
                                    <option value="vertical">Vertical</option>
                                </select>
                            </div>
                        </div>
                        <div id="queryResultContent"></div>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let currentData = null;

                    function showTab(tabId) {
                        // 隐藏所有标签页内容
                        document.querySelectorAll('.tab-content').forEach(tab => {
                            tab.classList.remove('active');
                        });
                        // 取消所有标签按钮的激活状态
                        document.querySelectorAll('.tab-button').forEach(button => {
                            button.classList.remove('active');
                        });

                        // 显示选中的标签页内容
                        document.getElementById(tabId).classList.add('active');
                        // 激活对应的标签按钮
                        document.querySelector(\`.tab-button[onclick="showTab('\${tabId}')"]\`).classList.add('active');
                    }

                    function executeQuery() {
                        const sql = document.getElementById('sqlEditor').value;
                        const resultContent = document.getElementById('queryResultContent');

                        resultContent.innerHTML = 'Executing query...';
                        showTab('query-result');

                        vscode.postMessage({
                            command: 'executeQuery',
                            sql: sql
                        });
                    }

                    function toggleDisplayMode() {
                        if (!currentData) return;

                        const mode = document.getElementById('displayMode').value;
                        renderQueryResult(currentData, mode);
                    }

                    function renderQueryResult(data, mode = 'horizontal') {
                        const resultContent = document.getElementById('queryResultContent');

                        if (data.rows.length === 0) {
                            resultContent.innerHTML = 'No results found';
                            return;
                        }

                        if (mode === 'horizontal') {
                            renderHorizontalTable(data, resultContent);
                        } else {
                            renderVerticalTable(data, resultContent);
                        }
                    }

                    function renderHorizontalTable(data, container) {
                        let table = '<table><thead><tr>';
                        data.columns.forEach(column => {
                            table += \`<th>\${column}</th>\`;
                        });
                        table += '</tr></thead><tbody>';

                        data.rows.forEach(row => {
                            table += '<tr>';
                            data.columns.forEach(column => {
                                table += \`<td>\${row[column] === null ? 'NULL' : row[column]}</td>\`;
                            });
                            table += '</tr>';
                        });

                        table += '</tbody></table>';
                        container.innerHTML = table;
                    }

                    function renderVerticalTable(data, container) {
                        let html = '';

                        data.rows.forEach((row, rowIndex) => {
                            html += \`<div class="vertical-row">
                                <div class="vertical-row-header">
                                    <span class="row-number">Record \${rowIndex + 1} of \${data.rows.length}</span>
                                </div>
                                <table class="vertical-table">\`;

                            data.columns.forEach(column => {
                                const value = row[column];
                                const displayValue = value === null
                                    ? '<span class="null-value">NULL</span>'
                                    : value;

                                html += \`<tr>
                                    <td>\${column}</td>
                                    <td>\${displayValue}</td>
                                </tr>\`;
                            });

                            html += \`</table></div>\`;
                        });

                        container.innerHTML = html;
                    }

                    window.addEventListener('message', event => {
                        const message = event.data;

                        switch (message.command) {
                            case 'queryResult':
                                currentData = message.data;
                                const mode = document.getElementById('displayMode').value;
                                renderQueryResult(currentData, mode);
                                break;

                            case 'queryError':
                                document.getElementById('queryResultContent').innerHTML =
                                    \`<div class="error">\${message.error}</div>\`;
                                break;
                        }
                    });
                </script>
            </body>
            </html>
        `;
  }
}