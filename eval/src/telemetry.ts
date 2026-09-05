import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'

export interface Span {
  schemaVersion: 1
  traceId: string
  spanId: string
  parentSpanId?: string
  links?: { traceId: string; spanId: string }[]
  name: 'eval.run' | 'eval.case' | 'eval.sample' | 'eval.model' | 'eval.judge' | 'eval.grader'
  startTimeUnixNano: string
  endTimeUnixNano: string
  status: { code: 'OK' | 'ERROR'; message?: string }
  attributes: Record<string, string | number | boolean>
}
// Compatible with OTLP identifiers/timestamps/attributes; backends own transport and auth.
// Only allowlisted metrics and synthetic identifiers enter this contract, never payloads.
export interface TelemetryBackend { emit(span: Span): void; flush(): Promise<void> }
export const traceId = () => randomBytes(16).toString('hex')
export const spanId = () => randomBytes(8).toString('hex')
export function span(name: Span['name'], trace: string, parent?: string, links?: Span['links']) {
  const started = Date.now()
  const current = spanId()
  return { id: current, end(attributes: Span['attributes'], failure?: string): Span {
    return { schemaVersion: 1, traceId: trace, spanId: current, parentSpanId: parent, links, name,
      startTimeUnixNano: `${started}000000`, endTimeUnixNano: `${Date.now()}000000`,
      status: failure ? { code: 'ERROR', message: failure } : { code: 'OK' }, attributes }
  } }
}

export const modelScope = new AsyncLocalStorage<{ traceId: string; parentSpanId: string; runId: string; caseId: string; sample: number; telemetry: TelemetryBackend }>()
