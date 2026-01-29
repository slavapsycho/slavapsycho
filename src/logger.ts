export type LogLevel = "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const write = (level: LogLevel, message: string, context: LogContext = {}): void => {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

export const logger = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
