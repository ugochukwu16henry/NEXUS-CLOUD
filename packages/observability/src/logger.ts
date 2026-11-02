import { redact } from "./redact";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type Logger = {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Returns a logger that adds `bindings` (e.g. correlationId) to every line. */
  child(bindings: LogFields): Logger;
};

export type LoggerOptions = {
  service: string;
  level?: LogLevel;
  /** Where JSON lines go; defaults to stdout/stderr. Tests pass a collector. */
  write?: (line: string, level: LogLevel) => void;
};

function defaultWrite(line: string, level: LogLevel) {
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

/** Structured JSON logger. Every field and message passes through `redact` before it is written. */
export function createLogger(options: LoggerOptions, bindings: LogFields = {}): Logger {
  const minimum = ORDER[options.level ?? "info"];
  const write = options.write ?? defaultWrite;

  function log(level: LogLevel, message: string, fields: LogFields = {}) {
    if (ORDER[level] < minimum) return;
    const entry = redact({
      ...bindings,
      ...fields,
      time: new Date().toISOString(),
      level,
      service: options.service,
      message,
    });
    write(JSON.stringify(entry), level);
  }

  return {
    debug: (message, fields) => log("debug", message, fields),
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fields) => log("error", message, fields),
    child: (more) => createLogger(options, { ...bindings, ...more }),
  };
}
