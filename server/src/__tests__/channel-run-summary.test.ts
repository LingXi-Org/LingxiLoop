import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readChannelRunSummaries } from '../im/channel-run-summary.js'

// Synthetic metadata only. No runtime, model, network, or native-table access.
const scope = { companyId: 'company', userId: 'human', projectId: 'course' }
const run = (id: string, sessionId = 'room', extra = {}) => ({
  id, identity: { runId: id, tenantId: 'company', principalId: 'human', sessionId, agentId: 'agent' },
  status: 'waiting', requestVersion: 2, fence: 3, createdAt: '2026-10-24T00:00:00Z',
  goalOutcome: { status: 'awaiting_input', requestVersion: 2, verification: 'not_run' }, ...extra,
})
function fixture(options: { channels?: string[]; pages?: unknown[][]; current?: unknown; approval?: unknown; allowed?: boolean; control?: boolean } = {}) {
  const channels = options.channels ?? ['room']
  const calls: object[] = [], reads: string[] = []
  const pages = options.pages ?? [[run('run')]]
  let page = 0
  return { channels, calls, reads, infrastructure: {
    db: { async query(sql: string, values: unknown[]) {
      assert.doesNotMatch(sql, /lingxios\./, 'only formal public runtime reads')
      if (sql.includes('DISTINCT')) return { rows: channels.map(conversation_id => ({ conversation_id, session_id: conversation_id })) }
      if (sql.includes('im_questionnaires')) return { rows: [{ run_id: 'run', request_version: 2, question_id: 'question', principal_id: 'human', submission_nonce: null }] }
      const ids = values[3] as string[]
      return { rows: ids.filter(id => id !== 'unbound').map(run_id => ({ run_id, conversation_id: 'room', session_id: 'room', agent_id: 'agent', principal_id: 'human', thread_id: null })) }
    } },
    runtime: { async listRuns(query: object) {
      calls.push(query)
      if ('status' in query && query.status !== 'waiting') return { items: [], nextCursor: null }
      const items = pages[Math.min(page++, pages.length - 1)]
      return { items, nextCursor: page < pages.length ? String(page) : null }
    }, async readRun() { reads.push('run'); return options.current === undefined ? run('run') : options.current },
    async readApproval() { reads.push('approval'); return options.approval ?? null } },
    can: async (_id: string, action: string) => options.allowed !== false && (action !== 'agent_run:control' || options.control !== false),
  } }
}
test('empty authorized bindings perform zero runtime reads; a single session stays filtered', async () => {
  const empty = fixture({ channels: [] })
  assert.deepEqual(await readChannelRunSummaries(scope, [], empty.infrastructure as never), {})
  assert.equal(empty.calls.length, 0)
  const f = fixture()
  const result = await readChannelRunSummaries(scope, f.channels, f.infrastructure as never)
  assert.equal(result.room?.kind, 'waiting_input')
  assert.equal(result.room?.actor, 'you')
  assert.equal(f.calls.length, 3)
  for (const query of f.calls) assert.deepEqual(Object.assign({}, query, { status: undefined }), {
    tenantId: 'company', principalId: 'human', sessionId: 'room', status: undefined, limit: 100,
  })
})
test('bound metadata cannot leak another tenant/principal/session or an unbound internal run', async () => {
  const f = fixture({ pages: [[run('foreign', 'room', { identity: { ...run('foreign').identity, tenantId: 'other' } }), run('unbound'), run('run')]] })
  const result = await readChannelRunSummaries(scope, f.channels, f.infrastructure as never)
  assert.deepEqual(Object.keys(result), ['room'])
  assert.equal(result.room?.runId, 'run')
  assert.doesNotMatch(JSON.stringify(result), /foreign|unbound|goalOutcome|verification|principalId|question_id/)
})
test('a cancelled or changed-version/fence receipt replaces an old waiting snapshot', async () => {
  for (const current of [run('run', 'room', { status: 'cancelled', goalOutcome: null }), run('run', 'room', { requestVersion: 3, fence: 4, status: 'queued', goalOutcome: null })]) {
    const f = fixture({ current })
    const result = await readChannelRunSummaries(scope, f.channels, f.infrastructure as never)
    assert.notEqual(result.room?.kind, 'waiting_input')
    assert.notEqual(result.room?.actor, 'you')
  }
})
test('resolved approval and missing control permission never advertise a personal decision', async () => {
  const waiting = run('run', 'room', { goalOutcome: { status: 'awaiting_approval', requestVersion: 2, verification: 'not_run', approvalId: 'approval' } })
  const f = fixture({ pages: [[waiting]], current: waiting, approval: { runId: 'run', requestVersion: 2, agentId: 'agent', principalId: 'human', decision: true, approvalId: 'approval' } })
  const result = await readChannelRunSummaries(scope, f.channels, f.infrastructure as never)
  assert.equal(result.room?.kind, 'submitted')
  assert.equal(result.room?.actor, 'system')
  const denied = fixture({ allowed: false })
  assert.deepEqual(await readChannelRunSummaries(scope, denied.channels, denied.infrastructure as never), {})
})
test('pagination has a request-wide hard bound and does not fetch message or event histories', async () => {
  const f = fixture({ channels: ['room', 'unseen'], pages: Array.from({ length: 9 }, (_, n) => [run(`unbound-${n}`, 'elsewhere')]) })
  const result = await readChannelRunSummaries(scope, f.channels, f.infrastructure as never)
  assert.ok(f.calls.length <= 12)
  assert.equal(f.reads.length, 0)
  assert.equal(result.room?.kind, 'unknown')
  assert.equal(result.room?.actor, 'unknown')
})

test('a later relevant active page is found, then older pages stop early', async () => {
  const f = fixture({ channels: ['room'], pages: [[run('unbound', 'elsewhere')], [run('run')], [run('unneeded')]] })
  const result = await readChannelRunSummaries(scope, f.channels, f.infrastructure as never)
  assert.equal(result.room?.kind, 'waiting_input')
  assert.equal(f.calls.length, 4, 'three first pages plus the one necessary waiting continuation')
  assert.equal(f.reads.length, 1, 'only the chosen actual wait is rechecked')
})
test('no proven control means no guessed approval actor; repeat reads do not retain resolved state', async () => {
  const waiting = run('run', 'room', { goalOutcome: { status: 'awaiting_approval', requestVersion: 2, verification: 'not_run', approvalId: 'approval' } })
  const approval = { runId: 'run', requestVersion: 2, agentId: 'agent', principalId: 'human', decision: null as boolean | null, approvalId: 'approval' }
  const f = fixture({ pages: [[waiting]], current: waiting, approval, control: false })
  const first = await readChannelRunSummaries(scope, f.channels, f.infrastructure as never)
  assert.equal(first.room?.kind, 'waiting_approval')
  assert.equal(first.room?.actor, 'unknown')
  approval.decision = true
  const second = await readChannelRunSummaries(scope, f.channels, f.infrastructure as never)
  assert.equal(second.room?.kind, 'submitted')
  assert.equal(f.calls.length, 6, 'each request reads current metadata; no persistent summary cache')
  assert.equal(f.reads.length, 6, 'each approval checks current run, actual receipt and run again')
})
