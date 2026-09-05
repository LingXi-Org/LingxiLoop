/**
 * NDJSON stdio protocol between the kernel manager and `kernel/runner.py`.
 *
 * Framing: one JSON object per line, ASCII-safe (non-ASCII escaped) so the
 * transport is locale-independent (`python -I` ignores PYTHONIOENCODING).
 *
 * Concurrency model: the manager serializes executions per kernel; while an
 * execution is in flight the only messages the manager may write are the
 * `host_result` replies to that execution's `host_call`s. The runner blocks
 * synchronously inside a host call, which is what makes the bridge appear as
 * ordinary synchronous Python to model-authored code.
 */
import type { CapabilityGrant, HostDirective, KernelArtifact } from './types.js'

// Manager → runner ----------------------------------------------------------

export interface KernelExecuteRequest {
  type: 'execute'
  id: string
  code: string
  context: {
    runId: string
    cellId: string
    capabilities: CapabilityGrant[]
  }
}

export interface KernelHostResultMessage {
  type: 'host_result'
  requestId: string
  ok: boolean
  value?: unknown
  error?: string
  approval?: { id: string; status: 'PENDING' }
  directive?: HostDirective
}

export interface KernelShutdownRequest {
  type: 'shutdown'
}

export type ManagerToKernel = KernelExecuteRequest | KernelHostResultMessage | KernelShutdownRequest

// Runner → manager ----------------------------------------------------------

export interface KernelReadyMessage {
  type: 'ready'
  protocol: number
  python: string
  engine: 'ipython' | 'basic'
  home: string
}

export interface KernelHostCallMessage {
  type: 'host_call'
  /** Execution id this call belongs to — required for correlation. */
  id: string
  requestId: string
  callIndex: number
  action: string
  args: Record<string, unknown>
}

export interface KernelExecutionResultMessage {
  type: 'execution_result'
  id: string
  ok: boolean
  stdout: string
  stderr: string
  result: unknown
  error: string | null
  approvalId: string | null
  truncated: boolean
  durationMs: number
  artifacts: KernelArtifact[]
  directives: HostDirective[]
}

export interface KernelProtocolErrorMessage {
  type: 'protocol_error'
  error: string
}

export type KernelToManager =
  | KernelReadyMessage
  | KernelHostCallMessage
  | KernelExecutionResultMessage
  | KernelProtocolErrorMessage
