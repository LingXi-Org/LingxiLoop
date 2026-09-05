/**
 * Error taxonomy of the Agent OS. Every error a layer can surface across a
 * boundary is a named class here, so callers branch on `instanceof` instead
 * of message text.
 */

/** Base class: all Agent OS errors carry a stable machine-readable code. */
export class AgentOSError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
  }
}

// Lease / work lifecycle ----------------------------------------------------

/** The control plane no longer recognizes this (id, fence, token) lease. */
export class LeaseLostError extends AgentOSError {
  constructor(message = 'work lease lost or expired') {
    super('lease_lost', message)
  }
}

/** The run was cancelled (by a human, by preemption, or by shutdown). */
export class RunCancelledError extends AgentOSError {
  constructor(readonly scope: string, message = `run cancelled (${scope})`) {
    super('run_cancelled', message)
  }
}

// Kernel --------------------------------------------------------------------

/** The cell raised: model-visible, recoverable via a correction turn. */
export class KernelExecutionError extends AgentOSError {
  constructor(message: string, readonly cellId: string) {
    super('kernel_execution_failed', message)
  }
}

/** The cell exceeded its wall-clock budget; the kernel was killed. */
export class KernelTimeoutError extends AgentOSError {
  constructor(readonly timeoutMs: number, readonly cellId: string) {
    super('kernel_timeout', `kernel cell exceeded ${timeoutMs}ms and was terminated`)
  }
}

/** The cell was aborted before completion. */
export class KernelCancelledError extends AgentOSError {
  constructor(readonly cellId: string) {
    super('kernel_cancelled', 'kernel cell cancelled')
  }
}

/** The kernel process died or spoke an invalid protocol. */
export class KernelProtocolError extends AgentOSError {
  constructor(message: string) {
    super('kernel_protocol', message)
  }
}

// Host bridge ---------------------------------------------------------------

/** A host action suspended into a human approval; the run must park. */
export class ApprovalPendingError extends AgentOSError {
  constructor(readonly approvalId: string, readonly cellId: string) {
    super('approval_pending', `approval pending: ${approvalId}`)
  }
}

/** The control plane rejected an action the grant does not cover. */
export class CapabilityDeniedError extends AgentOSError {
  constructor(readonly action: string) {
    super('capability_denied', `action not covered by this work item's capability grant: ${action}`)
  }
}

// Model ---------------------------------------------------------------------

export interface ModelDiagnostics {
  status?: number
  finishReasons: string[]
  requestId?: string
  attempts?: number
}

/** The model provider failed or returned a protocol-violating response. */
export class ModelDriverError extends AgentOSError {
  constructor(message: string, readonly diagnostics: ModelDiagnostics, options?: ErrorOptions) {
    super('model_driver', message, options)
  }
}

// Configuration -------------------------------------------------------------

export class ConfigError extends AgentOSError {
  constructor(message: string) {
    super('config', message)
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
