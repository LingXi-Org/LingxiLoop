import type { Participant, Status } from '@/types'
import type { ExpressionId } from './bloub/expressions'
import type { ColorId, ShapeId } from './bloub/skins'
import type { StateId } from './bloub/states'

export const STATUS_TO_BLOUB_STATE: Record<Status, StateId> = {
  avail: 'idle',
  working: 'orbit',
  thinking: 'thinking',
  waiting: 'notify',
  resting: 'sleep',
}

/** Synthetic Bloub identity used by the broadcast mention. It deliberately
 * lives outside the participant store: @all is a wire token, not a member. */
export const EVERYONE_BLOUB_PARTICIPANT: Participant = {
  id: 'lingxiloop-everyone',
  kind: 'agent',
  name: '所有人',
  role: 'broadcast',
  initial: '@',
  avatarBg: '#1084fe',
  status: 'avail',
}

const SHAPES: ShapeId[] = ['cercle', 'galet', 'squircle', 'capsule', 'triangle', 'hexagone', 'nuage', 'goutte']
const COLORS: ColorId[] = ['bleu', 'violet', 'turquoise', 'orange', 'rose', 'vert', 'ambre', 'rouge']
const EXPRESSIONS: ExpressionId[] = ['neutre', 'attentif', 'curieux', 'heureux', 'fier', 'timide', 'mefiant', 'confus']

export interface BloubIdentity {
  shape: ShapeId
  color: ColorId
  expression: ExpressionId
}

export type StarterPersonaKey = 'nova' | 'sage' | 'milo' | 'trace' | 'scout' | 'forge'

export interface StarterBloubProfile extends BloubIdentity {
  working: StateId
  thinking: StateId
}

export const STARTER_PERSONA_ROLES: Record<StarterPersonaKey, string> = {
  nova: '学习教练 · Study Coach',
  sage: '概念导师 · Concept Tutor',
  milo: '解题陪练 · Problem Coach',
  trace: '错因诊断 · Learning Diagnostician',
  scout: '阅读研究 · Research Guide',
  forge: '实践导师 · Practice Mentor',
}

/**
 * The learning team uses authored identities instead of hash accidents. Keeping
 * the state pairs here also makes the twelve active poses an explicit visual
 * vocabulary: no two starter personas work or think in the same way.
 */
export const STARTER_BLOUB_PROFILES: Record<StarterPersonaKey, StarterBloubProfile> = {
  nova:  { shape: 'goutte',   color: 'ambre',     expression: 'fier',     working: 'orbit', thinking: 'thinking' },
  sage:  { shape: 'hexagone', color: 'orange',    expression: 'attentif', working: 'wide',  thinking: 'egg' },
  milo:  { shape: 'nuage',    color: 'turquoise', expression: 'curieux',  working: 'play',  thinking: 'wink' },
  trace: { shape: 'squircle', color: 'rouge',     expression: 'mefiant',  working: 'alert', thinking: 'hexagon' },
  scout: { shape: 'capsule',  color: 'bleu',      expression: 'timide',   working: 'comet', thinking: 'swirl' },
  forge: { shape: 'triangle', color: 'vert',      expression: 'heureux',  working: 'burst', thinking: 'exclaim' },
}

const STARTER_PERSONA_KEYS = Object.keys(STARTER_BLOUB_PROFILES) as StarterPersonaKey[]

/** The six poses already curated as "this agent is working" animations
 *  across STARTER_BLOUB_PROFILES (orbit/wide/play/alert/comet/burst) —
 *  reused here as the general "working" expression library so a working
 *  agent's avatar cycles through visual variety instead of holding one
 *  pose the whole time it's busy. */
export const WORKING_STATE_POOL: StateId[] = ['orbit', 'wide', 'play', 'alert', 'comet', 'burst']

/** Deterministic per-seed shuffle (splitmix32-style LCG) — same seed always
 *  produces the same sequence within a session, so a re-render doesn't
 *  reshuffle mid-cycle, but different agents (and a reseed between working
 *  spells) see a different order/subset. */
export function pickWorkingStateSequence(seed: number, count: number = 3): StateId[] {
  const pool = [...WORKING_STATE_POOL]
  let s = seed >>> 0
  const next = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, Math.min(Math.max(1, count), pool.length))
}

export function getStarterPersonaKey(participant: Pick<Participant, 'id' | 'role'>): StarterPersonaKey | null {
  const id = participant.id.toLowerCase()
  return STARTER_PERSONA_KEYS.find((key) =>
    (id === key || id.startsWith(`${key}-`)) && participant.role === STARTER_PERSONA_ROLES[key],
  ) ?? null
}

/** FNV-1a keeps an agent's appearance stable without persistence or randomness. */
export function stableParticipantHash(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function getBloubIdentity(participant: Pick<Participant, 'id' | 'role'>): BloubIdentity {
  const personaKey = getStarterPersonaKey(participant)
  if (personaKey) {
    const { shape, color, expression } = STARTER_BLOUB_PROFILES[personaKey]
    return { shape, color, expression }
  }
  const hash = stableParticipantHash(participant.id)
  return {
    shape: SHAPES[hash % SHAPES.length]!,
    color: COLORS[(hash >>> 5) % COLORS.length]!,
    expression: EXPRESSIONS[(hash >>> 11) % EXPRESSIONS.length]!,
  }
}

export function getBloubState(
  participant: Pick<Participant, 'id' | 'role'>,
  status: string | null | undefined,
): StateId {
  const personaKey = getStarterPersonaKey(participant)
  if (personaKey && (status === 'working' || status === 'thinking')) {
    return STARTER_BLOUB_PROFILES[personaKey][status]
  }
  return STATUS_TO_BLOUB_STATE[status as Status] ?? 'idle'
}
