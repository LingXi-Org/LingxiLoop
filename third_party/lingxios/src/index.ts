/**
 * LingxiOS Agent OS — public API.
 *
 * Layering (dependencies point downward only):
 *
 *   worker  ─────►  runtime  ─────►  model / kernel / host ports
 *      │               │
 *      ▼               ▼
 *   control plane ◄── protocol (shared, logic-free)
 */

// Protocol
export * from './protocol/constants.js'
export * from './protocol/types.js'
export * as kernelWire from './protocol/kernel-wire.js'

// Infrastructure
export * from './errors.js'
export { createLogger, nullLogger, type Logger, type LogLevel } from './logging.js'
export { MetricsRegistry } from './metrics.js'
export * from './config.js'

// Model layer
export type * from './model/driver.js'
export { OpenAIChatDriver, sseDataEvents, type OpenAIDriverOptions } from './model/openai.js'

// Kernel layer
export {
  KernelManager,
  type KernelExecutor, type KernelExecutionOptions, type KernelHostBridge,
  type KernelManagerOptions, type HostActionObserver,
} from './kernel/manager.js'

// Host port
export type { HostPort } from './host/port.js'
export { HttpHostClient, HostRequestError, type HttpHostClientOptions } from './host/http-client.js'

// Runtime
export { AgentRuntime, type AgentRuntimeOptions, type WorkProcessor, type WorkProcessorContext } from './runtime/runtime.js'
export {
  DefaultRuntimePolicy,
  type RuntimePolicy, type CompletionGateResult, type RuntimePolicyEvent, type FinalMessageExtension,
} from './runtime/policy.js'
export { CorrectionBudget, type CorrectionCategory } from './runtime/corrections.js'
export {
  compactIfNeeded, estimateTokens, summaryItem, DEFAULT_COMPACTION,
  HardLimitExceededError, type CompactionOptions, type CompactionOutcome,
} from './runtime/compaction.js'
export { parseIPythonArguments, boundedToolOutput } from './runtime/tool.js'

// Control plane
export {
  ControlPlaneService, ControlPlaneError,
  type ControlPlaneDeps, type LeaseProof,
} from './control-plane/service.js'
export { ControlPlaneServer, type ControlPlaneServerOptions } from './control-plane/http-server.js'
export type * from './control-plane/stores.js'
export { isModelItem } from './control-plane/stores.js'
export {
  MemoryWorkStore, MemorySessionStore, MemoryEventStore, MemoryActionLedger, hashToken,
} from './control-plane/memory-store.js'
export {
  PgWorkStore, PgSessionStore, PgEventStore, PgActionLedger,
  type SqlPool, type SqlClient, type SqlQueryable,
} from './control-plane/pg-store.js'

// Worker
export { AgentWorker, type AgentWorkerOptions } from './worker/worker.js'
