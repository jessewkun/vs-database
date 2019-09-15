import * as vscode from 'vscode';
import * as path from 'path';
import * as config from './config';

const VIEW_TITLE = 'vsMysql'

export interface MysqlInfo {
    host: string;
    port: string;
    user: string;
    password?: string;
    db?: string;
    table?: string
}

export class MysqlProvider implements vscode.TreeDataProvider<Dependency> {

    private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined> = new vscode.EventEmitter<Dependency | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Dependency | undefined> = this._onDidChangeTreeData.event;

    public context: vscode.ExtensionContext
    public configMap: Map<string, MysqlInfo> = new Map()
    public connMap: Map<string, Dependency> = new Map()
    public dbArr: Array<string> = ['oea', 'campaign']
    public tableArr: Array<string> = ['user', 'tags']

    constructor(context: vscode.ExtensionContext) {
        this.context = context
        this._getConnConfig()
    }

    private _getConnConfig(): void {
        let configMap = config.getConfig<Array<Array<any>>>(this.context, VIEW_TITLE)
        if (configMap) {
            let temp = configMap.map(x => [x[0], x[1]] as [string, MysqlInfo]);
            this.configMap = new Map<string, MysqlInfo>(temp)
        }
    }

    registerTreeDataProvider = (): void => {
        vscode.window.registerTreeDataProvider(VIEW_TITLE, this);
    }

    registerCommand = (): void => {
        vscode.commands.registerCommand(`${VIEW_TITLE}.addEntry`, this.addCallback);
        vscode.commands.registerCommand(`${VIEW_TITLE}.collapseEntry`, this.collapseCallback);
        vscode.commands.registerCommand(`${VIEW_TITLE}.deleteAllEntry`, this.deleteAllCallback);
        vscode.commands.registerCommand(`${VIEW_TITLE}.showCreateEntry`, this.showCreateCallback);
        vscode.commands.registerCommand(`${VIEW_TITLE}.renameEntry`, this.renameCallback);
        vscode.commands.registerCommand(`${VIEW_TITLE}.truncateEntry`, this.truncateCallback);
        vscode.commands.registerCommand(`${VIEW_TITLE}.deleteEntry`, this.deleteCallback);
    }

