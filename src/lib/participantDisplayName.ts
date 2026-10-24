import type { Participant } from '../types'

// The six stable preset identities from learning/preset.ts and migration 0027.
// Names alone never establish built-in identity; custom and renamed agents stay intact.
const presetNames: Record<string, string> = {
  nova: '司南', sage: '明理', milo: '砺思', trace: '溯源', scout: '寻知', forge: '成器',
}
type Identity = Pick<Participant, 'name'> & Partial<Pick<Participant, 'kind' | 'presetKey' | 'sourceName'>>

/** Agent names are user-selected Chinese display names; human names are never validated here. */
export function isChineseAgentName(name: string): boolean { return /^\p{Script=Han}{1,80}$/u.test(name) }

export function participantDisplayName(participant: Identity): string {
  if (participant.kind !== 'agent') return participant.name
  const key = participant.presetKey, name = participant.sourceName ?? participant.name
  if (key && Object.hasOwn(presetNames, key) && name.toLowerCase() === key) return presetNames[key]
  return isChineseAgentName(name) ? name : '智能助教'
}

/** Historical aliases resolve only through an authorized preset identity, including after rename. */
export function participantMentionNames(participant: Identity): string[] {
  const key = participant.kind === 'agent' ? participant.presetKey : null
  const name = participant.sourceName ?? participant.name
  return key && Object.hasOwn(presetNames, key) ? [...new Set([name,presetNames[key],key])] : [name]
}

/** Display projection only. Preserve the persisted name for historical alias parsing and explicit settings. */
export function presentParticipant<T extends Identity>(participant: T): T & { sourceName?: string } {
  return participant.kind === 'agent' ? { ...participant, sourceName: participant.sourceName ?? participant.name, name: participantDisplayName(participant) } : participant
}
