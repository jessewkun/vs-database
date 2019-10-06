import * as vscode from 'vscode';
import * as path from 'path';
import * as config from './config';
import * as utils from './utils';
import * as mysql from "mysql2";

const VIEW_TITLE = 'vsMysql'
const EVENT_ITEM = 'itemClick'
const SYSTEM_TABLE = ['information_schema', 'performance_schema', 'mysql']
let webviewPanel: vscode.WebviewPanel | undefined;
let current: Dependency
let outputFormat: string = 'normal' // todo

export interface MysqlInfo {
    host: string;
    port: number;
    user: string;
    password?: string;
    db?: string;
    table?: string;
    conn?: mysql.Connection
}

export class MysqlProvider implements vscode.TreeDataProvider<Dependency> {

    private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined> = new vscode.EventEmitter<Dependency | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Dependency | undefined> = this._onDidChangeTreeData.event;

    public context: vscode.ExtensionContext
    public configMap: Map<string, MysqlInfo> = new Map()

    constructor(context: vscode.ExtensionContext) {
        this.context = context
        this._getConnConfig()
    }

    // get config from global state
    private _getConnConfig(): void {
        let configMap = config.getConfig<Array<Array<any>>>(this.context, VIEW_TITLE)
        if (configMap) {
            let temp = configMap.map(x => [x[0], x[1]] as [string, MysqlInfo]);
            this.configMap = new Map<string, MysqlInfo>(temp)
        }
    }

    // register provider
    init = (): void => {
        vscode.window.registerTreeDataProvider(VIEW_TITLE, this);
    }

    refresh = (node?: Dependency): void => {
        if (node) {
            this._onDidChangeTreeData.fire(node)
        } else {
            this._onDidChangeTreeData.fire()
        }
    }

    getTreeItem(node: Dependency): vscode.TreeItem {
        node.setIcon();
        return node;
    }

    getChildren(node?: Dependency): Thenable<Dependency[]> {
        if (node) {
            switch (node.type) {
                case config.TYPE_MYSQL:
                    return this._database(node)
                case config.TYPE_DATABASE:
                    return this._table(node)
                default:
                    return Promise.resolve([]);
            }
        } else {
            return this._conn()
        }
    }

    private _toDep(type: number, parent: Dependency | undefined, info: MysqlInfo): Dependency {
        let label = ""
        let state = vscode.TreeItemCollapsibleState.Collapsed
        if (info.table) {
            label = info.table
            state = vscode.TreeItemCollapsibleState.None
        } else if (info.db) {
            label = info.db
        } else {
            label = `${info.host}: ${info.port}`
        }
        return new Dependency(label, type, info, parent, state);
    }

    private _conn = (): Thenable<Dependency[]> => {
        if (this.configMap) {
            return Promise.resolve([...this.configMap].map(([label, conn]) => this._toDep(config.TYPE_MYSQL, undefined, conn)))
        }
        return Promise.resolve([]);
    }

    private _database = (node: Dependency): Thenable<Dependency[]> => {
        let deps: Dependency[] = node.query<mysql.RowDataPacket[]>('show databases', '', false).then(res => {
            if (res.length > 0) {
                let resString = JSON.stringify(res);
                let dbArr = JSON.parse(resString);
                let dbDepArr: Dependency[] = []
                dbArr.forEach(db => {
                    let info = Object.assign({}, node.info);
                    info.db = db.Database
                    dbDepArr.push(this._toDep(config.TYPE_DATABASE, node, info))
                });
                return dbDepArr
            }
            return []
        }).catch(err => {
            vscode.window.showErrorMessage(err)
            return []
        })
        return Promise.resolve(deps);
    }

