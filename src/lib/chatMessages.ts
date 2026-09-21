import { parseMentions } from './mentions'

export function hasBroadcastMention(value: string): boolean {
  return parseMentions(value, []).mentionAll
}
