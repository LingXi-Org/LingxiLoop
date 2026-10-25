import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { classifyToolFailure, createLogger, releaseVersions, type Logger } from '@lyyzka/lingxios'

const safeRunId = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/
const errorNameValues = ['UnknownError', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'URIError', 'EvalError',
  'AggregateError', 'AbortError', 'TimeoutError', 'DOMException', 'DatabaseError', 'NoEffectError', 'ForbiddenError', 'HttpError',
  'AgentOSError', 'HostRequestError', 'ControlPlaneError', 'ModelDriverError', 'ModelBudgetExceededError',
  'ModelContextBudgetError', 'HardLimitExceededError', 'LeaseLostError', 'RunCancelledError'] as const
const errorNames = new Set<string>(errorNameValues)
const systemCodeValues = ['EACCES', 'EPERM', 'ENOENT', 'ENOSPC', 'EROFS', 'EISDIR', 'ENOTDIR', 'ELOOP', 'EMFILE', 'ENFILE'] as const
const systemCodes = new Set<string>(systemCodeValues)
const sqlClasses = new Set(['00', '01', '02', '03', '08', '09', '0A', '0B', '0F', '0L', '0P', '0Z', '20', '21', '22',
  '23', '24', '25', '26', '27', '28', '2B', '2D', '2F', '34', '38', '39', '3B', '3D', '3F', '40', '42', '44', '53',
  '54', '55', '57', '58', '72', 'F0', 'HV', 'P0', 'XX'])
// Only these known source names can cross the boundary; absolute directories,
// function names and arbitrary stack text never become diagnostic fields.
const runtimeModules = new Set(['memory/semantic.js', 'memory/runtime.js', 'memory/service.js', 'memory/store.js',
  'memory/access.js', 'memory/admission.js', 'memory/history.js', 'memory/evolution.js', 'memory/context.js',
  'memory/forget.js', 'memory/evidence.js', 'control-plane/service.js', 'control-plane/pg-store.js',
  'control-plane/deadline-pool.js', 'control-plane/http-server.js', 'app/index.js', 'model/embeddings.js',
  'model/execution.js', 'runtime/runtime.js', 'host/http-client.js', 'deadline.js'])
const productModules = new Set(['agent-runtime/context.ts', 'agent-runtime/identity.ts', 'agent-runtime/runtime.ts',
  'agent-runtime/attachments.ts', 'agents/tools.ts', 'modules/memory/public.ts', 'modules/memory/configuration.ts',
  'modules/memory/policy.ts', 'modules/learning/runtime.ts', 'modules/learning/homework-tools.ts',
  'modules/learning/teacher-agent-application.ts', 'modules/access/application.ts', 'im/visualize.ts', 'im/wukong.ts',
  'im/messages-application.ts', 'modules/knowledge/runtime.ts', 'modules/access/context-resolver.ts'])
const runtimeSourceRoot = fileURLToPath(new URL('.', import.meta.resolve('@lyyzka/lingxios')))
const productSourceRoot = fileURLToPath(new URL('../', import.meta.url))
const modules = new Set([...runtimeModules].map(name => `lingxios/${name}`).concat([...productModules].map(name => `server/${name}`)))
const sqlStateSchema = z.string().regex(/^[0-9A-Z]{5}$/).refine(value => sqlClasses.has(value.slice(0, 2)))
export const contextFailureDiagnosticSchema = z.object({
  schemaVersion: z.literal(1), correlationId: z.uuid(), runId: z.string().regex(safeRunId), stage: z.literal('context_load'),
  reason: z.enum(['native_rejected', 'tool_cancelled', 'forbidden', 'dependency_blocked', 'not_found', 'budget_limit',
    'tool_contract_changed', 'approval_stale', 'observation_required', 'version_conflict', 'stale_version',
    'invalid_arguments', 'dependency_unavailable']),
  category: z.enum(['authorization', 'not_found', 'budget', 'dependency', 'version', 'invalid_input', 'cancelled', 'unknown']),
  retryable: z.boolean(), errorName: z.enum(errorNameValues),
  causeCode: z.string().refine(value => classifyToolFailure({ diagnostics: {
    category: 'unknown', retryable: false, recovery: 'none', causeCode: value,
  } }, 'execution').diagnostics.causeCode === value).optional(),
  sqlState: sqlStateSchema.optional(),
  httpStatus: z.number().int().min(400).max(599).optional(), systemCode: z.enum(systemCodeValues).optional(),
  frames: z.array(z.object({ module: z.string().refine(value => modules.has(value)), line: z.number().int().positive().safe(),
    column: z.number().int().positive().safe().optional() }).strict()).max(4),
  runtimeVersion: z.string().max(64).regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/),
  serviceCommit: z.string().regex(/^(?:unknown|[a-f0-9]{7,64})$/i),
}).strict().refine(value => !value.retryable || value.category === 'dependency')
export type ContextFailureDiagnostic = z.infer<typeof contextFailureDiagnosticSchema>

function field(value: unknown, key: string): unknown {
  try { return value && typeof value === 'object' ? Reflect.get(value, key) : undefined }
  catch { return undefined }
}

