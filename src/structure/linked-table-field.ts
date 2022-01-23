export class LinkedTableField {
  constructor(public name: string, 
    public foreignTableName: string,
    public foreignPrimaryKey: string) {}
}