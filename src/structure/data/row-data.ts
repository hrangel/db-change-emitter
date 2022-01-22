import { Field } from "../meta/field";
import { FieldData } from "./field-data";

type FieldMap = {
  [fieldName: string]: FieldData;
}

export class RowData {
  public fieldsData: FieldMap = {};
}