import * as vscode from 'vscode';
import * as path from 'path';
import * as config from './config';

const VIEW_TITLE = 'vsMysql'

export interface MysqlConnection {
    readonly host: string;
    readonly port: string;
    readonly user: string;
    readonly password?: string;
}

export interface MysqlDatabase {
    readonly name: string;
}

export interface MysqlTable {
    readonly name: string;
}

export class MysqlProvider implements vscode.TreeDataProvider<Dependency> {

    private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined> = new vscode.EventEmitter<Dependency | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Dependency | undefined> = this._onDidChangeTreeData.event;

    public context: vscode.ExtensionContext
    public connArr: Array<MysqlConnection>

    constructor(context: vscode.ExtensionContext) {
        this.context = context
        this._getConnConfig()
    }

    private _getConnConfig(): void {
        let connStr: any = this.context.globalState.get('mysql');
        connStr = `[{"host":"127.0.0.1","port":"3306","user":"root"},{"host":"127.0.0.2","port":"3306","user":"root"}]`
        if (connStr) {
            this.connArr = JSON.parse(connStr)
        } else {
            this.connArr = []
        }
        this.connArr = JSON.parse(connStr)
        console.log(this.connArr)
    }

    registerTreeDataProvider(): void {
        vscode.window.registerTreeDataProvider(VIEW_TITLE, this);
    }

    registerCommand(): void {
        vscode.commands.registerCommand(`${VIEW_TITLE}.collapseEntry`, this.collapseCallback);
        vscode.commands.registerCommand(`${VIEW_TITLE}.addEntry`, this.addCallback);
        vscode.commands.registerCommand(`${VIEW_TITLE}.editEntry`, this.editCallback);
        vscode.commands.registerCommand(`${VIEW_TITLE}.deleteEntry`, this.deleteCallback);
    }

    addCallback(): void {
        vscode.window.showInformationMessage(`Successfully called add entry.`)
    }
    editCallback(): void {
        vscode.window.showInformationMessage(`Successfully called edit entry.`)
    }
    deleteCallback(): void {
        vscode.window.showInformationMessage(`Successfully called delete entry.`)
    }
    collapseCallback(): void {
        vscode.window.showInformationMessage(`Successfully called collapse entry.`)
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: Dependency): vscode.TreeItem {
        element.iconPath = element.getIcon();
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

    private _toDep(type: number, obj: MysqlConnection): Dependency
    private _toDep(type: number, obj: string): Dependency
    private _toDep(type: number, obj: MysqlConnection | string): Dependency {
        if (typeof obj == "string") {
            if (type == config.TYPE_TABLE) {
                return new Dependency(obj, type, vscode.TreeItemCollapsibleState.None);
            }
            return new Dependency(obj, type, vscode.TreeItemCollapsibleState.Collapsed);
        } else {
            let label: string = `${obj.host}:${obj.port}`
            return new Dependency(label, type, vscode.TreeItemCollapsibleState.Collapsed);
        }
    }

    private _conn = (): Thenable<Dependency[]> => {
        if (this.connArr) {
            return Promise.resolve(this.connArr.map(conn => this._toDep(config.TYPE_MYSQL, conn)))
        }
        return Promise.resolve([]);
    }


    private _database = (element: Dependency): Thenable<Dependency[]> => {
        // let tableArr: any = element
        let dbArr: Array<string> = ['oea', 'campaign']
        if (dbArr) {
            return Promise.resolve(dbArr.map(db => this._toDep(config.TYPE_DATABASE, db)))
        } else {
            return Promise.resolve([]);
        }
    }

    private _table = (element: Dependency): Thenable<Dependency[]> => {
        // let tableArr: any = element
        let tableArr: Array<string> = ['user', 'tags']
        if (tableArr) {
            return Promise.resolve(tableArr.map(table => this._toDep(config.TYPE_TABLE, table)))
        } else {
            return Promise.resolve([]);
        }
    }
}

export class Dependency extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly type: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.type = type
    }

    get tooltip(): string {
        return `${this.type}`;
    }

    public getIcon() {
        let icon = ""
        switch (this.type) {
            case config.TYPE_MYSQL:
            case config.TYPE_REDIS:
                icon = 'conn.svg'
                break;
            case config.TYPE_DATABASE:
                icon = 'db.svg'
                break;
            case config.TYPE_TABLE:
                icon = 'table.svg'
                break;
        }
        return {
            light: path.join(__filename, '..', '..', 'resources', 'light', icon),
            dark: path.join(__filename, '..', '..', 'resources', 'dark', icon)
        }
    }

    contextValue = 'Dependency';
}
