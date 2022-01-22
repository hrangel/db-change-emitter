export class IndirectTableField {
  constructor(public name: string, 
    public tableName: string,
    public finalFieldName: string,
    public finalForeignTableName: string,
    public finalForeignPrimaryKey: string) {}
}