import * as mysql from 'mysql2/promise';
import * as vscode from 'vscode';

export interface MySQLConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  password?: string;
}

export class MySQLConnection {
  private connection: mysql.Connection | null = null;
  private config: MySQLConfig;
  private _isConnected: boolean = false;
  private _currentDatabase: string | null = null;
  private _currentTable: string | null = null;

  constructor(config: MySQLConfig) {
    this.config = config;
  }

  async connect(): Promise<boolean> {
    try {
      console.log('Attempting to connect to MySQL...');

      const connectionConfig: mysql.ConnectionOptions = {
        host: this.config.host,
        port: this.config.port,
        user: this.config.user
      };

      // 只有当密码不为空时才添加密码配置
      if (this.config.password) {
        connectionConfig.password = this.config.password;
      }

      this.connection = await mysql.createConnection(connectionConfig);

      // 测试连接
      await this.connection.connect();

      // 验证连接是否成功
      await this.connection.query('SELECT 1');

      this._isConnected = true;
      console.log('MySQL connection successful');
      return true;

    } catch (error) {
      console.error('MySQL connection error:', error);
      this._isConnected = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this._isConnected = false;
      this.connection = null;
    }
  }

  async reconnect(): Promise<boolean> {
    await this.disconnect();
    return this.connect();
  }

