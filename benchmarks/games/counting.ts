/**
 * Counting benchmark — the "explicit one-per-person cap" capability.
 *
 * This is the SHAPE-DUAL of the chain benchmark. The human explicitly caps
 * each member at ONE number ("从1开始数，每人只能说一个，不重复").
 * Where the chain test exercises "team adapts: lap to cover absence", the
 * counting test exercises the OPPOSITE — agents must respect the explicit
 * per-person cap and NOT lap, even if it means the sequence is short.
 *
 * What this test exercises:
 *   - WHAT COUNTS AS A PER-PERSON CAP principle (the explicit "每人只能
 *     说一个" IS a cap; agents who already said a number must NOT say
 *     another one even when the sequence isn't "done").
 *   - ▸YOU triage rule (server-side cerebellum filters re-wakes on
 *     conversations where the agent has already used their slot).
 *   - Sequence-correctness preflight (seq-baseline catches the classic
 *     "Marcus posts 3 after seeing Iris post 3" race).
 *
 * Configurable inputs:
 *   - BENCH_COUNTING_AGENTS — same shape as chain.
 *   - BENCH_COUNTING_TIMEOUT_MS — wall-clock budget per trial.
 *   - BENCH_COUNTING_TRIALS — number of independent trials.
 */

import type { Scenario, TrialMetrics } from '../lib/types.ts'

const DEFAULT_AGENTS = 'atlas-e346,bram-a520,ethan-caldwell,iris-7c5e,marcus-reed,nova-877e,olivia-hart'

function envInt(name: string, dflt: number): number {
  const v = process.env[name]
  if (!v) return dflt
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : dflt
}
function envStr(name: string, dflt: string): string {
  return process.env[name] || dflt
}

const agentIds = envStr('BENCH_COUNTING_AGENTS', DEFAULT_AGENTS).split(',').map((s) => s.trim()).filter(Boolean)
// Olivia is typically the broken-codex agent in the test rig — she counts
// against the expected sequence-LENGTH for cap purposes (the rule said
// "every agent says ONE", and a member-who-can't-respond doesn't release
// other agents from the cap). The test will count how many agents
// actually contributed and judge against the explicit rule.

function parseIntStrict(s: string): number | null {
  const trimmed = s.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

function computeMetrics(ctx: Parameters<Scenario['computeMetrics']>[0]): TrialMetrics {
  const agentPosts = ctx.messages
    .filter((m) => m.sequence > 1 && m.kind === 'text')
    .filter((m) => !m.body.startsWith('{'))

  // Parse numbers per agent; ignore non-numeric posts as not relevant
  // (acks, greetings, etc.). Group by author.
  const numbersByAuthor = new Map<string, number[]>()
  for (const m of agentPosts) {
    const n = parseIntStrict(m.body)
    if (n === null) continue
    if (!numbersByAuthor.has(m.authorId)) numbersByAuthor.set(m.authorId, [])
    numbersByAuthor.get(m.authorId)!.push(n)
  }

  // The chronological number sequence: extract ALL number-posts in order
  // (skipping non-numeric chatter) so we can check monotonic-by-1.
  const numberSeq: Array<{ authorId: string; n: number }> = []
  for (const m of agentPosts) {
    const n = parseIntStrict(m.body)
    if (n === null) continue
    numberSeq.push({ authorId: m.authorId, n })
  }

  // Sequence correctness: starts at 1, each subsequent = prev + 1.
  let inOrder = 0
  for (let i = 0; i < numberSeq.length; i++) {
    if (numberSeq[i]!.n === i + 1) inOrder++
    else break
  }

  // Rule-violation: any agent who posted more than ONE number violates
  // the explicit cap. THIS is the test the ▸YOU triage rule + the
  // process-descriptor cap-clarification are supposed to prevent.
  const capViolators = [...numbersByAuthor.entries()].filter(([_, ns]) => ns.length > 1)

  // Verbatim collision: same number posted by two agents in adjacent posts.
  let verbatimCollisions = 0
  for (let i = 1; i < numberSeq.length; i++) {
    if (numberSeq[i]!.n === numberSeq[i - 1]!.n) verbatimCollisions++
  }

  // Define "complete": the sequence reached at least N distinct contributors
  // where N is the EXPECTED roster size (active agents). We can't know
  // who's reachable in advance, so we accept any prefix 1..K where K =
  // unique contributors, and judge no violations.
  const uniqueContributors = numbersByAuthor.size
  const sequenceLength = inOrder  // longest correct prefix
  const complete = capViolators.length === 0 && sequenceLength === uniqueContributors && sequenceLength >= 3

  return {
    complete,
    durationMs: ctx.durationMs,
    totalPosts: agentPosts.length,
    uniqueContributors,
    verbatimCollisions,
    extra: {
      numberSequenceLength: sequenceLength,
      maxNumberReached: numberSeq.length > 0 ? Math.max(...numberSeq.map((x) => x.n)) : 0,
      capViolators: capViolators.map(([id, ns]) => ({ id, numbers: ns })),
      participated: [...numbersByAuthor.keys()],
    },
  }
}

export const countingScenario: Scenario = {
  id: 'counting',
  description: 'Each agent says exactly ONE number, sequential 1..K. Tests respect for explicit per-person caps (anti-lap).',
  agents: agentIds.map((id) => ({ id })),
  seed: '大家好，玩个简单游戏：从 1 开始数，按到达的顺序一个个往上加。规则：**每个人只能说一个数字**，不能重复，不能跳号。',
  timeoutMs: envInt('BENCH_COUNTING_TIMEOUT_MS', 8 * 60_000),
  trials: envInt('BENCH_COUNTING_TRIALS', 3),
  computeMetrics,
  passCriterion: (all) => {
    if (all.length === 0) return { pass: false, reason: 'no trials ran' }
    const completed = all.filter((m) => m.complete).length
    const rate = completed / all.length
    // Total cap-violations across all trials (the failure mode this game
    // is for). One violator in one trial is acceptable noise; more than
    // that across the sample fails.
    const violations = all.reduce<number>((acc, m) => {
      const v = m.extra?.capViolators as Array<unknown> | undefined
      return acc + (Array.isArray(v) ? v.length : 0)
    }, 0)
    if (rate < 2 / 3) {
      return { pass: false, score: rate, reason: `completion rate ${(rate * 100).toFixed(0)}% < 67% floor` }
    }
    if (violations > 1) {
      return { pass: false, score: rate, reason: `${violations} cap violations across ${all.length} trials — agents are lapping when explicitly forbidden` }
    }
    return { pass: true, score: rate }
  },
}
