import { fromMarkdown } from 'mdast-util-from-markdown'
import { participantMentionNames } from './participantDisplayName.js'

export interface MentionTarget {
  id: string
  name: string
  kind?: 'agent' | 'human'
  presetKey?: string | null
}

export interface MentionRange {
  id: string
  start: number
  end: number
}

export interface ParsedMentions {
  mentionedIds: string[]
  mentionAll: boolean
}

export interface MentionOptions {
  /** Assistants often format roster handles as inline code. Human examples stay inert. */
  allowInlineCodeMentions?: boolean
}

const WORD = /[\p{L}\p{N}_-]/u
const HAN = /\p{Script=Han}/u
const HORIZONTAL = /[\p{Zs}\t]/u
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const NON_PROSE = new Set(['code', 'inlineCode', 'link', 'image', 'linkReference', 'imageReference', 'definition', 'blockquote', 'html'])

/** Mask Markdown examples and addresses without changing UTF-16 source offsets. */
export function maskNonMentionText(input: string, inlineCodeTargets?: readonly MentionTarget[]): string {
  const chars = input.split('')
  const mask = (start: number, end: number) => chars.fill(' ', start, end)
  const visit = (node: ReturnType<typeof fromMarkdown> | ReturnType<typeof fromMarkdown>['children'][number]): void => {
    if (NON_PROSE.has(node.type)) {
      if (node.type === 'inlineCode' && inlineCodeTargets && node.position) {
        const start = node.position.start.offset!, end = node.position.end.offset!
        const source = input.slice(start, end), delimiter = source.match(/^`+/)![0].length
        if (standaloneMention(source.slice(delimiter, -delimiter), inlineCodeTargets)) {
          mask(start, start + delimiter)
          mask(end - delimiter, end)
          return
        }
      }
      if (node.position) mask(node.position.start.offset!, node.position.end.offset!)
    } else if ('children' in node) {
      for (const child of node.children) visit(child as typeof node)
    }
  }
  visit(fromMarkdown(input))
  for (const re of [/https?:\/\/[^\s<>()]+/gi, /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/giu]) {
    for (const match of input.matchAll(re)) mask(match.index, match.index + match[0].length)
  }
  return chars.join('')
}

function normalized(input: string): { text: string; starts: number[]; ends: number[] } {
  let text = ''
  const starts: number[] = []
  const ends: number[] = []
  for (const { segment, index: offset } of GRAPHEMES.segment(input)) {
    for (const char of segment.normalize('NFKC').toLowerCase()) {
      const value = HORIZONTAL.test(char) ? ' ' : char
      if (value === ' ' && text.endsWith(' ')) {
        ends[ends.length - 1] = offset + segment.length
        continue
      }
      text += value
      for (let i = 0; i < value.length; i += 1) {
        starts.push(offset)
        ends.push(offset + segment.length)
      }
    }
  }
  return { text, starts, ends }
}

function scanProseMentions(input: string, targets: readonly MentionTarget[]): MentionRange[] {
  const { text, starts, ends } = normalized(input)
  const names = targets.map(target => [...new Set([target.name, ...participantMentionNames(target)]
    .map(name => normalized(name).text.trim()).filter(Boolean))])
  const owners = new Map<string, Set<string>>()
  for (const [index, aliases] of names.entries()) for (const name of aliases) {
    const ids = owners.get(name) ?? new Set<string>()
    ids.add(targets[index].id)
    owners.set(name, ids)
  }
  const candidates = [
    { id: 'all', token: 'all' }, { id: 'all', token: '所有人' },
    ...targets.map(target => ({ id: target.id, token: normalized(target.id).text })),
    ...targets.flatMap((target, i) => names[i].filter(name => owners.get(name)?.size === 1)
      .map(token => ({ id: target.id, token }))),
  ].filter(candidate => candidate.token).sort((a, b) => b.token.length - a.token.length)
  const result: MentionRange[] = []
  let previousEnd = -1
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '@' || i !== previousEnd && /[A-Za-z0-9_@]/.test(text[i - 1] ?? '')) continue
    const start = i + (text[i + 1] === ' ' ? 2 : 1)
    const match = candidates.find(candidate => {
      if (!text.startsWith(candidate.token, start)) return false
      const after = text[start + candidate.token.length]
      return !after || !WORD.test(after) || HAN.test(after)
    })
    if (!match) continue
    previousEnd = start + match.token.length
    result.push({ id: match.id, start: starts[i]!, end: ends[previousEnd - 1]! })
    i = previousEnd - 1
  }
  return result
}

/** Only a complete handle is formatting; snippets and multiline examples remain code. */
export function standaloneMention(input: string, targets: readonly MentionTarget[]): MentionRange | undefined {
  if (/[\r\n]/.test(input)) return
  const mentions = scanProseMentions(input, targets)
  if (mentions.length !== 1) return
  const mention = mentions[0]!
  if (!input.slice(0, mention.start).trim() && !input.slice(mention.end).trim()) return mention
}

/** IDs and unique names resolve against the current roster; ranges refer to the original text. */
export function scanMentions(input: string, targets: readonly MentionTarget[], options: MentionOptions = {}): MentionRange[] {
  return scanProseMentions(maskNonMentionText(input, options.allowInlineCodeMentions ? targets : undefined), targets)
}

export function parseMentions(input: string, targets: readonly MentionTarget[], options: MentionOptions = {}): ParsedMentions {
  const mentions = scanMentions(input, targets, options)
  return { mentionedIds: [...new Set(mentions.filter(mention => mention.id !== 'all').map(mention => mention.id))],
    mentionAll: mentions.some(mention => mention.id === 'all') }
}

export function canonicalizeMentions(input: string, targets: readonly MentionTarget[]): string {
  for (const mention of scanMentions(input, targets).reverse()) {
    input = input.slice(0, mention.start) + '@' + mention.id + input.slice(mention.end)
  }
  return input
}
