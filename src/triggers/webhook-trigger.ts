import axios from 'axios';

const triggerUrl = process.env.TRIGGER_URL;
import { readFileSync, existsSync } from 'fs';

type WebhookConfig = {
  fallbackWebhooks: string[];
  tableWebhooks: { [tableName: string]: string };
}

let fallbackWebhooks = triggerUrl?.length > 0 ? [triggerUrl] : [];
let tableWebhooks = {};
const configFilePath = process.env.WEBHOOK_CONFIG;
if (existsSync(configFilePath)) {
  const config = JSON.parse(readFileSync(configFilePath, 'utf-8'));
  fallbackWebhooks = config.fallbackWebhooks || [];
  tableWebhooks = config.tableWebhooks || {};
}


export const WebhookTrigger = async (tableName, data) => {
  const webwooks = tableWebhooks[tableName] || fallbackWebhooks;
  if (webwooks.length > 0) {
    const results = [];
    for (const webwookUrl of webwooks) {
      try {
        results.push(await axios.post(webwookUrl, data));
      } catch (ex) {
        console.error(`Webhook Error ${tableName}: ${webwookUrl}`, ex);
      }
    }
  } else {
    console.log(tableName, JSON.stringify(data));
  }
  return Promise.resolve(null);
}