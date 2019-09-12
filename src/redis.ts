import * as vscode from 'vscode';
import * as path from 'path';
import * as config from './config';

const VIEW_TITLE = 'vsRedis'

interface RedisConnection {
    readonly host: string;
    readonly port: string;
    readonly password?: string;
}

export class RedisProvider implements vscode.TreeDataProvider<Dependency> {

    private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined> = new vscode.EventEmitter<Dependency | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Dependency | undefined> = this._onDidChangeTreeData.event;

    public context: vscode.ExtensionContext

    constructor(context: vscode.ExtensionContext) {
        this.context = context
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
                case config.TYPE_REDIS:
                    return this._database(element)
                case config.TYPE_DATABASE:
                    return this._keys(element)
                default:
                    return Promise.resolve([]);
            }
        } else {
            return this._conn()
        }
    }

    private _toDep(type: number, obj: RedisConnection): Dependency
    private _toDep(type: number, obj: string): Dependency
    private _toDep(type: number, obj: RedisConnection | string): Dependency {
        if (typeof obj == "string") {
            if (type == config.TYPE_KEY) {
                return new Dependency(obj, type, vscode.TreeItemCollapsibleState.None);
            }
            return new Dependency(obj, type, vscode.TreeItemCollapsibleState.Collapsed);
        } else {
            let label: string = `${obj.host}:${obj.port}`
            return new Dependency(label, type, vscode.TreeItemCollapsibleState.Collapsed);
        }
    }

    private _conn = (): Thenable<Dependency[]> => {
        // let connArrStr: any = this.context.globalState.get('mysql');
        let mysqlconnArr: Array<RedisConnection> = [{ host: '127.0.0.1', port: "3306" }, { host: '127.0.0.2', port: "3306" }]
        if (mysqlconnArr) {
            return Promise.resolve(mysqlconnArr.map(conn => this._toDep(config.TYPE_REDIS, conn)))
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

    private _keys = (element: Dependency): Thenable<Dependency[]> => {
        // let keysArr: any = element
        let keysArr: Array<string> = ['user', 'tags']
        if (keysArr) {
            return Promise.resolve(keysArr.map(key => this._toDep(config.TYPE_KEY, key)))
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
            case config.TYPE_REDIS:
                icon = 'conn.svg'
                break;
            case config.TYPE_DATABASE:
                icon = 'db.svg'
                break;
            case config.TYPE_KEY:
                icon = 'item.svg'
                break;
        }
        return {
            light: path.join(__filename, '..', '..', 'resources', 'light', icon),
            dark: path.join(__filename, '..', '..', 'resources', 'dark', icon)
        }
    }

    contextValue = 'Dependency';
}