    private _table = (node: Dependency): Thenable<Dependency[]> => {
        let deps: Dependency[] = node.query<mysql.RowDataPacket[]>(`show tables`).then((res): Dependency[] => {
            if (res.length > 0) {
                let resString = JSON.stringify(res);
                let tableArr = JSON.parse(resString);
                let tableDepArr: Dependency[] = []
                tableArr.forEach(table => {
                    let info = Object.assign({}, node.info);
                    info.table = table[`Tables_in_${node.label}`]
                    tableDepArr.push(this._toDep(config.TYPE_TABLE, node, info))
                });
                return tableDepArr
            }
            return []
        }).catch(err => {
            vscode.window.showErrorMessage(err)
            return []
        })
        return Promise.resolve(deps);
    }
}

export class Dependency extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly type: number,
        public info: MysqlInfo,
        public parent: Dependency | undefined,
        public collapsibleState: vscode.TreeItemCollapsibleState,
    ) {
        super(label, collapsibleState);
    }

    command = {
        title: this.label,
        command: `${VIEW_TITLE}.${EVENT_ITEM}`,
        tooltip: this.label,
        arguments: [
            this
        ]
    }

    set collapse(state: vscode.TreeItemCollapsibleState) {
        this.collapsibleState = state
    }

    public setIcon() {
        let icon = ""
        switch (this.type) {
            case config.TYPE_MYSQL:
                icon = 'conn.svg'
                break;
            case config.TYPE_DATABASE:
                icon = 'db.svg'
                break;
            case config.TYPE_TABLE:
                icon = 'table.svg'
                break;
        }
        this.iconPath = {
            light: path.join(__filename, '..', '..', 'resources', 'light', icon),
            dark: path.join(__filename, '..', '..', 'resources', 'dark', icon)
        }
    }

    get contextValue(): string {
        switch (this.type) {
            case config.TYPE_MYSQL:
                return 'DependencyMySqlConn'
            case config.TYPE_DATABASE:
                return 'DependencyMySqlDatabase'
            case config.TYPE_TABLE:
                return 'DependencyMySqlTable'
        }
        return ""
    }

    public isSystem(): boolean {
        if (this.type == config.TYPE_DATABASE && SYSTEM_TABLE.indexOf(this.label) > -1) {
            return true
        }
        if (this.type == config.TYPE_TABLE && this.parent != undefined && SYSTEM_TABLE.indexOf(this.parent.label) > -1) {
            return true
        }
        return false
    }

    public async query<T extends mysql.RowDataPacket[][] | mysql.RowDataPacket[] | mysql.OkPacket | mysql.OkPacket[]>(sql: string, values?: any, usedb?: boolean): Promise<T> {
        usedb = usedb == undefined ? true : false
        if (usedb && (current == undefined || (current.info.db != this.info.db))) {
            current = this
            return this._query<T>(`use ${this.info.db}`).then((res) => {
                return this._query<T>(sql, values)
            })
        }
        return this._query<T>(sql, values)
    }

    private async _query<T extends mysql.RowDataPacket[][] | mysql.RowDataPacket[] | mysql.OkPacket | mysql.OkPacket[]>(sql: string, values?: any): Promise<T> {
        if (this.info.conn == undefined) {
            let config: mysql.ConnectionOptions = {
                host: this.info.host,
                user: this.info.user,
                port: this.info.port,
                password: this.info.password
            }
            this.info.conn = await mysql.createConnection(config)
            this.info.conn.connect()
        }
        return new Promise((resolve, reject) => {
            this.info.conn.query<T>(sql, values, (err: mysql.QueryError | null, result: T, fields: mysql.FieldPacket[]) => {
                if (err != null) {
                    reject(err)
                } else {
                    config.Logger.output(`<${this.info.user}@${this.info.host}> ` + sql)
                    resolve(result)
                }
            });
        });
    }
}


export class MysqlCommand {
    public context: vscode.ExtensionContext
    public mysql: MysqlProvider

    constructor(context: vscode.ExtensionContext, mysql: MysqlProvider) {
        this.context = context
        this.mysql = mysql
    }

