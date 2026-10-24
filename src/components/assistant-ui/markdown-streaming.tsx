import { useContext, useLayoutEffect } from 'react'
import type { Element, Root } from 'hast'
import { SKIP, visit } from 'unist-util-visit'
import { STREAMING_WORD_BUDGET, StreamingText, type StreamingWord, type StreamingWordTokens } from './elements/streaming-text'
import { StreamingBlock } from './streaming-tail'

// Only the Markdown/text boundary lives here. Rendering and animation remain
// in the attributed upstream component. Never rebuild Markdown from words.
const emptySegments: [] = []

declare module 'hast' {
  interface ElementData {
    streamingText?: { words: StreamingWordTokens; trailing: number; caret: boolean; caretOnly?: boolean; blockWords?: number }
  }
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const complexText = /\p{M}|[\u1100-\u11ff\u200d]/u
export function streamingWords(text: string): StreamingWord[] {
  return tokenizeWords(text, complexText.test(text))
}

function tokenizeWords(text: string, complex: boolean, offset = 0): StreamingWord[] {
  const result: StreamingWord[] = []
  let prefix = ''
  let cursor = offset
  // Stable single CJK characters keep an unspaced paragraph from becoming one
  // blue word. Preserve Latin words, Unicode characters and every whitespace.
  const segments = complex ? [...graphemes.segment(text)].map(item => item.segment)
    : text.match(/\s+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu) ?? []
  for (const word of segments) {
    if (/^\s+$/.test(word)) {
      if (result.length) result[result.length - 1].separator += word
      else prefix += word
    } else if (complex && result.length && !result.at(-1)!.separator && !cjk.test(word) && !cjk.test(result.at(-1)!.word)) {
      result.at(-1)!.word += word
    } else {
      result.push({ word, separator: '', prefix, start: cursor - prefix.length })
      prefix = ''
    }
    cursor += word.length
  }
  return result
}

// Stable words are append-only. Each snapshot owns its visible length and last
// (still editable) word, so later appends cannot change an earlier render's
// tokens or indexes. Snapshots share one array, not a chain of prior snapshots.
function wordSnapshot(stable: StreamingWord[], last: StreamingWord | undefined): StreamingWordTokens {
  const length = stable.length + (last ? 1 : 0)
  const at = (index: number) => {
    index = Math.trunc(index) || 0
    if (index < 0) index += length
    return index < 0 || index >= length ? undefined : index === length - 1 ? last : stable[index]
  }
  const boundary = (index: number) => {
    index = Math.trunc(index) || 0
    return Math.min(length, Math.max(0, index < 0 ? length + index : index))
  }
  return { length, at, slice(start = 0, end = length) {
    const result: StreamingWord[] = []
    const to = boundary(end)
    for (let index = boundary(start); index < to; index++) result.push(at(index)!)
    return result
  } }
}

// Owned by one React block, rather than the processor (which may be rebuilt).
// Only the last token can change on append: retokenize its prefix, word and
// separator together so split graphemes and whitespace retain full context.
export function createStreamingWordTokenizer() {
  const leaves: { text: string; words: StreamingWordTokens; stable: StreamingWord[]; complex: boolean; tailStart: number }[] = []
  const tokenize = (text: string, index: number): StreamingWordTokens => {
    const previous = leaves[index]
    if (previous?.text === text) return previous.words
    // Completing a split surrogate can change the preceding grapheme (for
    // example a whitespace followed by an emoji modifier). Use the reference.
    const append = previous && text.startsWith(previous.text) && !/[\ud800-\udbff]$/.test(previous.text)
    const complex = append ? previous.complex || complexText.test(text.slice(previous.text.length)) : complexText.test(text)
    let stable: StreamingWord[], tail: StreamingWord[]
    if (append && complex === previous.complex && previous.words.length) {
      stable = previous.stable
      tail = tokenizeWords(text.slice(previous.tailStart), complex, previous.tailStart)
    } else {
      stable = []
      tail = streamingWords(text)
    }
    const last = tail.pop()
    for (const word of tail) stable.push(word)
    const words = wordSnapshot(stable, last)
    leaves[index] = { text, words, stable, complex, tailStart: last ? text.length - (last.prefix?.length ?? 0) - last.word.length - (last.separator?.length ?? 0) : 0 }
    return words
  }
  return Object.assign(tokenize, {
    // Markdown completion/replacement can reduce the text-leaf count. Release
    // stale text and words after the full pass, retaining active leaf identity.
    finishPass: (leafCount: number) => { leaves.length = leafCount },
  })
}

type StreamingWordTokenizer = ((text: string, index: number) => StreamingWordTokens) & { finishPass?: (leafCount: number) => void }

export function rehypeStreamingText({ tokenize = streamingWords }: { tokenize?: StreamingWordTokenizer } = {}) {
  return (tree: Root) => {
    const leaves: Element[] = []
    let opaqueTail: { parent: Root | Element; index: number } | undefined
    visit(tree, (node, index, parent) => {
      // Syntax highlighting, math and mention widgets own their descendants.
      if (node.type === 'element' && (['pre', 'svg', 'math', 'img'].includes(node.tagName)
        || node.data?.mentionId || node.properties['data-citation-hidden']
        || String(node.properties.className ?? '').includes('katex'))) {
        if (!node.properties['data-citation-hidden'] && parent && index !== undefined
          && (parent.type === 'root' || parent.type === 'element')) opaqueTail = { parent, index }
        return SKIP
      }
      if (node.type !== 'text' || !parent || parent.type === 'root' || index === undefined || !node.value.trim()) return
      opaqueTail = undefined
      const leaf: Element = {
        type: 'element', tagName: 'span', properties: {},
        data: { streamingText: { words: tokenize(node.value, leaves.length), trailing: 0, caret: false } },
        children: [node],
      }
      leaves.push(leaf)
      parent.children[index] = leaf
      return SKIP
    })
    let trailing = opaqueTail ? 2 : 0
    for (let i = leaves.length - 1; i >= 0; i--) {
      const leaf = leaves[i].data!.streamingText!
      leaf.trailing = trailing
      leaf.caret = !opaqueTail && i === leaves.length - 1
      trailing += leaf.words.length
    }
    if (!opaqueTail && leaves.length) leaves[leaves.length - 1].data!.streamingText!.blockWords = Math.min(STREAMING_WORD_BUDGET, trailing)
    // Keep fenced-code/diagram renderers intact. Their cursor follows the rich
    // block, using the upstream empty segment rather than a second caret design.
    const tail = opaqueTail as { parent: Root | Element; index: number } | undefined
    if (tail) tail.parent.children.splice(tail.index + 1, 0, {
      type: 'element', tagName: 'span', properties: {}, children: [],
      data: { streamingText: { words: [{ word: '', separator: '' }], trailing: 0, caret: true, caretOnly: true, blockWords: Math.min(STREAMING_WORD_BUDGET, trailing) } },
    })
    tokenize.finishPass?.(leaves.length)
  }
}

export function StreamingLeaf({ node }: { node: Element }) {
  const { streaming, animate, after, isTail, register } = useContext(StreamingBlock)
  const { words, trailing, caret, caretOnly, blockWords } = node.data!.streamingText!
  // Register the committed block's count before paint. No render-phase writes,
  // reparsing of stable blocks, or traversal of their word nodes is needed.
  useLayoutEffect(() => blockWords === undefined ? undefined : register(blockWords), [register, blockWords])
  if (caretOnly && !streaming) return null
  return <StreamingText segments={emptySegments} tokens={words} count={words.length}
    sourceText={node.children[0]?.type === 'text' ? node.children[0].value : undefined}
    streaming={streaming} animate={animate && !caretOnly} trailing={trailing + after} caret={caret && isTail} inline />
}
