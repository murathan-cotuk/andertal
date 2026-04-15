const isDev = process.env.NODE_ENV !== "production";

let logger;

try {
  const pino = require("pino");
  logger = pino({
    level: process.env.LOG_LEVEL || "info",
    ...(isDev && {
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
      },
    }),
    ...(!isDev && {
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    }),
  });
} catch {
  // Fallback if pino not yet installed
  const noop = () => {};
  logger = {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: noop,
    fatal: console.error,
    child: () => logger,
  };
}

module.exports = logger;
