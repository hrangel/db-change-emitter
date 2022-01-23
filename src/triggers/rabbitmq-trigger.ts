import amqp from 'amqplib';

const baseQueue = process.env.RABBITMQ_FORMAT_QUEUE;
console.log('baseQueue', baseQueue);

const connect = () => {
  const options = process.env.RABBITMQ_CONNECTION ? process.env.RABBITMQ_CONNECTION : {
    protocol: process.env.RABBITMQ_PROTOCOL,
    hostname: process.env.RABBITMQ_HOST,
    port: process.env.RABBITMQ_PORT ? parseInt(process.env.RABBITMQ_PORT) : undefined,
    username: process.env.RABBITMQ_USER,
    password: process.env.RABBITMQ_PASSWORD,
    vhost: process.env.RABBITMQ_VHOST
  };
  return amqp.connect(options);
}

export const RabbitMQTrigger = async (tableName, data) => {
  const conn = await connect();
  const channel = await conn.createChannel();

  const queueName = baseQueue.replace('[TABLE_NAME]', tableName);
  await channel.assertQueue(queueName, { durable: true });
  await channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)));
}