import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
require('dotenv').config();

import { MysqlProvider } from "./providers/mysql";
import { DBProvider } from './providers/provider';

import { Table } from './structure/table';
import { DataTrigger } from './triggers/trigger';
import { RabbitMQTrigger } from './triggers/rabbitmq-trigger';
import { WebhookTrigger } from './triggers/webhook-trigger';


type ComparisonItem = {
  previous?: any;
  current?: any;
}

const backupTableJson = (tableJson: any, filePath: string) => {
    return writeFileSync(filePath, JSON.stringify(tableJson));
}

const compareToBackup = async (currentJson: any, backupFilePath: string, provider: DBProvider) => {
  const backupJson = JSON.parse(readFileSync(backupFilePath, 'utf-8'));
  
  const backupKeys = Object.keys(backupJson);
  const currentKeys = Object.keys(currentJson);
  
  const items: ComparisonItem[] = [];
  for (const existingKey of currentKeys) {
    const item = currentJson[existingKey];
    if (backupKeys.indexOf(existingKey) > -1) {
      const backupItem = backupJson[existingKey];
      if (provider.compareTableDataItem(backupItem, item)) {
        items.push({ previous: backupItem, current: item });
      }
    } else {
      items.push({ previous: null, current: item });
    }
  }

  for (const backupKey of backupKeys) {
    if (currentKeys.indexOf(backupKey) === -1) {
      const backupItem = backupJson[backupKey];
      items.push({ previous: backupItem, current: null });
    }
  }

  return items;
}

const triggerOnChanges = async (table: Table, provider: DBProvider, triggerCallback: DataTrigger) => {
  const backupPath = join(process.env.BKP_FOLDER, `${table.name}.bkp`);
  const currentJson = await provider.listTableData(table);
  if (!existsSync(backupPath)) {
    await backupTableJson(currentJson, backupPath);
    return null;
  }
  const items = await compareToBackup(currentJson, backupPath, provider);
  if (items.length > 0) {
    await backupTableJson(currentJson, backupPath);
    console.log('TRIGGERING: ' + table.name);
    return await triggerCallback(table.name, {
      table: table.name,
      items,
    });
  }
  return null;
}

const mainProvider: DBProvider = (new MysqlProvider({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PWD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306
}));

const trigger: DataTrigger = process.env.TRIGGER_TYPE === 'RabbitMQ' ? RabbitMQTrigger : WebhookTrigger;

const checkForChanges = async () => {
  const tables = process.env.DB_TABLES?.length > 0 ? process.env.DB_TABLES.split(',') : (await mainProvider.listAllTableNames());
  for (const tableName of tables) {
    const table = await mainProvider.readTableMeta(tableName);
    if (table) {
      await triggerOnChanges(table, mainProvider, trigger);
    }
  }
}

checkForChanges().then(() => {
  console.log('Finished');
  process.exit();
}).catch(err => { 
  console.error(err)
  process.exit();
});