function frames(error: unknown): ContextFailureDiagnostic['frames'] {
  const stack = field(error, 'stack')
  if (typeof stack !== 'string') return []
  const result: ContextFailureDiagnostic['frames'] = []
  for (const text of stack.split('\n')) {
    if (!/^\s*at\s/.test(text)) continue
    const match = /^\s*at (?:[^()\r\n]* \()?((?:file:\/\/\/|\/)[^()\r\n]*?):(\d+)(?::(\d+))?\)?$/.exec(text)
    if (!match) continue
    let source = match[1]
    if (source.startsWith('file:')) {
      try {
        const url = new URL(source)
        if (url.search || url.hash) continue
        source = fileURLToPath(url)
      } catch { continue }
    }
    const runtime = source.startsWith(runtimeSourceRoot) ? source.slice(runtimeSourceRoot.length) : undefined
    const product = source.startsWith(productSourceRoot) ? source.slice(productSourceRoot.length) : undefined
    const module = runtime && runtimeModules.has(runtime) ? `lingxios/${runtime}` : product && productModules.has(product) ? `server/${product}` : undefined
    if (!module) continue
    const line = Number(match[2]), column = match[3] === undefined ? undefined : Number(match[3])
    if (!Number.isSafeInteger(line) || line < 1 || column !== undefined && (!Number.isSafeInteger(column) || column < 1)) continue
    result.push({ module, line, ...(column === undefined ? {} : { column }) })
    if (result.length === 4) break
  }
  return result
}

function safeFailure(error: unknown) {
  const failure = classifyToolFailure(error, 'execution')
  const name = field(error, 'name')
  let sqlState: string | undefined
  let httpStatus: number | undefined
  let systemCode: typeof systemCodeValues[number] | undefined
  const seen = new Set<unknown>()
  for (let current = error, depth = 0; current && depth < 8 && !seen.has(current); depth++) {
    seen.add(current)
    const code = field(current, 'code')
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) && sqlClasses.has(code.slice(0, 2))) {
      sqlState ??= code
    }
    if (typeof code === 'string' && systemCodes.has(code)) systemCode ??= code as typeof systemCodeValues[number]
    const status = field(current, 'status') ?? field(current, 'statusCode')
    if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599) httpStatus ??= status
    current = field(current, 'cause')
  }
  return { reason: failure.code, category: failure.diagnostics.category, retryable: failure.diagnostics.retryable,
    errorName: typeof name === 'string' && errorNames.has(name) ? name : 'UnknownError',
    ...(failure.diagnostics.causeCode ? { causeCode: failure.diagnostics.causeCode } : {}),
    ...(sqlState ? { sqlState } : {}), ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(systemCode ? { systemCode } : {}), frames: frames(error) }
}

export function projectContextFailure(runId: string, error: unknown, serviceCommit = 'unknown'): ContextFailureDiagnostic {
  if (!safeRunId.test(runId)) throw new Error('invalid context diagnostic run identity')
  return contextFailureDiagnosticSchema.parse({ schemaVersion: 1, correlationId: randomUUID(), runId, stage: 'context_load', ...safeFailure(error),
    runtimeVersion: releaseVersions.runtime, serviceCommit: /^[a-f0-9]{7,64}$/i.test(serviceCommit) ? serviceCommit : 'unknown' })
}

function contextRunId(path: unknown): string | undefined {
  if (typeof path !== 'string') return undefined
  const match = /^\/v5\/work\/([^/?#]+)\/context$/.exec(path.split('?')[0])
  if (!match) return undefined
  try {
    const id = decodeURIComponent(match[1])
    return safeRunId.test(id) ? id : undefined
  } catch { return undefined }
}

/** Decorate the public logger before its Error serialization boundary. Child
 * fields stay here so a bound context error cannot escape through a child sink. */
export function createContextDiagnosticsLogger(options: {
  logger?: Logger
  record: (diagnostic: ContextFailureDiagnostic) => Promise<void>
  serviceCommit?: string
}): { logger: Logger; flush: () => Promise<void> } {
  const sink = options.logger ?? createLogger()
  const pending = new Set<Promise<void>>()
  const safeError = (message: string, code: string) => {
    try { sink.error(message, { code }) } catch { /* Logging cannot interrupt the formal HTTP failure response. */ }
  }
  const write = (diagnostic: ContextFailureDiagnostic) => {
    const task = Promise.resolve().then(() => options.record(diagnostic)).catch(() => {
      safeError('context diagnostic write failed', 'context_diagnostic_write_failed')
    }).finally(() => { pending.delete(task) })
    pending.add(task)
  }
  const wrap = (bound: Record<string, unknown>): Logger => {
    const emit = (level: 'debug' | 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>) => {
      if (message === 'control-plane request failed') {
        try {
          const combined = { ...bound, ...fields }
          const runId = level === 'error' ? contextRunId(combined.path) : undefined
          if (runId) {
            const diagnostic = projectContextFailure(runId, combined.error, options.serviceCommit)
            write(diagnostic)
            sink.error(message, { diagnostic })
          } else {
            // The formal control-plane error also covers other routes. Preserve
            // its occurrence without forwarding their raw Error or path/query.
            sink[level](message, { code: 'control_plane_request_failed', ...safeFailure(combined.error) })
          }
        } catch { safeError('context diagnostic projection failed', 'context_diagnostic_projection_failed') }
        return
      }
      sink[level](message, { ...bound, ...fields })
    }
    return { debug: (message, fields) => emit('debug', message, fields), info: (message, fields) => emit('info', message, fields),
      warn: (message, fields) => emit('warn', message, fields), error: (message, fields) => emit('error', message, fields),
      child: fields => wrap({ ...bound, ...fields }) }
  }
  return { logger: wrap({}), async flush() { while (pending.size) await Promise.all([...pending]) } }
}
