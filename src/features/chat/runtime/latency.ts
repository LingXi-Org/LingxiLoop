type Sample = { sentAt?: number; previewAt?: number; receivedAt?: number; visible?: boolean; sourceRef?: string;
  resets: number; disconnects: number; frame?: number; paintMs: number[] }
const requests = new Map<string, number>()
const runs = new Map<string, Sample>()
type ReadyStage = 'composer_ready' | 'history_visible'
let navigation: { conversationId: string; startedAt: number; done: Set<ReadyStage>; frames: Map<ReadyStage, number> } | undefined
let firstNavigation = true

function capture(timing: Record<string, unknown>) {
  if (typeof window !== 'undefined' && import.meta.env?.VITE_PUBLIC_POSTHOG_KEY) {
    void import('@/lib/observability').then(({ posthog }) => posthog.capture('chat_latency', timing)).catch(() => {})
  }
}

function sample(runId: string): Sample {
  let value = runs.get(runId)
  if (!value) {
    if (runs.size >= 128) {
      const oldest = runs.keys().next().value!, frame = runs.get(oldest)?.frame
      if (frame !== undefined) cancelAnimationFrame(frame)
      runs.delete(oldest)
    }
    value = { resets: 0, disconnects: 0, paintMs: [] }; runs.set(runId, value)
  }
  return value
}

/** Content-free timing on one browser's monotonic clock; never subtract server timestamps. */
function report(runId: string, stage: string, detail: Record<string, string | number> = {}) {
  const value = sample(runId), now = performance.now()
  const timing = { runId, sourceRef: value.sourceRef, stage, resets: value.resets, disconnects: value.disconnects,
    ...(value.sentAt !== undefined ? { sinceSendMs: now - value.sentAt } : {}),
    ...(value.previewAt !== undefined ? { sincePreviewMs: now - value.previewAt } : {}), ...detail }
  performance.measure('lingxiloop.chat.latency', { start: now, duration: 0, detail: timing })
  performance.clearMeasures('lingxiloop.chat.latency')
  if (!['preview', 'body_painted'].includes(stage)) capture(timing)
}

export const chatLatency = {
  opened(conversationId: string | null) {
    if (navigation?.conversationId === conversationId) return
    if (navigation) for (const frame of navigation.frames.values()) cancelAnimationFrame(frame)
    navigation = conversationId ? { conversationId, startedAt: firstNavigation ? 0 : performance.now(), done: new Set(), frames: new Map() } : undefined
    if (conversationId) firstNavigation = false
  },
  ready(conversationId: string, stage: ReadyStage, node: HTMLElement) {
    const opening = navigation
    if (!opening || opening.conversationId !== conversationId || opening.done.has(stage) || opening.frames.has(stage)) return () => {}
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        opening.frames.delete(stage)
        const rect = node.getBoundingClientRect()
        if (navigation !== opening || !node.isConnected || document.visibilityState !== 'visible'
          || rect.bottom <= 0 || rect.top >= innerHeight || !rect.width) return
        opening.done.add(stage)
        const now = performance.now(), timing = { stage, durationMs: now - opening.startedAt }
        const name = `lingxiloop.chat.${stage}`
        performance.clearMeasures(name)
        performance.measure(name, { start: opening.startedAt, end: now, detail: timing })
        capture(timing)
      })
      opening.frames.set(stage, frame)
    })
    opening.frames.set(stage, frame)
    return () => { cancelAnimationFrame(frame); opening.frames.delete(stage) }
  },
  send(sourceRef: string) {
    if (requests.size >= 128) requests.delete(requests.keys().next().value!)
    requests.set(sourceRef, performance.now())
  },
  submitted(sourceRef: string) {
    const sentAt = requests.get(sourceRef)
    if (sentAt === undefined) return
    performance.measure('lingxiloop.chat.latency', { start: sentAt, end: performance.now(),
      detail: { sourceRef, stage: 'im_submitted', durationMs: performance.now() - sentAt } })
    performance.clearMeasures('lingxiloop.chat.latency')
  },
  bind(runId: string, sourceRef: string) {
    Object.assign(sample(runId), { sourceRef, sentAt: requests.get(sourceRef) })
    report(runId, 'run_available')
  },
  preview(runId: string, seq: number, characters: number) {
    const value = sample(runId)
    if (characters > 0) value.receivedAt ??= performance.now()
    if (characters > 0 && value.previewAt === undefined) { value.previewAt = performance.now(); report(runId, 'preview', { seq, characters }) }
  },
  painted(runId: string, node: HTMLElement) {
    const value = sample(runId)
    if (value.frame !== undefined) return
    value.frame = requestAnimationFrame(() => {
      value.frame = requestAnimationFrame(() => {
        value.frame = undefined
        const rect = node.getBoundingClientRect()
        if (!node.isConnected || document.visibilityState !== 'visible' || !node.textContent?.trim()
          || rect.bottom <= 0 || rect.top >= innerHeight || !rect.width) return
        if (value.receivedAt !== undefined) {
          const durationMs = performance.now() - value.receivedAt
          value.receivedAt = undefined
          if (value.paintMs.length < 256) value.paintMs.push(durationMs)
          report(runId, 'body_painted', { durationMs })
        }
        if (!value.visible) { value.visible = true; report(runId, 'first_body_visible') }
      })
    })
  },
  reset(runId: string, reason: string) { sample(runId).resets++; report(runId, 'reset', { reason }) },
  disconnected(runId: string) { sample(runId).disconnects++; report(runId, 'disconnect') },
  completed(runId: string) {
    const sorted = [...sample(runId).paintMs].sort((a, b) => a - b)
    report(runId, 'completed', { paintSamples: sorted.length, ...(sorted.length ? { receiveToPaintP95Ms: sorted[Math.ceil(sorted.length * .95) - 1] } : {}) })
  },
  clear() {
    for (const value of runs.values()) if (value.frame !== undefined) cancelAnimationFrame(value.frame)
    requests.clear(); runs.clear()
    chatLatency.opened(null)
    firstNavigation = false
  },
}
