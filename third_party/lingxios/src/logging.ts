/**
 * Structured JSON-lines logging. Dependency-free by design: one event per
 * line on stderr, machine-parseable, safe to ship to any log pipeline.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
  /** Derive a logger that stamps `fields` onto every event. */
  child(fields: Record<string, unknown>): Logger
}

export interface LoggerOptions {
  level?: LogLevel
  /** Injectable sink for tests; defaults to one JSON line on stderr. */
  sink?: (line: string) => void
}

function serializeField(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, ...(value.stack ? { stack: value.stack } : {}) }
  }
  return value
}

class JsonLogger implements Logger {
  constructor(
    private readonly threshold: number,
    private readonly sink: (line: string) => void,
    private readonly bound: Record<string, unknown>,
  ) {}

  private emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < this.threshold) return
    const event: Record<string, unknown> = { ts: new Date().toISOString(), level, msg, ...this.bound }
    if (fields) for (const [key, value] of Object.entries(fields)) event[key] = serializeField(value)
    try {
      this.sink(JSON.stringify(event))
    } catch {
      // Logging must never take the process down; drop unserializable events.
    }
  }

  debug(msg: string, fields?: Record<string, unknown>): void { this.emit('debug', msg, fields) }
  info(msg: string, fields?: Record<string, unknown>): void { this.emit('info', msg, fields) }
  warn(msg: string, fields?: Record<string, unknown>): void { this.emit('warn', msg, fields) }
  error(msg: string, fields?: Record<string, unknown>): void { this.emit('error', msg, fields) }

  child(fields: Record<string, unknown>): Logger {
    return new JsonLogger(this.threshold, this.sink, { ...this.bound, ...fields })
  }
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? (process.env['AGENT_OS_LOG_LEVEL'] as LogLevel | undefined) ?? 'info'
  const threshold = LEVEL_ORDER[level] ?? LEVEL_ORDER.info
  const sink = options.sink ?? ((line: string) => process.stderr.write(`${line}\n`))
  return new JsonLogger(threshold, sink, {})
}

/** A logger that discards everything — the default in library contexts. */
export const nullLogger: Logger = {
  debug() {}, info() {}, warn() {}, error() {},
  child(): Logger { return nullLogger },
}
