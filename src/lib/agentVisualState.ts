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

/** FNV-1a keeps an agent's appearance stable without persistence or randomness. */
export function stableParticipantHash(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function getBloubIdentity(participant: Pick<Participant, 'id'>): BloubIdentity {
  const hash = stableParticipantHash(participant.id)
  return {
    shape: SHAPES[hash % SHAPES.length]!,
    color: COLORS[(hash >>> 5) % COLORS.length]!,
    expression: EXPRESSIONS[(hash >>> 11) % EXPRESSIONS.length]!,
  }
}

export function getBloubState(status: string | null | undefined): StateId {
  return STATUS_TO_BLOUB_STATE[status as Status] ?? 'idle'
}
