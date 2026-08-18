/**
 * Chain benchmark — the "N items in order, sequential team relay" capability.
 *
 * Reference state: T10 on 2026-06-03 against cumora@0.1.119 / server commit
 * 75732f7 — see docs/COORDINATION.md "The 2026-06-03 chain-with-absent-member
 * push" for the trail of insights that took this from 5/8 fragile to clean
 * 8/8 with a deliberately-absent member.
 *
 * What this test exercises:
 *   - TEAM ADAPTS WHEN A MEMBER IS ABSENT principle (one member is offline,
 *     remaining team must adapt and someone must lap).
 *   - COUNT THE ITEMS, NOT THE HEADS principle (8 chars > 6 active agents
 *     means lapping is required, not optional).
 *   - compose-anchor + atomic verbatim-dup HOLD (race protection during the
 *     wake burst and again at the tail when multiple agents try to close).
 *   - Stall pipeline + deterministic fallback (re-wakes if the chain stalls
 *     mid-way; classifier-503 case is still covered by the fallback).
 *
 * Configurable inputs:
 *   - BENCH_CHAIN_PHRASE — the N-char target phrase (default 别逗你爻光姐笑了).
 *     Pick something WITHOUT obvious natural-language flow, so the brain has
 *     to use coordination rather than autoregress.
 *   - BENCH_CHAIN_AGENTS — comma-separated agent IDs to include.
 *   - BENCH_CHAIN_ABSENT_AGENT — id of an agent to mark `absent` (still a
 *     member of the convo but expected not to participate). Defaults to
 *     `olivia-hart` (the well-known broken-codex agent in the test rig).
 *   - BENCH_CHAIN_TIMEOUT_MS — wall-clock budget per trial (default 12min).
 *   - BENCH_CHAIN_TRIALS — number of independent trials (default 3).
 */

import type { Scenario, TrialMetrics } from '../lib/types.ts'

const DEFAULT_PHRASE = '别逗你爻光姐笑了'
const DEFAULT_AGENTS = 'atlas-e346,bram-a520,ethan-caldwell,iris-7c5e,marcus-reed,nova-877e,olivia-hart'
const DEFAULT_ABSENT = 'olivia-hart'

function envInt(name: string, dflt: number): number {
  const v = process.env[name]
  if (!v) return dflt
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : dflt
}

function envStr(name: string, dflt: string): string {
  return process.env[name] || dflt
}

const phrase = envStr('BENCH_CHAIN_PHRASE', DEFAULT_PHRASE)
const phraseChars = [...phrase]  // proper code-point iteration for CJK
const agentIds = envStr('BENCH_CHAIN_AGENTS', DEFAULT_AGENTS).split(',').map((s) => s.trim()).filter(Boolean)
const absentAgentId = envStr('BENCH_CHAIN_ABSENT_AGENT', DEFAULT_ABSENT)

function computeMetrics(ctx: Parameters<Scenario['computeMetrics']>[0]): TrialMetrics {
  // Filter to agent posts only (drop the human seed + notice/system).
  const agentPosts = ctx.messages
    .filter((m) => m.sequence > 1 && m.kind === 'text')
    .filter((m) => !m.body.startsWith('{'))  // notice JSON blobs

  const bodies = agentPosts.map((m) => m.body.trim()).filter((b) => b.length > 0)
  const collected = bodies.join('')
  const target = phraseChars.join('')
  const complete = collected === target

  // In-order match: how many leading chars match the target before a
  // mismatch breaks the run.
  let inOrder = 0
  for (let i = 0; i < bodies.length && i < phraseChars.length; i++) {
    if (bodies[i] === phraseChars[i]) inOrder++
    else break
  }

  // Verbatim collisions: any pair of adjacent agent posts with identical body.
  // This is the test the atomic verbatim-dup HOLD is supposed to prevent.
  let verbatimCollisions = 0
  for (let i = 1; i < bodies.length; i++) {
    const prev = bodies[i - 1] ?? ''
    const cur = bodies[i] ?? ''
    if (prev === cur && prev.length > 0) verbatimCollisions++
  }

  const uniqueContributors = new Set(agentPosts.map((m) => m.authorId)).size
  const absentParticipated = agentPosts.some((m) => m.authorId === absentAgentId)

  return {
    complete,
    durationMs: ctx.durationMs,
    totalPosts: agentPosts.length,
    uniqueContributors,
    verbatimCollisions,
    extra: {
      phrase: target,
      collected,
      inOrderCount: inOrder,
      targetCount: phraseChars.length,
      absentAgentId,
      absentParticipated,
      // Names of agents who lapped (>1 post) — useful to spot whether
      // the team-adapts principle fired or whether one agent took all
      // the slack.
      lappers: Object.entries(
        agentPosts.reduce<Record<string, number>>((acc, m) => {
          acc[m.authorId] = (acc[m.authorId] ?? 0) + 1
          return acc
        }, {}),
      ).filter(([_, n]) => n > 1).map(([id]) => id),
    },
  }
}

export const chainScenario: Scenario = {
  id: 'chain',
  description: `${phraseChars.length}-char sequential relay; one member (${absentAgentId}) deliberately absent; team must adapt and lap to complete.`,
  agents: agentIds.map((id) => ({ id, absent: id === absentAgentId })),
  seed: `大家好啊，给你们一个任务，挨个说出：${phrase} 这句话的每一个字，要求必须按照顺序一个个说出来。`,
  timeoutMs: envInt('BENCH_CHAIN_TIMEOUT_MS', 12 * 60_000),
  trials: envInt('BENCH_CHAIN_TRIALS', 3),
  computeMetrics,
  passCriterion: (all) => {
    if (all.length === 0) return { pass: false, reason: 'no trials ran' }
    const completed = all.filter((m) => m.complete).length
    const rate = completed / all.length
    // Pass bar: at least 2/3 of trials must hit exact-match completion AND
    // median verbatim collisions must be 0 (no race-induced dups slipping
    // through). The completion-rate floor is intentionally NOT 100% — LLM
    // judgment is naturally variable; one off-trial shouldn't fail the
    // capability claim. If the floor needs raising, bump trials and
    // tighten the bar simultaneously.
    const sortedDups = [...all].map((m) => m.verbatimCollisions).sort((a, b) => a - b)
    const medianDups = sortedDups[Math.floor(sortedDups.length / 2)] ?? 0
    if (rate < 2 / 3) {
      return { pass: false, score: rate, reason: `completion rate ${(rate * 100).toFixed(0)}% < 67% floor` }
    }
    if (medianDups > 0) {
      return { pass: false, score: rate, reason: `median verbatim-collisions ${medianDups} > 0 (race protection regressed)` }
    }
    return { pass: true, score: rate }
  },
}
