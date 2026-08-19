import { getBloubIdentity, getBloubState } from '@/lib/agentVisualState'
import type { Participant } from '@/types'
import { BotEngine } from './engine'
import { EXPRESSION_BY_ID } from './expressions'
import { RAYON } from './repere'
import { COLOR_BY_ID, SHAPE_BY_ID } from './skins'

const cache = new Map<string, string>()
const VIEWBOX = 142

/** A DOM-free Bloub snapshot for places such as contenteditable mention chips,
 * where mounting a React avatar is impossible. Transparent eye cut-outs let
 * the chip's own background show through in both themes. */
export function staticBloubAvatarUrl(participant: Pick<Participant, 'id' | 'status'>): string {
  const key = `${participant.id}:${participant.status}`
  const cached = cache.get(key)
  if (cached) return cached

  const identity = getBloubIdentity(participant)
  const shape = SHAPE_BY_ID.get(identity.shape)?.radii ?? null
  const expression = EXPRESSION_BY_ID.get(identity.expression) ?? null
  const ink = COLOR_BY_ID.get(identity.color)?.hex ?? '#3b93f0'
  const engine = new BotEngine(RAYON, getBloubState(participant.status), shape, expression)
  const frame = engine.sample(0.9)
  const eyes = frame.eyes
    .map((eye) => `<path d="${eye.d}" transform="${eye.matrix}" opacity="${eye.alpha}" fill="#000"/>`)
    .join('')
  const notch = frame.notch
    ? `<circle cx="${frame.notch.x}" cy="${frame.notch.y}" r="${frame.notch.r}" fill="#000"/>`
    : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-${VIEWBOX} -${VIEWBOX} ${VIEWBOX * 2} ${VIEWBOX * 2}"><defs><mask id="m" maskUnits="userSpaceOnUse" x="-${VIEWBOX}" y="-${VIEWBOX}" width="${VIEWBOX * 2}" height="${VIEWBOX * 2}"><path d="${frame.bodyPath}" fill="#fff"/>${eyes}${notch}</mask></defs><g mask="url(#m)" opacity="${frame.bodyAlpha}"><rect x="-${VIEWBOX}" y="-${VIEWBOX}" width="${VIEWBOX * 2}" height="${VIEWBOX * 2}" fill="${ink}"/></g></svg>`
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`
  cache.set(key, url)
  return url
}