    init() {
        let commandMap: Map<string, (...args: any[]) => any> = new Map([
            [`addConnection`, this.addConnection],
            [`refreshConnection`, this.refreshConnection],
            [`collapseConnection`, this.collapseConnection],
            [`deleteAllConnection`, this.deleteAllConnection],
            [`exec`, this.exec],
            [`showCreate`, this.showCreate],
            [`info`, this.info],
            [`status`, this.status],
            [`index`, this.index],
            [`showProcess`, this.showProcess],
            [`rename`, this.rename],
            [`truncate`, this.truncate],
            [`delete`, this.delete],
            [`createDatabase`, this.createDatabase],
            [`createTable`, this.createTable],
            [EVENT_ITEM, this.clickItem],
        ])
        for (var [key, func] of commandMap.entries()) {
            this.context.subscriptions.push(
                vscode.commands.registerCommand(`${VIEW_TITLE}.${key}`, func)
            )
        }
    }

    // show confirm
    private _showConfirm = (msg: string, fun: Function): void => {
        const CONFIRM = 'confirm'
        vscode.window.showErrorMessage(msg, { modal: true }, CONFIRM).then((res) => {
            if (res == CONFIRM) {
                fun()
            }
        })
    }

    // exec sql
    private _exec = (sql: string): void => {
        if (sql != '') {
            current.query<mysql.RowDataPacket[]>(sql).then(res => {
                if (/^show create/i.test(sql)) {
                    this._viewMessage('showCreate', { 'node': current.info, 'table': res[0]['Create Table'] })
                } else if (/^show/i.test(sql)) {
                    this._viewMessage('show', { 'node': current.info, 'show': res })
                } else if (/^desc/i.test(sql)) {
                    this._viewMessage('desc', { 'node': current.info, 'desc': res })
                } else {
                    this._viewMessage('other', { 'node': current.info, 'table': res })
                }
                console.log(res);
            }).catch(e => {
                vscode.window.showErrorMessage(String(e))
            })
        }
    }

