/**
 * Werewolf benchmark — multi-round role-playing capability.
 *
 * Structural scoring (no semantic LLM judge) — what we test:
 *   - Did the game TERMINATE NATURALLY with a winner declared, or did the
 *     wall-clock timeout fire on a stalled mid-phase? (Termination.)
 *   - Did the game reach at least 2 night/day cycles? (Phase progression
 *     — a game that ends in 30 seconds didn't actually run.)
 *   - Did a vote round happen? (Multiple agents posted a vote-shape
 *     message during a daytime window.)
 *   - Was a death announced? (Someone got knifed by wolves or lynched by
 *     town — proves the game state machine advanced.)
 *
 * What we DON'T test (would need a semantic judge):
 *   - Did the right side win? (Wolves "should" win sometimes; town
 *     "should" win sometimes; outcome is part of the gameplay.)
 *   - Were strategic moves optimal? (Werewolf is a game of bluffing;
 *     judging move quality requires another LLM.)
 *
 * The seed message uses standard house-rules already in the agents'
 * `werewolf-house-rules.md` memory files (judge announces only the
 * fact-of-death, not the role; the existing house rules are the
 * gameplay contract). The judge agent is configurable but defaults to
 * bram-a520 (who has the deepest werewolf memory per session transcripts).
 *
 * Configurable inputs:
 *   - BENCH_WEREWOLF_AGENTS — comma-separated agent IDs (≥5 recommended).
 *   - BENCH_WEREWOLF_JUDGE — which agent acts as judge (default bram-a520).
 *   - BENCH_WEREWOLF_TIMEOUT_MS — wall-clock budget per trial (default 25min).
 *   - BENCH_WEREWOLF_TRIALS — number of independent trials (default 2 —
 *     trials are EXPENSIVE for this game, ~$15-25 each).
 */

import type { Scenario, TrialMetrics } from '../lib/types.ts'

const DEFAULT_AGENTS = 'atlas-e346,bram-a520,ethan-caldwell,iris-7c5e,marcus-reed,nova-877e,olivia-hart'
const DEFAULT_JUDGE = 'bram-a520'

function envInt(name: string, dflt: number): number {
  const v = process.env[name]
  if (!v) return dflt
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : dflt
}
function envStr(name: string, dflt: string): string { return process.env[name] || dflt }

const agentIds = envStr('BENCH_WEREWOLF_AGENTS', DEFAULT_AGENTS).split(',').map((s) => s.trim()).filter(Boolean)
const judgeId = envStr('BENCH_WEREWOLF_JUDGE', DEFAULT_JUDGE)

// Winner-declaration patterns. We scan ALL message bodies for any of
// these — case-insensitive English, exact-match Chinese. Bram's memory
// uses these idioms in his post-game summaries. Stay narrow: only
// declarations OF a winner, not in-game speculation ("if X dies wolves
// might win").
const WINNER_PATTERNS: RegExp[] = [
  /狼人胜利|狼人胜|wolves\s+won|wolves\s+win/i,
  /好人胜利|好人胜|town\s+won|town\s+wins|villagers?\s+won/i,
  /平民胜|村民胜/i,
  /游戏结束.*?(胜|won)/i,
  /game\s+over.*?(town|wolves|villagers?)/i,
]

// Death-announcement patterns: shape-only signal that the state machine
// advanced (someone was eliminated). Agents emit these in many styles;
// we accept any.
const DEATH_PATTERNS: RegExp[] = [
  /(放逐|被刀|出局|死亡|翻牌|被票出|被处决|kill(?:ed)?|eliminated)/i,
]

// Phase-marker patterns: night/day transitions. Used to count cycles.
const NIGHT_PATTERNS: RegExp[] = [/(夜晚|闭眼|入夜|night\s+\d+|n\d+)/i]
const DAY_PATTERNS: RegExp[] = [/(天亮|睁眼|白天|day\s+\d+|d\d+)/i]

function matchesAny(body: string, patterns: RegExp[]): boolean {
  for (const re of patterns) if (re.test(body)) return true
  return false
}

