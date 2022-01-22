import { Table } from "../structure/meta/table";

export interface DBProvider {
  readTableMeta(tableName: string) : Promise<Table>;
  rowsToComparisonJson(table: Table): Promise<{ [key: string]: any }>;
  areDifferentJson(json1, json2): boolean;
}