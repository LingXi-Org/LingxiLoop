/**
 * Benchmark harness — runs a `Scenario` (see ./types.ts) end-to-end:
 *
 *   1. Create a fresh group conversation including the scenario's members.
 *   2. Insert the human seed message + publish to CH_MESSAGE_NEW (this is
 *      the same SSE fanout the daemon sees from a real human posting).
 *   3. Poll the messages table for new posts; stop early on natural
 *      termination (scenario-defined) or wall-clock timeout.
 *   4. Hand the final state to `computeMetrics` (per trial).
 *   5. After N trials, apply `passCriterion` over all trial metrics.
 *
 * The harness DOES NOT spawn agents — they're expected to already be
 * running (on the operator's machine via `npx lingxiloop agent computer`,
 * or on the cloud pod-agent infra). It just creates the test convo and
 * watches what happens, exactly like a real human would.
 *
 * Environment:
 *   - DATABASE_URL — postgres connection string (same one lingxiloop server uses)
 *   - REDIS_URL    — redis connection string (for the CH_MESSAGE_NEW publish)
 *   - BENCH_USER   — participant id of the "human" who drives scenarios
 *                    (this is a real participant row; if not set, the
 *                    runner errors out at startup)
 *   - BENCH_COMPANY — company id the test convo is created under
 *
 * Cost note: the harness does ZERO LLM calls itself. All cost comes from
 * the agents the scenarios wake. See ../README.md for budget guidance.
 */

import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import Redis from 'ioredis'
import type { Scenario, TrialMetrics, BenchmarkResult, TrialContext, TrialMessage } from './types.ts'

const CH_MESSAGE_NEW = 'lingxiloop:message.new'

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`bench: required env var ${name} is unset`)
  return v
}

function envOptional(name: string): string | null {
  return process.env[name] || null
}

/** Wait until a condition holds OR the wall-clock budget is exhausted.
 *  Returns 'natural' if `condition` returned true; 'timeout' otherwise. */
async function pollUntil(
  pool: Pool,
  conversationId: string,
  timeoutMs: number,
  condition: (messages: TrialMessage[]) => boolean | Promise<boolean>,
  pollIntervalMs: number = 4000,
): Promise<{ result: 'natural' | 'timeout'; messages: TrialMessage[] }> {
  const deadline = Date.now() + timeoutMs
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const messages = await loadMessages(pool, conversationId)
    if (await condition(messages)) return { result: 'natural', messages }
    if (Date.now() >= deadline) return { result: 'timeout', messages }
    await new Promise((r) => setTimeout(r, pollIntervalMs))
  }
}

async function loadMessages(pool: Pool, conversationId: string): Promise<TrialMessage[]> {
  const { rows } = await pool.query<{
    sequence: number; author_id: string; body: string; kind: string; created_at: Date
  }>(
    `SELECT sequence, author_id, body, kind, created_at FROM messages WHERE conversation_id = $1 ORDER BY sequence ASC`,
    [conversationId],
  )
  return rows.map((r) => ({
    sequence: r.sequence,
    authorId: r.author_id,
    body: r.body,
    kind: (r.kind === 'text' || r.kind === 'tool' || r.kind === 'notice' || r.kind === 'system') ? r.kind : 'text',
    createdAt: r.created_at.toISOString(),
  }))
}

async function createConvoOnly(
  pool: Pool,
  scenario: Scenario,
  benchUser: string,
  benchCompany: string,
): Promise<string> {
  const convoId = `g-${randomUUID().slice(0, 8)}`
  const memberIds = [benchUser, ...scenario.agents.map((a) => a.id)]
  await pool.query(
    `INSERT INTO conversations (id, company_id, kind, title, members, created_at, updated_at)
     VALUES ($1, $2, 'group', $3, $4::jsonb, NOW(), NOW())`,
    [convoId, benchCompany, `bench ${scenario.id} ${new Date().toISOString().slice(11, 19)}`, JSON.stringify(memberIds)],
  )
  await pool.query(
    `INSERT INTO conversation_counters (conversation_id, next_sequence) VALUES ($1, 2)`,
    [convoId],
  )
  return convoId
}

