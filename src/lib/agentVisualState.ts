import type { Participant, Status } from '@/types'
import type { ExpressionId } from './bloub/expressions'
import type { ColorId, ShapeId } from './bloub/skins'
import { SEQUENCE, type StateId } from './bloub/states'

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
  nova: '学习规划与协调',
  sage: '概念导师',
  milo: '解题陪练',
  trace: '错因诊断与证据复核',
  scout: '阅读与资料研究',
  forge: '实践与项目导师',
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

/** Bloub's complete 14-state catalogue montage. `swirl` remains excluded
 *  because upstream defines it as an interface transition, not a catalogue
 *  state. Keep a local copy so callers cannot mutate the vendored sequence. */
export const WORKING_STATE_POOL: StateId[] = [...SEQUENCE]

/** Preserve the exact upstream montage order while using the work epoch to
 *  choose its starting frame. A complete pass therefore visits every one of
 *  the 14 catalogue states exactly once before wrapping. */
export function pickWorkingStateSequence(
  seed: number,
  count: number = WORKING_STATE_POOL.length,
): StateId[] {
  const length = WORKING_STATE_POOL.length
  const start = (seed >>> 0) % length
  const montage = WORKING_STATE_POOL.map((_, offset) => (
    WORKING_STATE_POOL[(start + offset) % length]!
  ))
  return montage.slice(0, Math.min(Math.max(1, count), length))
}

/** Mixes the participant identity with a server timestamp or local work-round
 *  key. It is intentionally pure so every avatar instance representing the
 *  same work epoch starts from the same montage frame. */
export function getWorkingEpochSeed(participantId: string, epochKey: string | number): number {
  return stableParticipantHash(`${participantId}\u0000${epochKey}`)
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
