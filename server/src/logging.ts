/** Process-wide console threshold used by the packaged MVP services.
 * Development keeps `info`; deployment sets `warn` to avoid chatty container
 * logs while retaining warnings, failures and security diagnostics. */
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const ranks: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
}

const configured = (process.env.LINGXILOOP_LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'warn' : 'info')).toLowerCase()
const level: LogLevel = configured in ranks ? configured as LogLevel : 'warn'
const threshold = ranks[level]
const noop = (): void => undefined

if (threshold > ranks.debug) console.debug = noop
if (threshold > ranks.info) {
  console.info = noop
  console.log = noop
}
if (threshold > ranks.warn) console.warn = noop
if (threshold > ranks.error) console.error = noop

export const ACTIVE_LOG_LEVEL = level
