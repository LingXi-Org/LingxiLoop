import type { FindMatch } from './transcriptExperience'

const MATCH_NAME = 'lingxi-find-match'
const CURRENT_NAME = 'lingxi-find-current'

type HighlightRegistry = { set(name: string, value: unknown): void; delete(name: string): void }
type HighlightGlobals = typeof globalThis & {
  CSS?: typeof CSS & { highlights?: HighlightRegistry }
  Highlight?: new (...ranges: Range[]) => unknown
}

export function clearFindHighlights(): void {
  const globals = globalThis as HighlightGlobals
  globals.CSS?.highlights?.delete(MATCH_NAME)
  globals.CSS?.highlights?.delete(CURRENT_NAME)
}

function collectText(root: HTMLElement) {
  const nodes: Text[] = []
  const starts: number[] = []
  let text = ''
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text
    nodes.push(textNode)
    starts.push(text.length)
    text += textNode.data.toLocaleLowerCase()
  }
  return { nodes, starts, text }
}

function pointAt(source: ReturnType<typeof collectText>, offset: number) {
  for (let index = source.starts.length - 1; index >= 0; index -= 1) {
    const start = source.starts[index]
    const node = source.nodes[index]
    if (start !== undefined && node && start <= offset) return { node, offset: offset - start }
  }
  return null
}

export function applyFindHighlights(container: HTMLElement | null, query: string, current: FindMatch | null): boolean {
  clearFindHighlights()
  const needle = query.trim().toLocaleLowerCase()
  if (!container || !needle) return false
  const globals = globalThis as HighlightGlobals
  const supported = Boolean(globals.CSS?.highlights && globals.Highlight)
  container.dataset.findHighlights = supported ? 'true' : 'false'
  if (!supported || !globals.CSS?.highlights || !globals.Highlight) return false
  const ranges: Range[] = []
  let currentRange: Range | null = null
  for (const row of container.querySelectorAll<HTMLElement>('[data-find-message-id]')) {
    const messageId = row.dataset.findMessageId
    let occurrence = 0
    for (const content of row.querySelectorAll<HTMLElement>('[data-find-content]')) {
      const source = collectText(content)
      let offset = source.text.indexOf(needle)
      while (offset >= 0) {
        const from = pointAt(source, offset)
        const to = pointAt(source, offset + needle.length - 1)
        if (from && to) {
          const range = content.ownerDocument.createRange()
          range.setStart(from.node, from.offset)
          range.setEnd(to.node, to.offset + 1)
          ranges.push(range)
          if (current && current.messageId === messageId && current.occurrence === occurrence) currentRange = range
        }
        occurrence += 1
        offset = source.text.indexOf(needle, offset + Math.max(1, needle.length))
      }
    }
  }
  if (ranges.length === 0) return true
  globals.CSS.highlights.set(MATCH_NAME, new globals.Highlight(...ranges))
  if (currentRange) globals.CSS.highlights.set(CURRENT_NAME, new globals.Highlight(currentRange))
  return true
}
