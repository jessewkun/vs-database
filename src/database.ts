import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';


const TYPE_MYSQL = 1
const TYPE_REDIS = 2
const TYPE_DATABASE = 3
const TYPE_TABLE = 4

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

interface RedisConnection {
    readonly host: string;
    readonly port: string;
    readonly password?: string;
}

export class MysqlProvider implements vscode.TreeDataProvider<Dependency> {

    private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined> = new vscode.EventEmitter<Dependency | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Dependency | undefined> = this._onDidChangeTreeData.event;

    public context: vscode.ExtensionContext

    constructor(context: vscode.ExtensionContext) {
        this.context = context
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
                case TYPE_MYSQL:
                    return this._database(element)
                case TYPE_DATABASE:
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
            if (type == TYPE_TABLE) {
                return new Dependency(obj, type);
            }
            return new Dependency(obj, type, vscode.TreeItemCollapsibleState.Collapsed);
        } else {
            let label: string = `${obj.host}:${obj.port}`
            return new Dependency(label, type, vscode.TreeItemCollapsibleState.Collapsed);
        }
    }

    private _conn = (): Thenable<Dependency[]> => {
        // let connArrStr: any = this.context.globalState.get('mysql');
        let mysqlconnArr: Array<MysqlConnection> = [{ host: '127.0.0.1', port: "3306", 'user': "root" }, { host: '127.0.0.2', port: "3306", 'user': "root" }]
        if (mysqlconnArr) {
            return Promise.resolve(mysqlconnArr.map(conn => this._toDep(TYPE_MYSQL, conn)))
        }
        return Promise.resolve([]);
    }


    private _database = (element: Dependency): Thenable<Dependency[]> => {
        // let tableArr: any = element
        let dbArr: Array<string> = ['oea', 'campaign']
        if (dbArr) {
            return Promise.resolve(dbArr.map(db => this._toDep(TYPE_DATABASE, db)))
        } else {
            return Promise.resolve([]);
        }
    }

    private _table = (element: Dependency): Thenable<Dependency[]> => {
        // let tableArr: any = element
        let tableArr: Array<string> = ['user', 'tags']
        if (tableArr) {
            return Promise.resolve(tableArr.map(table => this._toDep(TYPE_TABLE, table)))
        } else {
            return Promise.resolve([]);
        }
    }
}

export class Dependency extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly type: number,
        public readonly collapsibleState?: vscode.TreeItemCollapsibleState,
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
            case TYPE_MYSQL:
            case TYPE_REDIS:
                icon = 'conn.svg'
                break;
            case TYPE_DATABASE:
                icon = 'db.svg'
                break;
            case TYPE_TABLE:
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
