/**
 * Project-wide logger (pino-based, console-compatible API).
 *
 * Why the wrapper:
 *   pino's `logger.info('msg', extra)` does NOT print `extra` unless
 *   `msg` contains a printf placeholder. The codebase uses console-style
 *   multi-argument logging extensively (e.g. `console.warn('x failed:',
 *   err?.message || err)`), so we wrap pino with a small adapter that
 *   formats all extra args the way `console.*` would.
 *
 * Behavior:
 *   - Single string arg → logged as message (pino native).
 *   - Single object arg → logged as structured fields (pino native).
 *   - Multi-arg → all args stringified and joined with spaces, then
 *     passed as one message. Errors keep stack traces.
 *
 * Exported value is the wrapped logger. `.child(bindings)` returns a
 * wrapped child so structured context propagates correctly.
 */

const util = require("util");

const isDev = process.env.NODE_ENV !== "production";

function stringifyArg(arg) {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) {
    return arg.stack ? `${arg.message}\n${arg.stack}` : arg.message;
  }
  if (typeof arg === "object" && arg !== null) {
    try {
      return util.inspect(arg, { depth: 4, breakLength: 200 });
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function formatArgs(args) {
  if (args.length === 0) return "";
  if (args.length === 1) {
    const a = args[0];
    if (typeof a === "string" || (typeof a === "object" && a !== null && !(a instanceof Error))) {
      return a;
    }
    return stringifyArg(a);
  }
  return args.map(stringifyArg).join(" ");
}

function wrap(realLog) {
  const method = (level) => (...args) => {
    if (args.length === 0) {
      realLog[level]();
      return;
    }
    const out = formatArgs(args);
    if (typeof out === "string") {
      realLog[level](out);
    } else {
      realLog[level](out);
    }
  };

  return {
    info: method("info"),
    warn: method("warn"),
    error: method("error"),
    debug: method("debug"),
    fatal: method("fatal"),
    trace: method("trace"),
    child: (bindings) => wrap(realLog.child(bindings || {})),
    level: realLog.level,
    _pino: realLog,
  };
}

let baseLogger;

try {
  const pino = require("pino");
  baseLogger = pino({
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
  const noop = () => {};
  baseLogger = {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: noop,
    fatal: console.error,
    trace: noop,
    child: () => baseLogger,
    level: "info",
  };
}

module.exports = wrap(baseLogger);
