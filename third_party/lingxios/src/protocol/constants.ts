/**
 * Protocol-wide constants.
 *
 * Version numbers gate compatibility between independently deployed pieces
 * (control plane, workers, kernels). Bump a version only for a breaking wire
 * change; additive optional fields do not require a bump.
 */

/** Control-plane HTTP API and worker claim protocol. */
export const AGENT_OS_PROTOCOL_VERSION = 2 as const

/** Kernel stdio (NDJSON) protocol between the manager and `kernel/runner.py`. */
export const KERNEL_PROTOCOL_VERSION = 2 as const

/**
 * Each lease attempt of a run owns a disjoint event-sequence range:
 * `((fence - 1) * RUN_SEQUENCE_SPAN, fence * RUN_SEQUENCE_SPAN]`.
 *
 * A retried attempt therefore never collides with — and is never deduplicated
 * against — events persisted by an earlier attempt of the same run.
 */
export const RUN_SEQUENCE_SPAN = 100_000 as const

/** Upper bound applied to any single tool/host payload surfaced to the model. */
export const MAX_TOOL_OUTPUT_CHARS = 8_000 as const

/** Name of the single tool exposed to the model. */
export const IPYTHON_TOOL_NAME = 'ipython' as const

/** Name of the in-kernel SDK module the model calls (`host.<capability>.<method>`). */
export const KERNEL_SDK_MODULE = 'host' as const
