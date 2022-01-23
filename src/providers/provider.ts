import { Table } from "../structure/table";

export interface DBProvider {
  readTableMeta(tableName: string) : Promise<Table>;
  listAllTableNames() : Promise<string[]>;
  
  listTableData(table: Table): Promise<{ [key: string]: any }>;
  compareTableDataItem(item1, item2): boolean;
}