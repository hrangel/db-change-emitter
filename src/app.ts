import axios from 'axios';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { MysqlProvider } from "./providers/mysql";
import { DBProvider } from './providers/provider';
import { Table } from './structure/meta/table';

require('dotenv').config();

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
      if (provider.areDifferentJson(backupItem, item)) {
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

const triggerOnChanges = async (table: Table, provider: DBProvider, triggerCallback: (data) => Promise<any>) => {
  const backupPath = join(process.env.BKP_FOLDER, `${table.name}.bkp`);
  const currentJson = await provider.rowsToComparisonJson(table);
  if (!existsSync(backupPath)) {
    await backupTableJson(currentJson, backupPath);
    return null;
  }
  const items = await compareToBackup(currentJson, backupPath, provider);
  if (items.length > 0) {
    await backupTableJson(currentJson, backupPath);
    return await triggerCallback({
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
  database: process.env.DB_NAME
}));

const checkForChanges = async () => {
  const triggerUrl = process.env.TRIGGER_URL;
  const tables = process.env.DB_TABLES.split(',');
  for (const tableName of tables) {
    const table = await mainProvider.readTableMeta(tableName);
    await triggerOnChanges(table, mainProvider, (data) => {
      if (triggerUrl?.length > 0) {
        return axios.post(triggerUrl, data);
      } else {
        console.log(table.name, JSON.stringify(data));
      }
      return Promise.resolve(null);
    });
  }
}

checkForChanges().then(() => console.log('Finished')).catch(err => console.error(err));