  async getDatabases(): Promise<string[]> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    const [rows] = await this.connection.query('SHOW DATABASES');
    return (rows as any[]).map(row => row.Database);
  }

  async createDatabase(name: string, charset: string = 'utf8mb4', collation: string = 'utf8mb4_unicode_ci'): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    try {
      await this.connection.query(
        `CREATE DATABASE \`${name}\` CHARACTER SET = '${charset}' COLLATE = '${collation}'`
      );
    } catch (error) {
      console.error('Create database error:', error);
      throw error;
    }
  }

  async dropDatabase(name: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    await this.connection.query(`DROP DATABASE \`${name}\``);
  }

  async useDatabase(name: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    // 先检查数据库是否存在
    const databases = await this.getDatabases();
    if (!databases.includes(name)) {
      throw new Error(`Unknown database '${name}'`);
    }

    await this.connection.query(`USE \`${name}\``);
    this._currentDatabase = name;
  }

  async useTable(database: string, table: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    try {
      // 先切换到数据库
      await this.useDatabase(database);

      // 检查表是否存在
      const tables = await this.getTables(database);
      if (!tables.includes(table)) {
        throw new Error(`Table '${database}.${table}' doesn't exist`);
      }

      this._currentTable = table;
    } catch (error) {
      console.error('Error in useTable:', error);
      throw error;
    }
  }

  async getTables(database: string): Promise<string[]> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    await this.useDatabase(database);
    const [rows] = await this.connection.query('SHOW TABLES');
    return (rows as any[]).map(row => Object.values(row)[0] as string);
  }

  async getTableStructure(database: string, table: string): Promise<any[]> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    try {
      await this.useTable(database, table);
      const [rows] = await this.connection.query(`SHOW FULL COLUMNS FROM \`${database}\`.\`${table}\``);
      return rows as any[];
    } catch (error) {
      console.error('Error in getTableStructure:', error);
      throw error;
    }
  }

  async getTableIndexes(database: string, table: string): Promise<any[]> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    try {
      await this.useTable(database, table);
      const [rows] = await this.connection.query(`SHOW INDEX FROM \`${database}\`.\`${table}\``);
      return rows as any[];
    } catch (error) {
      console.error('Error in getTableIndexes:', error);
      throw error;
    }
  }

  // 添加通用查询方法
  async query(sql: string, params?: any[]): Promise<any> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    try {
      const [rows] = await this.connection.query(sql, params);
      return rows;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  // 修改 TableWebView 中的消息处理
  async executeQuery(sql: string): Promise<{ columns: string[]; rows: any[] }> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    try {
      const [rows] = await this.connection.query(sql);

      // 获取列名
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      return {
        columns,
        rows: rows as any[]
      };
    } catch (error) {
      console.error('Execute query error:', error);
      throw error;
    }
  }

  async renameTable(database: string, oldName: string, newName: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    await this.useDatabase(database);
    await this.query(`RENAME TABLE \`${oldName}\` TO \`${newName}\``);
  }

  async duplicateTable(database: string, sourceTable: string, newTable: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    await this.useDatabase(database);
    await this.query(`CREATE TABLE \`${newTable}\` LIKE \`${sourceTable}\``);
    await this.query(`INSERT INTO \`${newTable}\` SELECT * FROM \`${sourceTable}\``);
  }

  async truncateTable(database: string, table: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    await this.useDatabase(database);
    await this.query(`TRUNCATE TABLE \`${table}\``);
  }

  async deleteTable(database: string, table: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    await this.useDatabase(database);
    await this.query(`DROP TABLE \`${table}\``);
  }

  async getCreateTableSyntax(database: string, table: string): Promise<string> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    await this.useTable(database, table);
    try {
      const [rows] = await this.connection.query(`SHOW CREATE TABLE \`${table}\``);
      const result = rows as any[];

      if (!result || result.length === 0) {
        throw new Error('Failed to get create table syntax');
      }

      // 打印结果结构以便调试
      console.log('Create Table Result:', result[0]);

      // 尝试所有可能的键名
      const createTableSyntax = result[0]['Create Table'] ||
        result[0]['Create_Table'] ||
        result[0]['CREATE TABLE'] ||
        result[0]['create table'];

      if (!createTableSyntax) {
        console.log('Available keys:', Object.keys(result[0]));
        throw new Error('Create table syntax not found in response');
      }

      return createTableSyntax;
    } catch (error) {
      console.error('Get create table syntax error:', error);
      throw error;
    }
  }

  // 获取服务器变量
  async getServerVariables(): Promise<any[]> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    try {
      const [rows] = await this.connection.query('SHOW VARIABLES');
      return rows as any[];
    } catch (error) {
      console.error('Get server variables error:', error);
      throw error;
    }
  }

  // 获取服务器进程
  async getServerProcesses(): Promise<any[]> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    try {
      const [rows] = await this.connection.query('SHOW PROCESSLIST');
      return rows as any[];
    } catch (error) {
      console.error('Get server processes error:', error);
      throw error;
    }
  }

  async renameDatabase(oldName: string, newName: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    try {
      // MySQL 不支持直接重命名数据库，需要创建新数据库并复制数据
      await this.connection.query(`CREATE DATABASE \`${newName}\``);

      // 获取所有表
      const [tables] = await this.connection.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = ?`, [oldName]);

      // 复制每个表到新数据库
      for (const table of tables as any[]) {
        const tableName = table.table_name;
        await this.connection.query(
          `RENAME TABLE \`${oldName}\`.\`${tableName}\` TO \`${newName}\`.\`${tableName}\``
        );
      }

      // 删除旧数据库
      await this.connection.query(`DROP DATABASE \`${oldName}\``);
    } catch (error) {
      console.error('Rename database error:', error);
      throw error;
    }
  }

  async createTable(database: string, tableName: string, columns: string[]): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }
    try {
      await this.useDatabase(database);
      const columnDefinitions = columns.join(',\n');
      const sql = `CREATE TABLE \`${tableName}\` (\n${columnDefinitions}\n)`;
      await this.connection.query(sql);
    } catch (error) {
      console.error('Create table error:', error);
      throw error;
    }
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  get connectionConfig(): MySQLConfig {
    return this.config;
  }

  get currentDatabase(): string | null {
    return this._currentDatabase;
  }

  get currentTable(): string | null {
    return this._currentTable;
  }

  async getTableInfo(database: string, table: string): Promise<any> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    try {
      // 获取表信息
      const [tableInfo] = await this.connection.query(`
        SELECT
            ENGINE as engine,
            TABLE_COLLATION as collation,
            CHARACTER_SET_NAME as charset,
            CREATE_TIME as create_time,
            UPDATE_TIME as update_time,
            TABLE_ROWS as \`rows\`,
            ROW_FORMAT as row_format,
            AVG_ROW_LENGTH as avg_row_length,
            AUTO_INCREMENT as auto_increment,
            DATA_LENGTH as data_length,
            MAX_DATA_LENGTH as max_data_length,
            INDEX_LENGTH as index_length,
            DATA_FREE as data_free,
            TABLE_COMMENT as comment
        FROM information_schema.TABLES t
        LEFT JOIN information_schema.COLLATION_CHARACTER_SET_APPLICABILITY csa
            ON t.TABLE_COLLATION = csa.COLLATION_NAME
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      `, [database, table]);

      // 获取建表语句
      const [createSyntax] = await this.connection.query(`SHOW CREATE TABLE \`${database}\`.\`${table}\``);

      return {
        ...tableInfo[0],
        create_syntax: createSyntax[0]['Create Table']
      };
    } catch (error) {
      console.error('Get table info error:', error);
      throw error;
    }
  }

  async modifyTableEncoding(database: string, table: string, charset: string, collation: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    try {
      await this.connection.query(`
        ALTER TABLE \`${database}\`.\`${table}\`
        CONVERT TO CHARACTER SET ${charset} COLLATE ${collation}
      `);
    } catch (error) {
      console.error('Modify table encoding error:', error);
      throw error;
    }
  }

  async modifyTableComment(database: string, table: string, comment: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    try {
      await this.connection.query(`
        ALTER TABLE \`${database}\`.\`${table}\`
        COMMENT = ?
      `, [comment]);
    } catch (error) {
      console.error('Modify table comment error:', error);
      throw error;
    }
  }

  async resetAutoIncrement(database: string, table: string, value: number = 1): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected');
    }

    try {
      await this.connection.query(`
        ALTER TABLE \`${database}\`.\`${table}\`
        AUTO_INCREMENT = ?
      `, [value]);
    } catch (error) {
      console.error('Reset auto increment error:', error);
      throw error;
    }
  }
}