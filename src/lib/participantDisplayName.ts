import type { Participant } from '../types'

// The six stable preset identities from learning/preset.ts and migration 0027.
// Names alone never establish built-in identity; custom and renamed agents stay intact.
const presetNames: Record<string, string> = {
  nova: '司南', sage: '明理', milo: '砺思', trace: '溯源', scout: '寻知', forge: '成器',
}
type Identity = Pick<Participant, 'name'> & Partial<Pick<Participant, 'kind' | 'presetKey'>>

export function participantDisplayName(participant: Identity): string {
  const key = participant.kind === 'agent' ? participant.presetKey : null
  return key && Object.hasOwn(presetNames, key) && participant.name.toLowerCase() === key
    ? presetNames[key] : participant.name
}

/** Historical English mentions resolve only for an unchanged built-in preset. */
export function participantMentionNames(participant: Identity): string[] {
  const key = participant.kind === 'agent' ? participant.presetKey : null
  const current = participantDisplayName(participant)
  return key && Object.hasOwn(presetNames, key) && presetNames[key] === current ? [current, key] : [current]
}
