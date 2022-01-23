import { Field } from "./field";
import { IndirectTableField } from "./indirect-table-field";
import { LinkedTableField } from "./linked-table-field";

export class Table {
  constructor(public name: string) {}

  public primaryKey: Field | LinkedTableField;
  public primitiveFields: Field[] = [];
  public parentFields: LinkedTableField[] = [];
  public oneToManyFields: LinkedTableField[] = [];
  public manyToManyFields: IndirectTableField[] = [];
}