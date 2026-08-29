import emojiRegex from 'emoji-regex'
import { findSkypeByShortcode, SKYPE_SHORTCODE_RE } from '@/lib/skypeEmojis'

export type RichToken =
  | { kind: 'text'; value: string }
  | { kind: 'document'; id: string }
  | { kind: 'board'; id: string }
  | { kind: 'card'; id: string }
  | { kind: 'calendar'; id: string }
  | { kind: 'mention'; id: string }
  | { kind: 'msgref'; n: number }
  | { kind: 'bold'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'emoji'; value: string }
  | { kind: 'skype'; name: string }
  | { kind: 'link'; url: string; text: string }

const DOC_REF_TOKEN_RE = /^doc_[A-Za-z0-9]+$/
const BOARD_REF_TOKEN_RE = /^board-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/
const CARD_REF_TOKEN_RE = /^card-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/
const CALENDAR_REF_TOKEN_RE = /^ce-[A-Za-z0-9-]+$/

function splitUnicodeEmoji(segment: string, output: RichToken[]): void {
  if (!segment) return
  const regex = emojiRegex()
  let last = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(segment)) !== null) {
    if (match.index > last) output.push({ kind: 'text', value: segment.slice(last, match.index) })
    output.push({ kind: 'emoji', value: match[0] })
    last = match.index + match[0].length
  }
  if (last < segment.length) output.push({ kind: 'text', value: segment.slice(last) })
}

function splitEmoji(segment: string, output: RichToken[]): void {
  if (!segment) return
  SKYPE_SHORTCODE_RE.lastIndex = 0
  let last = 0
  let match: RegExpExecArray | null
  while ((match = SKYPE_SHORTCODE_RE.exec(segment)) !== null) {
    if (match.index > last) splitUnicodeEmoji(segment.slice(last, match.index), output)
    const skype = findSkypeByShortcode(match[0])
    if (skype) output.push({ kind: 'skype', name: skype.key })
    else output.push({ kind: 'text', value: match[0] })
    last = match.index + match[0].length
  }
  if (last < segment.length) splitUnicodeEmoji(segment.slice(last), output)
}

export function trimUrlTrailing(raw: string): { url: string; trail: string } {
  const closers: Record<string, string> = {
    ')': '(', ']': '[', '}': '{', '>': '<',
    '）': '（', '】': '【', '》': '《', '」': '「', '』': '『',
  }
  let index = raw.length
  while (index > 'https://'.length) {
    const character = raw[index - 1]
    if (/[.,;:!?"'。，、；：！？]/.test(character)) {
      index--
    } else if (closers[character]) {
      const inside = raw.slice(0, index - 1)
      const opens = (inside.match(new RegExp(`\\${closers[character]}`, 'g')) ?? []).length
      const closes = (inside.match(new RegExp(`\\${character}`, 'g')) ?? []).length
      if (closes >= opens) index--
      else break
    } else break
  }
  return { url: raw.slice(0, index), trail: raw.slice(index) }
}

export function parseBody(body: string): RichToken[] {
  const tokens: RichToken[] = []
  const regex = /(`[^`\n]+`|\*\*[^*]+\*\*|\bhttps?:\/\/[^\s<>"'`]+|\bdoc_[A-Za-z0-9]+\b|\bboard-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b|\bcard-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b|\bce-[A-Za-z0-9-]+\b|@[A-Za-z][\w-]*|(?<![A-Za-z0-9_])#\d{1,10}\b)/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(body)) !== null) {
    splitEmoji(body.slice(last, match.index), tokens)
    const token = match[0]
    if (token.startsWith('**')) {
      tokens.push({ kind: 'bold', value: token.slice(2, -2) })
    } else if (token.startsWith('`')) {
      const value = token.slice(1, -1)
      if (DOC_REF_TOKEN_RE.test(value)) tokens.push({ kind: 'document', id: value })
      else if (BOARD_REF_TOKEN_RE.test(value)) tokens.push({ kind: 'board', id: value })
      else if (CARD_REF_TOKEN_RE.test(value)) tokens.push({ kind: 'card', id: value })
      else if (CALENDAR_REF_TOKEN_RE.test(value)) tokens.push({ kind: 'calendar', id: value })
      else tokens.push({ kind: 'code', value })
    } else if (token.startsWith('http')) {
      const { url, trail } = trimUrlTrailing(token)
      tokens.push({ kind: 'link', url, text: url })
      if (trail) splitEmoji(trail, tokens)
    } else if (token.startsWith('doc_')) tokens.push({ kind: 'document', id: token })
    else if (token.startsWith('board-')) tokens.push({ kind: 'board', id: token })
    else if (token.startsWith('card-')) tokens.push({ kind: 'card', id: token })
    else if (token.startsWith('ce-')) tokens.push({ kind: 'calendar', id: token })
    else if (token.startsWith('#')) tokens.push({ kind: 'msgref', n: Number(token.slice(1)) })
    else tokens.push({ kind: 'mention', id: token.slice(1) })
    last = match.index + token.length
  }
  splitEmoji(body.slice(last), tokens)
  return tokens
}

export type BlockToken =
  | { kind: 'prose'; text: string }
  | { kind: 'code-block'; lang: string; code: string }

export function parseBlocks(body: string): BlockToken[] {
  const blocks: BlockToken[] = []
  const regex = /```([a-zA-Z0-9_+\-.#]*)\n([\s\S]*?)```/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(body)) !== null) {
    if (match.index > last) blocks.push({ kind: 'prose', text: body.slice(last, match.index) })
    blocks.push({ kind: 'code-block', lang: match[1] || '', code: match[2].replace(/\n$/, '') })
    last = match.index + match[0].length
  }
  if (last < body.length) blocks.push({ kind: 'prose', text: body.slice(last) })
  if (blocks.length === 0) blocks.push({ kind: 'prose', text: body })
  return blocks
}
