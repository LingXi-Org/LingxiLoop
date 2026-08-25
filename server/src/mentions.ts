export interface MentionTarget {
  id: string
  name: string
}

export interface ParsedMentions {
  mentionedIds: string[]
  mentionAll: boolean
}

const WORD = /[\p{L}\p{N}_-]/u

function maskRange(chars: string[], start: number, end: number): void {
  for (let i = start; i < end; i += 1) chars[i] = ' '
}

/** Remove surfaces where an @ is data, not chat syntax, while preserving
 * indexes. This deliberately covers fenced/inline code, URLs and email. */
export function maskNonMentionText(input: string): string {
  const chars = Array.from(input)
  const ranges: Array<[number, number]> = []
  const collect = (re: RegExp) => {
    for (const match of input.matchAll(re)) {
      if (match.index == null) continue
      ranges.push([
        Array.from(input.slice(0, match.index)).length,
        Array.from(input.slice(0, match.index + match[0].length)).length,
      ])
    }
  }
  collect(/```[\s\S]*?(?:```|$)/g)
  collect(/`[^`\n]*`/g)
  collect(/https?:\/\/[^\s<>()]+/gi)
  collect(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/giu)
  for (const [start, end] of ranges) maskRange(chars, start, end)
  return chars.join('')
}

/** Resolve mentions only against the current conversation roster. IDs and
 * unique display names are case-insensitive; longest token wins so `ann`
 * never steals `anna`. */
export function parseMentions(input: string, targets: MentionTarget[]): ParsedMentions {
  const text = Array.from(maskNonMentionText(input).normalize('NFKC'))
  const nameCounts = new Map<string, number>()
  for (const target of targets) {
    const name = target.name.normalize('NFKC').toLocaleLowerCase()
    if (name) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
  }
  const candidates = targets
    .flatMap((target) => {
      const id = target.id.normalize('NFKC')
      const name = target.name.normalize('NFKC')
      const tokens = [id]
      if (name && nameCounts.get(name.toLocaleLowerCase()) === 1) tokens.push(name)
      return tokens.map((token) => ({ target, token: Array.from(token), lower: token.toLocaleLowerCase() }))
    })
    .sort((a, b) => b.token.length - a.token.length)
  const found = new Set<string>()
  let mentionAll = false

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '@') continue
    const prev = text[i - 1]
    // Start boundaries intentionally use the ASCII identifier class. In CJK
    // prose users naturally type “请找@小灵” with no whitespace; treating the
    // preceding Chinese character as part of an identifier would miss it.
    if (prev && (/[A-Za-z0-9_]/.test(prev) || prev === '@')) continue
    const tail = text.slice(i + 1).join('').toLocaleLowerCase()
    const broadcast = ['everyone', 'all'].find((token) => tail.startsWith(token))
    if (broadcast) {
      const after = text[i + 1 + broadcast.length]
      if (!after || !WORD.test(after)) {
        mentionAll = true
        i += broadcast.length - 1
        continue
      }
    }
    const match = candidates.find((candidate) => {
      if (!tail.startsWith(candidate.lower)) return false
      const after = text[i + 1 + candidate.token.length]
      return !after || !WORD.test(after)
    })
    if (match) {
      found.add(match.target.id)
      i += match.token.length
    }
  }
  return { mentionedIds: [...found], mentionAll }
}
