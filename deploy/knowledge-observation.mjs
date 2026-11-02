const MCP_URL = 'https://admin.lingxilearn.cn/api/mcp'
const MCP_READ_TOOL = 'lingxiloop_agent_run_operations'
const RESPONSE_LIMIT = 256 * 1024

export function knowledgeObservationRunId(args) {
  if (args.length !== 1 || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,499}$/.test(args[0])) {
    throw new Error('knowledge-observe requires exactly one run ID; no deployment options are accepted')
  }
  return args[0]
}

const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null

/** The published read API does not expose frozen root limits or partial-call
 * rejection reservations. Never manufacture them from elapsed time or usage. */
export function publicRunBudgetObservation(value, runId) {
  const run = value?.run
  if (!run || run.id !== runId || !Number.isSafeInteger(run.requestVersion) || run.requestVersion < 1
    || !Number.isSafeInteger(run.fence) || run.fence < 1) throw new Error('run observation identity unavailable')
  const usage = value.usage ?? {}
  return {
    status: 'observed', runId, requestVersion: run.requestVersion, fence: run.fence,
    lifecycle: ['queued', 'leased', 'waiting', 'succeeded', 'partial', 'blocked', 'failed', 'cancelled'].includes(run.status) ? run.status : 'unknown',
    budgetExhaustionReported: run.goalOutcome?.gaps?.includes('Model call, token, cost or execution-time budget exhausted') === true,
    usage: Object.fromEntries(['calls', 'pendingCalls', 'estimatedCalls', 'inputTokens', 'outputTokens', 'costMicros'].map(key => [key, count(usage[key])])),
    trigger: { status: 'unknown', reason: 'published_api_has_no_root_rejection_reader' },
    frozenRootLimits: { status: 'unknown', reason: 'published_api_has_no_root_budget_reader' },
  }
}

async function boundedJson(response) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('response unavailable')
  const chunks = []; let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > RESPONSE_LIMIT) throw new Error('response limit')
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export async function observePublicRunBudget(runId, { token, fetchImpl = fetch, timeoutMs = 20_000 } = {}) {
  if (!token?.trim()) return { status: 'unavailable', code: 'existing_mcp_identity_missing' }
  try {
    // The maximum cursor excludes tool payloads/public text. Only the existing
    // metadata/usage reader is called; no generic MCP dispatch is exposed.
    const response = await fetchImpl(MCP_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { authorization: `Bearer ${token.trim()}`, 'content-type': 'application/json', accept: 'application/json', 'MCP-Protocol-Version': '2025-03-26' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: MCP_READ_TOOL,
        arguments: { runId, afterSeq: Number.MAX_SAFE_INTEGER } } }),
    })
    if (!response.ok) return { status: 'unavailable', code: response.status === 401 || response.status === 403 ? 'existing_identity_not_authorized' : 'public_reader_unavailable' }
    const rpc = await boundedJson(response)
    if (rpc.error || rpc.result?.isError) throw new Error('public reader failed')
    const block = rpc.result?.content?.find(item => item.type === 'text')
    if (typeof block?.text !== 'string') throw new Error('public reader response unavailable')
    return publicRunBudgetObservation(JSON.parse(block.text), runId)
  } catch { return { status: 'unavailable', code: 'public_reader_unavailable' } }
}

/** Fixed read adapters only: no image build/pull, convergence, migrations,
 * startup resolver, model execution, mutation command or retry is reachable. */
export async function knowledgeObservation(runId, { notebook, worker, runBudget }) {
  const entries = [['notebook', () => notebook()], ['workerA', () => worker('a')], ['workerB', () => worker('b')], ['runBudget', () => runBudget(runId)]]
  const results = await Promise.allSettled(entries.map(([, read]) => Promise.resolve().then(read)))
  const observations = Object.fromEntries(results.map((result, index) => [entries[index][0],
    result.status === 'fulfilled' ? result.value : { status: 'unavailable', code: 'observation_unavailable' }]))
  return { format: 'knowledge-readonly-observation/v1', observationOnly: true,
    status: Object.values(observations).every(value => value?.status === 'observed') ? 'observed' : 'partial',
    observedAt: new Date().toISOString(), runId, ...observations }
}
