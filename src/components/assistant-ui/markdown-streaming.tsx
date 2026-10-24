import { useContext, useLayoutEffect } from 'react'
import type { Element, Root } from 'hast'
import { SKIP, visit } from 'unist-util-visit'
import { STREAMING_WORD_BUDGET, StreamingText, type StreamingWord } from './elements/streaming-text'
import { StreamingBlock } from './streaming-tail'

// Only the Markdown/text boundary lives here. Rendering and animation remain
// in the attributed upstream component. Never rebuild Markdown from words.
const emptySegments: [] = []

declare module 'hast' {
  interface ElementData {
    streamingText?: { words: StreamingWord[]; trailing: number; caret: boolean; caretOnly?: boolean; blockWords?: number }
  }
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
export function streamingWords(text: string): StreamingWord[] {
  const result: StreamingWord[] = []
  let prefix = ''
  // Stable single CJK characters keep an unspaced paragraph from becoming one
  // blue word. Preserve Latin words, Unicode characters and every whitespace.
  const complex = /\p{M}|[\u1100-\u11ff\u200d]/u.test(text)
  const segments = complex ? [...graphemes.segment(text)].map(item => item.segment)
    : text.match(/\s+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu) ?? []
  for (const word of segments) {
    if (/^\s+$/.test(word)) {
      if (result.length) result[result.length - 1].separator += word
      else prefix += word
    } else if (complex && result.length && !result.at(-1)!.separator && !cjk.test(word) && !cjk.test(result.at(-1)!.word)) {
      result.at(-1)!.word += word
    } else {
      result.push({ word, separator: '', prefix })
      prefix = ''
    }
  }
  return result
}

export function rehypeStreamingText() {
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
        data: { streamingText: { words: streamingWords(node.value), trailing: 0, caret: false } },
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
    streaming={streaming} animate={animate && !caretOnly} trailing={trailing + after} caret={caret && isTail} inline />
}