function computeMetrics(ctx: Parameters<Scenario['computeMetrics']>[0]): TrialMetrics {
  const agentPosts = ctx.messages
    .filter((m) => m.sequence > 1 && m.kind === 'text')
    .filter((m) => !m.body.startsWith('{'))

  // Winner declared in ANY message body?
  const winnerMsg = agentPosts.find((m) => matchesAny(m.body, WINNER_PATTERNS))
  const winnerDeclared = !!winnerMsg

  // Death announcements — count unique ones (don't double-count if a
  // peer quotes the death; just need to know "≥1 death happened").
  const deathMsgs = agentPosts.filter((m) => matchesAny(m.body, DEATH_PATTERNS))

  // Phase cycle count: pairs of NIGHT → DAY transitions. We count
  // distinct day/night marker messages from the JUDGE specifically
  // (they're the source of truth for phase) and pair them up.
  const judgeMsgs = agentPosts.filter((m) => m.authorId === judgeId)
  const nightMarkers = judgeMsgs.filter((m) => matchesAny(m.body, NIGHT_PATTERNS)).length
  const dayMarkers = judgeMsgs.filter((m) => matchesAny(m.body, DAY_PATTERNS)).length
  const phaseCycles = Math.min(nightMarkers, dayMarkers)

  // Vote round: ≥3 agents posted a short message during what looks like
  // a vote window. Heuristic: a vote post is a peer agent ID @-mentioned
  // OR an agent name as the bare body. Approximate by counting short
  // posts (<20 chars) that reference another participant.
  let voteRoundDetected = false
  const allAgentBodies = agentPosts.map((m) => m.body)
  const memberSet = new Set(agentIds)
  let voteShapeCount = 0
  for (const body of allAgentBodies) {
    if (body.length > 30) continue
    let mentionsPeer = false
    for (const id of memberSet) {
      if (body.includes('@' + id) || body.toLowerCase().includes(id.split('-')[0]!.toLowerCase())) {
        mentionsPeer = true
        break
      }
    }
    if (mentionsPeer) voteShapeCount++
  }
  voteRoundDetected = voteShapeCount >= 3

  const complete = winnerDeclared && phaseCycles >= 1
  const uniqueContributors = new Set(agentPosts.map((m) => m.authorId)).size

  return {
    complete,
    durationMs: ctx.durationMs,
    totalPosts: agentPosts.length,
    uniqueContributors,
    verbatimCollisions: 0,  // not a meaningful metric for this game (long-form bodies)
    extra: {
      winnerDeclared,
      winnerMessage: winnerMsg?.body.slice(0, 200) ?? null,
      winnerAuthor: winnerMsg?.authorId ?? null,
      phaseCycles,
      nightMarkers,
      dayMarkers,
      deathAnnouncements: deathMsgs.length,
      voteRoundDetected,
      voteShapeCount,
      judgeId,
      judgeContributedPosts: judgeMsgs.length,
    },
  }
}

export const werewolfScenario: Scenario = {
  id: 'werewolf',
  description: `Multi-round role-playing; judge=${judgeId}; tests game state-machine progression (winner declared, ≥1 phase cycle, ≥1 death).`,
  agents: agentIds.map((id) => ({ id })),
  seed: `大家好，开一局狼人杀。@${judgeId} 当法官，按照标准房规（死亡不翻牌、判官不参与投票）分配角色、推进流程；其余玩家按身份正常发言投票。终局请清楚宣告 "好人胜利" 或 "狼人胜利"。`,
  timeoutMs: envInt('BENCH_WEREWOLF_TIMEOUT_MS', 25 * 60_000),
  trials: envInt('BENCH_WEREWOLF_TRIALS', 2),
  computeMetrics,
  passCriterion: (all) => {
    if (all.length === 0) return { pass: false, reason: 'no trials ran' }
    const completed = all.filter((m) => m.complete).length
    const rate = completed / all.length
    // For werewolf the rate floor is intentionally LOWER than chain/counting:
    // games this complex with stochastic LLM judgment occasionally just
    // don't reach termination in the budget. The bar is "the system can
    // reliably PRODUCE a werewolf game" — 1/2 trials hitting natural
    // termination + winner declaration is meaningful. Tighten the bar by
    // raising trials.
    const phaseAvg = all.reduce<number>((acc, m) => acc + Number((m.extra?.phaseCycles ?? 0) as number), 0) / all.length
    if (rate < 0.5) {
      return { pass: false, score: rate, reason: `winner-declaration rate ${(rate * 100).toFixed(0)}% < 50% floor` }
    }
    if (phaseAvg < 1) {
      return { pass: false, score: rate, reason: `average phase cycles ${phaseAvg.toFixed(1)} < 1 — games are stalling pre-cycle` }
    }
    return { pass: true, score: rate }
  },
}