async function postSeed(
  pool: Pool,
  redis: Redis,
  scenario: Scenario,
  convoId: string,
  benchUser: string,
  benchCompany: string,
): Promise<void> {
  const msgId = `m-${randomUUID()}`
  await pool.query(
    `INSERT INTO messages (id, conversation_id, author_id, kind, body, sequence, company_id)
     VALUES ($1, $2, $3, 'text', $4, 1, $5)`,
    [msgId, convoId, benchUser, scenario.seed, benchCompany],
  )
  await redis.publish(CH_MESSAGE_NEW, JSON.stringify({
    type: 'message.new',
    conversationId: convoId,
    companyId: benchCompany,
    message: {
      id: msgId, conversationId: convoId, authorId: benchUser,
      kind: 'text', body: scenario.seed, sequence: 1,
      createdAt: new Date().toISOString(),
    },
  }))
}

/** Run all trials for one scenario, return aggregated result. */
export async function runScenario(scenario: Scenario): Promise<BenchmarkResult> {
  const pool = new Pool({ connectionString: env('DATABASE_URL'), max: 4 })
  const redis = new Redis(env('REDIS_URL'))
  const benchUser = env('BENCH_USER')
  const benchCompany = env('BENCH_COMPANY')

  const lingxiloopVersion = envOptional('LINGXILOOP_DAEMON_VERSION') ?? 'unknown'
  const serverSha = envOptional('LINGXILOOP_SERVER_SHA') ?? 'unknown'

  const trialMetrics: TrialMetrics[] = []
  try {
    for (let t = 0; t < scenario.trials; t++) {
      const tStart = Date.now()
      const scratch: Record<string, unknown> = {}
      // Step 1: create the convo (members fixed) but DON'T post the seed yet.
      const conversationId = await createConvoOnly(pool, scenario, benchUser, benchCompany)
      // Step 2: per-scenario setup (kanban: create board/card; werewolf:
      // any pre-game state). Runs against the empty convo.
      if (scenario.setupTrial) {
        await scenario.setupTrial({ pool, conversationId, benchCompany, benchUser, scratch })
      }
      // Step 3: post the seed + publish fanout. NOW agents wake.
      await postSeed(pool, redis, scenario, conversationId, benchUser, benchCompany)

      console.log(`[bench] ${scenario.id} trial ${t + 1}/${scenario.trials} convo=${conversationId} timeout=${scenario.timeoutMs}ms`)

      const { result, messages } = await pollUntil(
        pool, conversationId, scenario.timeoutMs,
        async (msgs) => {
          if (msgs.length < 2) return false  // need at least one agent post
          const probe = await scenario.computeMetrics({
            scenario, conversationId, messages: msgs,
            terminated: 'natural', durationMs: Date.now() - tStart,
            scratch, pool,
          })
          return probe.complete
        },
      )

      const durationMs = Date.now() - tStart
      const ctx: TrialContext = {
        scenario, conversationId, messages,
        terminated: result, durationMs,
        scratch, pool,
      }
      const metrics = await scenario.computeMetrics(ctx)
      metrics.durationMs = durationMs
      trialMetrics.push(metrics)

      console.log(`[bench] ${scenario.id} trial ${t + 1} ${result} in ${(durationMs / 1000).toFixed(1)}s: complete=${metrics.complete} posts=${metrics.totalPosts} contributors=${metrics.uniqueContributors} dups=${metrics.verbatimCollisions}`)
    }
  } finally {
    await pool.end()
    redis.disconnect()
  }

  const verdict = scenario.passCriterion(trialMetrics)
  return {
    scenarioId: scenario.id,
    ranAt: new Date().toISOString(),
    lingxiloopVersion,
    serverSha,
    trials: trialMetrics,
    verdict,
  }
}
