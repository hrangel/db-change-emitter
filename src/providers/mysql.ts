import mysql, { RowDataPacket } from "mysql2";

import { Field } from "../structure/field";
import { LinkedTableField } from "../structure/linked-table-field";
import { Table } from "../structure/table";

import { IndirectTableField } from "../structure/indirect-table-field";
import { DBProvider } from "./provider";

const objectKeysToLowerCase = (origObj): any => {
  return Object.keys(origObj).reduce(function (newObj, key) {
      let val = origObj[key];
      let newVal = (typeof val === 'object') ? objectKeysToLowerCase(val) : val;
      newObj[key.toLowerCase()] = newVal;
      return newObj;
  }, {});
}

export class MysqlProvider implements DBProvider {
  private db: any;
  constructor(private connectionParams: any) {
    this.db = mysql.createConnection(this.connectionParams);
  }

  private getResult(query, args): Promise<RowDataPacket[]> {
    return new Promise((resolve, reject) => {
      this.db.query(
        query,
        args,
        (err, result, fields) => {
          if (err) { return reject(err) };
    
          resolve(result);
        }
      );
    })
  }

  private getColumns(tableName: string) {
    return this.getResult(`SHOW COLUMNS FROM ${tableName}`, null);
  }

  private getForeignKeys(tableName: string) {
    const query = `
      SELECT 
        TABLE_NAME,COLUMN_NAME,CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM
        INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE
        REFERENCED_TABLE_SCHEMA = ? AND
        TABLE_NAME = ?`
    return this.getResult(query, [ this.connectionParams.database, tableName ]);
  }

  private getExternalForeignKeys(tableName: string) {
    const query = `
      SELECT 
        TABLE_NAME,COLUMN_NAME,CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM
        INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE
        REFERENCED_TABLE_SCHEMA = ? AND
        REFERENCED_TABLE_NAME = ?`
    return this.getResult(query, [ this.connectionParams.database, tableName ]);
  }

  private async isManyToMany(row: RowDataPacket) {
    if ((await this.getForeignKeys(row.TABLE_NAME)).length !== 2) {
      return false;
    }
    const columnsLength = (await this.getColumns(row.TABLE_NAME)).length;
    return (columnsLength === 2 || columnsLength === 3);
  }

  private async readPrimitiveFields(tableName: string): Promise<Field[]> {
    const columns = (await this.getColumns(tableName));
    const foreignKeys = (await this.getForeignKeys(tableName));

    return columns.filter(row => foreignKeys.filter(i => i.COLUMN_NAME === row.Field).length === 0)
      .map((row) => new Field(row.Field, row.Type));
  }

  private async readParentFields(tableName: string): Promise<LinkedTableField[]> {
    return (await this.getForeignKeys(tableName))
      .map((row) => new LinkedTableField(row.COLUMN_NAME, row.REFERENCED_TABLE_NAME, row.REFERENCED_COLUMN_NAME));
  }

  private async readOneToManyChildrenFields(tableName: string): Promise<LinkedTableField[]> {
    const rows = (await this.getExternalForeignKeys(tableName));
    const oneToManyRows = [];
    for (const row of rows) {
      if (!(await this.isManyToMany(row))) {
        const primaryFieldName = (await this.getResult(`SHOW KEYS FROM ${row.TABLE_NAME} WHERE Key_name = 'PRIMARY'`, null))[0].Column_name;
        oneToManyRows.push(new LinkedTableField(row.COLUMN_NAME, row.TABLE_NAME, primaryFieldName));
      }
    }
    return oneToManyRows;
  }

  private async readManyToManyChildrenFields(tableName: string): Promise<IndirectTableField[]> {
    const rows = (await this.getExternalForeignKeys(tableName));
    const manyToManyFields = [];
    for (const row of rows) {
      if (await this.isManyToMany(row)) {
        const otherForeignKeys = (await this.getForeignKeys(row.TABLE_NAME))
          .filter(i => i.REFERENCED_TABLE_NAME !== tableName && i.REFERENCED_COLUMN_NAME !== row.COLUMN_NAME);
        manyToManyFields.push({ middleRow: row, finalRow: otherForeignKeys[0] });
      }
    }
    return manyToManyFields.map((item) => new IndirectTableField(
      item.middleRow.COLUMN_NAME, item.middleRow.TABLE_NAME,
      item.finalRow.COLUMN_NAME, item.finalRow.REFERENCED_TABLE_NAME, item.finalRow.REFERENCED_COLUMN_NAME));
  }

  async listAllTableNames(): Promise<string[]> {
    return (await this.getResult('SELECT table_name FROM information_schema.tables WHERE table_schema = ?', this.connectionParams.database)).map(row => objectKeysToLowerCase(row).table_name);
  }

  async readTableMeta(tableName: string) : Promise<Table> {
    const table: Table = new Table(tableName);

    const primaryFields = await this.getResult(`SHOW KEYS FROM ${tableName} WHERE Key_name = 'PRIMARY'`, null);
    if (!primaryFields || primaryFields.length === 0) {
      console.log('NO PRIMARY FIELDS for table: ' + tableName);
      return null;
    }
    const primaryFieldName = primaryFields[0].Column_name;
    table.primitiveFields = await this.readPrimitiveFields(tableName);
    table.parentFields = await this.readParentFields(tableName);
    table.primaryKey = table.primitiveFields.find(i => i.name === primaryFieldName) || 
      table.parentFields.find(i => i.name === primaryFieldName);
    table.oneToManyFields = await this.readOneToManyChildrenFields(tableName);
    table.manyToManyFields = await this.readManyToManyChildrenFields(tableName);

    return table;
  }

  public async listTableData(table: Table) {
    const rows = await this.getResult(`SELECT * FROM ${table.name}`, []);
    const rowsMap = { };
    for (const row of rows) {
      const primaryKeyValue = row[table.primaryKey.name];
      rowsMap[`key-${primaryKeyValue}`] = row;
      row.nested = {};
      if (table.parentFields.length > 0) {
        for (const field of table.parentFields) {
          const parents =  await this.getResult(`SELECT * FROM ${field.foreignTableName} WHERE ${field.foreignPrimaryKey} = ?`, [ row[field.name] ])
          if (parents.length > 0) {
            row.nested[field.name] = parents[0];
          }
        }
      }
      if (table.oneToManyFields.length > 0) {
        for (const field of table.oneToManyFields) {
          const innerQuery = `SELECT * FROM ${field.foreignTableName} WHERE ${field.name} = ?`;
          row.nested[field.foreignTableName] = await this.getResult(innerQuery, [ primaryKeyValue ]);
        }
      }
      if (table.manyToManyFields.length > 0) {
        for (const field of table.manyToManyFields) {
          const manyQuery = `
            SELECT  t2.* 
            FROM    ${field.tableName} t1
                    INNER JOIN ${field.finalForeignTableName} t2 ON t1.${field.finalFieldName} = t2.${field.finalForeignPrimaryKey}
            WHERE   t1.${field.name} = ?
          `;
          row.nested[field.finalForeignTableName] = await this.getResult(manyQuery, [ primaryKeyValue ]);
        }
      }
    }
    return rowsMap;
  }

  public compareTableDataItem(item1, item2) {
    const baseCopy = { ...item1 };
    const auxCopy = { ...item2 };
    delete baseCopy.nested;
    delete auxCopy.nested;
    return JSON.stringify(baseCopy) !== JSON.stringify(auxCopy);
  }

}