    addCallback = (): void => {
        let newConn: MysqlInfo = { host: "", port: "", user: "" }
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
            let host: string = <string>value
            newConn.host = host.trim()
            vscode.window.showInputBox(optionPort).then(value => {
                let port: string = <string>value
                newConn.port = port.trim()

                vscode.window.showInputBox(optionUser).then(value => {
                    let user: string = <string>value
                    newConn.user = user.trim()

                    vscode.window.showInputBox(optionPassword).then(value => {
                        let password: string = <string>value
                        newConn.password = password.trim()
                        // if conn
                        this.configMap.set(`${newConn.host}:${newConn.port}`, newConn)
                        config.setConfig(this.context, VIEW_TITLE, [...this.configMap])
                        this.refresh()
                    })
                })
            })
        })
    }
    deleteAllCallback = (): void => {
        const confirm = 'Confirm'
        vscode.window.showWarningMessage('Are you sure you want to delete all MySql connection?', { modal: true }, confirm).then(value => {
            if (value == confirm) {
                if (this.configMap) {
                    this.configMap.clear()
                }
                config.setConfig(this.context, VIEW_TITLE, [...this.configMap])
                this.refresh()
            }
        })
    }
    showCreateCallback = (node: Dependency): void => {
        if (node.type != config.TYPE_TABLE) {
            return
        }
        // show create table
        vscode.window.showInformationMessage(`Successfully called showCreate entry.`)
    }
    renameCallback = (): void => {
        vscode.window.showInformationMessage(`Successfully called rename entry.`)
    }
    truncateCallback = (): void => {
        vscode.window.showInformationMessage(`Successfully called truncate entry.`)
    }
    deleteCallback = (node: Dependency): void => {
        switch (node.type) {
            case config.TYPE_MYSQL:
                let lable = `${node.info.host}:${node.info.port}`
                if (!this.configMap.has(lable)) {
                    vscode.window.showErrorMessage('Failed to delete the MySql connection')
                } else {
                    this.configMap.delete(lable)
                    config.setConfig(this.context, VIEW_TITLE, this.configMap)
                    this.refresh()
                    vscode.window.showInformationMessage(`Successfully deleted the Mysql connection`)
                }
                return
            case config.TYPE_DATABASE:
                if (!(node.parent instanceof Dependency)) {
                    return
                }
                node.parent.children.delete(node.label)
                this.dbArr.pop()
                this.refresh()
                break;
            case config.TYPE_TABLE:
                if (!(node.parent instanceof Dependency)) {
                    return
                }
                node.parent.children.delete(node.label)
                this.tableArr.pop()
                this.refresh()
                break;
            default:
                return;
        }
    }
    collapseCallback = (): void => {
        vscode.window.showInformationMessage(`Successfully called collapse entry.`)
    }

    // 指定节点刷新不起作用 TODO
    refresh = (): void => {
        this._onDidChangeTreeData.fire()
    }

    getTreeItem(element: Dependency): vscode.TreeItem {
        element.setIcon();
        return element;
    }

    getChildren(element?: Dependency): Thenable<Dependency[]> {
        if (element) {
            switch (element.type) {
                case config.TYPE_MYSQL:
                    return this._database(element)
                case config.TYPE_DATABASE:
                    return this._table(element)
                default:
                    return Promise.resolve([]);
            }
        } else {
            return this._conn()
        }
    }

    private _toDep(type: number, parent: Dependency | undefined, info: MysqlInfo): Dependency {
        let label = ""
        let CollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        if (info.table) {
            label = info.table
            CollapsibleState = vscode.TreeItemCollapsibleState.None
        } else if (info.db) {
            label = info.db
        } else {
            label = `${info.host}:${info.port}`
        }
        let children = new Map()
        return new Dependency(label, type, info, parent, children, CollapsibleState);
    }

    private _conn = (): Thenable<Dependency[]> => {
        if (this.configMap) {
            let res: Dependency[] = [];
            [...this.configMap].forEach(([label, conn]) => {
                let dep = this._toDep(config.TYPE_MYSQL, undefined, conn)
                res.push(dep)
                this.connMap.set(label, dep)
            })
            return Promise.resolve(res)
        }
        return Promise.resolve([]);
    }

    private _database = (element: Dependency): Thenable<Dependency[]> => {
        // let tableArr: any = element
        if (this.dbArr) {
            let info = Object.assign({}, element.info);
            this.dbArr.forEach(db => {
                info.db = db
                let dep = this._toDep(config.TYPE_DATABASE, element, info)
                element.children.set(db, dep)
            });
            return Promise.resolve([...element.children.values()])
        } else {
            return Promise.resolve([]);
        }
    }

    private _table = (element: Dependency): Thenable<Dependency[]> => {
        // let tableArr: any = element
        if (this.tableArr) {
            let info = Object.assign({}, element.info);
            this.tableArr.forEach(table => {
                info.table = table
                let dep = this._toDep(config.TYPE_TABLE, element, info)
                element.children.set(table, dep)
            });
            return Promise.resolve([...element.children.values()])
        } else {
            return Promise.resolve([]);
        }
    }
}

export class Dependency extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly type: number,
        public info: MysqlInfo,
        public parent: Dependency | undefined,
        public children: Map<string, Dependency>,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }

    public isEqualElement(element: MysqlInfo): boolean {
        switch (this.type) {
            case config.TYPE_MYSQL:
                return element.host == this.info.host && element.port == this.info.port
            case config.TYPE_DATABASE:
                return this.info.db == element.db
            case config.TYPE_TABLE:
                return this.info.table == element.table
            default:
                return false;
        }
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
}
