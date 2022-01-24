import { createLogger, transports, format } from  'winston';
import  DailyRotateFile from 'winston-daily-rotate-file';

const loggerManager = () => createLogger({
  level: "info",
  exitOnError: true,
  format: format.combine(
    format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss.SSS",
    }),
    format.printf((info) => {
      return JSON.stringify({
        timestamp: info.timestamp,
        level: info.level,
        message: info.message,
      });
    }),
    format.errors({ stack: true }),
    format.json()
  ),
  handleExceptions: true,
  defaultMeta: { service: process.env.LOG_SERVICE_NAME },
  transports: [
    new transports.Console(),
    new DailyRotateFile({
      datePattern: "DD-MM-YYYY",
      dirname: "logs",
      filename: "%DATE%-combined.log",
    }),
  ]
})

const logger = loggerManager();

export default logger;