    // create webviewPanel
    private _getView = (show: boolean = true): void => {
        if (webviewPanel === undefined) {
            webviewPanel = vscode.window.createWebviewPanel(
                'webview',
                "vs-Database",
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                }
            );
            webviewPanel.webview.html = utils.getWebViewContent(this.context, 'mysql.html')
            webviewPanel.onDidDispose(() => {
                webviewPanel = undefined;
            });
            webviewPanel.webview.onDidReceiveMessage(msg => {
                switch (msg.event) {
                    case 'exec':
                        console.log(msg);
                        this._exec(msg.sql)
                        return;
                }
            }, undefined, this.context.subscriptions);
            webviewPanel.onDidChangeViewState(e => console.log(e)

            )
            this.context.subscriptions.push(webviewPanel);
        }
        if (show) {
            webviewPanel.reveal();
        }
    }

    // post message to webviewPanel
    private _viewMessage = (event: string, data?: any): void => {
        if (webviewPanel) {
            data = data ? data : {}
            webviewPanel.webview.postMessage({ 'event': event, 'data': data });
        } else {
            vscode.window.showErrorMessage('Please open a mysql table to execute a sql statement.')
        }
    }

    // add connection callback
    addConnection = (): void => {
        let newConn: MysqlInfo = { host: "", port: 0, user: "", conn: undefined }
        let optionHost = {
            password: false,
            ignoreFocusOut: true,
            placeHolder: 'HOST',
            prompt: 'MySql hostname',
            validateInput: function (text: string) {
                if (!text) {
                    return 'Please input mysql hostname';
                }
                return;
            }
        }
        let optionPort = {
            password: false,
            ignoreFocusOut: true,
            placeHolder: 'PORT',
            prompt: 'MySql port',
            validateInput: function (text: string) {
                if (!text) {
                    return 'Please input mysql port';
                }
                return;
            }
        }
        let optionUser = {
            password: false,
            ignoreFocusOut: true,
            placeHolder: 'USER',
            prompt: 'MySql user',
            validateInput: function (text: string) {
                if (!text) {
                    return 'Please input mysql user';
                }
                return;
            }
        }
        let optionPassword = {
            password: true,
            ignoreFocusOut: true,
            placeHolder: 'PASSWORD',
            prompt: 'MySql password'
        }
        vscode.window.showInputBox(optionHost).then(value => {
            let host = <string>value
            newConn.host = host.trim()
            vscode.window.showInputBox(optionPort).then(value => {
                let port = Number(value)
                newConn.port = port

                vscode.window.showInputBox(optionUser).then(value => {
                    let user: string = <string>value
                    newConn.user = user.trim()

                    vscode.window.showInputBox(optionPassword).then(value => {
                        let password: string = <string>value
                        newConn.password = password.trim()
                        // if conn
                        this.mysql.configMap.set(`${newConn.host}:${newConn.port}`, newConn)
                        config.setConfig(this.context, VIEW_TITLE, [...this.mysql.configMap])
                        this.mysql.refresh()
                    })
                })
            })
        })
    }

    // refresh tree view
    refreshConnection = (): void => {
        this.mysql.refresh()
    }

    // delete all connection
    deleteAllConnection = (): void => {
        this._showConfirm(`Are you sure you want to delete all MySql connection?`, () => {
            if (this.mysql.configMap) {
                this.mysql.configMap.clear()
            }
            config.setConfig(this.context, VIEW_TITLE, [...this.mysql.configMap])
            this.mysql.refresh()
        })
    }

    // exec
    exec = (node: Dependency): void => {
        this._viewMessage('exec')
    }

    // mysql status todo syntax error
    status = (node: Dependency): void => {
        // status 也不行
        node.query("\\s", '', false).then(res => {
            console.log(res);
        }).catch(e => {
            vscode.window.showErrorMessage(String(e))
        })
    }

    // index
    index = (node: Dependency): void => {
        node.query<mysql.RowDataPacket[]>(`show index from ${node.label}`).then(res => {
            this._getView()
            this._viewMessage('index', { 'node': node.info, 'index': res })
        }).catch(e => {
            vscode.window.showErrorMessage(String(e))
        })
    }

    // show full process
    showProcess = (node: Dependency): void => {
        node.query<mysql.RowDataPacket[]>("show full processlist", '', false).then(res => {
            this._getView()
            this._viewMessage('showProcess', { 'node': node.info, 'process': res })
        }).catch(e => {
            vscode.window.showErrorMessage(String(e))
        })
    }

    // show create table todo
    showCreate = (node: Dependency): void => {
        let sql = `show create table ${node.label}`
        node.query<mysql.RowDataPacket[]>(sql).then(res => {
            this._getView()
            this._viewMessage('showCreate', { 'node': node.info, 'table': res[0]['Create Table'] })
        }).catch(e => {
            vscode.window.showErrorMessage(String(e))
        })
    }

    // info
    info = (node: Dependency): void => {
        let sql = `select * from information_schema.TABLES where TABLE_SCHEMA = '${node.info.db}' and TABLE_NAME = '${node.label}'`
        node.query<mysql.RowDataPacket[]>(sql, '', false).then(res => {
            this._getView()
            this._viewMessage('info', { 'node': node.info, 'info': res })
        }).catch(e => {
            vscode.window.showErrorMessage(String(e))
        })
    }

    // desc table
    desc = (node: Dependency): void => {
        let sql = `desc ${node.label}`
        node.query<mysql.RowDataPacket[]>(sql).then(res => {
            this._getView()
            this._viewMessage('desc', { 'node': node.info, 'desc': res })
        }).catch(e => {
            vscode.window.showErrorMessage(String(e))
        })
    }

    // rename table
    rename = (node: Dependency): void => {
        if (node.isSystem()) {
            if (node.type == config.TYPE_DATABASE) {
                vscode.window.showErrorMessage('You can\'t rename this database')
            } else {
                vscode.window.showErrorMessage('You can\'t rename this table')
            }
            return
        }
        let option = {
            password: false,
            ignoreFocusOut: true,
            placeHolder: 'Table Name',
            prompt: 'Table Name',
            validateInput: function (text: string) {
                if (!text) {
                    return 'Please input table name';
                }
                return;
            }
        }
        vscode.window.showInputBox(option).then(value => {
            let table: string = <string>value
            node.query(`RENAME TABLE ${node.label} TO ${table}`).then(() => {
                this.mysql.refresh(node.parent)
            }).catch(e => {
                vscode.window.showErrorMessage(String(e))
            })
        })
    }

    // truncate table
    truncate = (node: Dependency): void => {
        if (node.isSystem()) {
            vscode.window.showErrorMessage('You can\'t truncate this table')
            return
        }
        this._showConfirm(`Are you sure you want to truncate table "${node.label}"?`, () => {
            node.query(`truncate table ${node.label}`).then(() => {
                vscode.window.showInformationMessage(`Truncate table success`)
            }).catch((e) => {
                vscode.window.showErrorMessage(String(e))
            })
        })
    }

    // delete connection, drop database or drop table
    delete = (node: Dependency): void => {
        switch (node.type) {
            case config.TYPE_MYSQL:
                this._showConfirm(`Are you sure you want to drop connection "${node.label}" ?`, () => {
                    let lable = `${node.info.host}:${node.info.port}`
                    if (!this.mysql.configMap.has(lable)) {
                        vscode.window.showErrorMessage('Failed to delete the MySql connection')
                    } else {
                        this.mysql.configMap.delete(lable)
                        config.setConfig(this.context, VIEW_TITLE, this.mysql.configMap)
                        this.mysql.refresh()
                        vscode.window.showInformationMessage(`Successfully deleted the Mysql connection`)
                    }
                })
                return
            case config.TYPE_DATABASE:
                if (!(node.parent instanceof Dependency)) {
                    return
                }
                if (node.isSystem()) {
                    vscode.window.showErrorMessage('You can\'t drop this database')
                    return
                }
                this._showConfirm(`Are you sure you want to drop database "${node.label}" ?`, () => {
                    node.query(`drop database ${node.label}`, '', false).then(() => {
                        this.mysql.refresh(node.parent)
                    }).catch((e) => {
                        vscode.window.showErrorMessage(String(e))
                    })
                })
                break;
            case config.TYPE_TABLE:
                if (!(node.parent instanceof Dependency)) {
                    return
                }
                if (node.isSystem()) {
                    vscode.window.showErrorMessage('You can\'t drop this table')
                    return
                }
                this._showConfirm(`Are you sure you want to drop table "${node.label}" ?`, () => {
                    node.query(`drop table ${node.label}`).then(() => {
                        this.mysql.refresh(node.parent)
                    }).catch((e) => {
                        vscode.window.showErrorMessage(String(e))
                    })
                })
                break;
            default:
                return;
        }
    }

    // create database
    createDatabase = (node: Dependency): void => {
        let option = {
            password: false,
            ignoreFocusOut: true,
            placeHolder: 'Database',
            prompt: 'Database Name',
            validateInput: function (text: string) {
                if (!text) {
                    return 'Please input database name';
                }
                return;
            }
        }
        vscode.window.showInputBox(option).then(value => {
            let database: string = <string>value
            node.query(`create database ${database}`, '', false).then(() => {
                this.mysql.refresh(node)
            }).catch(e => {
                vscode.window.showErrorMessage(String(e))
            })
        })
    }

    // create table
    createTable = (node: Dependency): void => {
        if (node.isSystem()) {
            vscode.window.showErrorMessage('You can\'t create a table in this database')
        } else {
            this._getView()
            this._viewMessage('createTable', { 'node': node.info })
        }
    }

    // treeview item click callback todo click and expanded, it dosen't working
    clickItem = (node: Dependency): void => {
        // node.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
        // this.getChildren(node)
        // vscode.window.showInformationMessage(node.label)
        if (node.type == config.TYPE_TABLE) {
            this.desc(node)
        }
    }

    // 查了下扩展貌似不支持折叠，TODO
    collapseConnection = (): void => {
        this.mysql.refresh()
    }

}