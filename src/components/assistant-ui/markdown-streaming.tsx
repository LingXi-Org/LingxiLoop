import { createContext, useContext } from 'react'
import type { Element, Root } from 'hast'
import { SKIP, visit } from 'unist-util-visit'
import { StreamingText, type StreamingWord } from './elements/streaming-text'

// Only the Markdown/text boundary lives here. Rendering and animation remain
// in the attributed upstream component. Never rebuild Markdown from words.
export const StreamingBlock = createContext({ streaming: false, animate: false })
const emptySegments: [] = []

declare module 'hast' {
  interface ElementData {
    streamingText?: { words: StreamingWord[]; trailing: number; caret: boolean; caretOnly?: boolean }
  }
}

function words(text: string): StreamingWord[] {
  const result: StreamingWord[] = []
  // Stable single CJK characters keep an unspaced paragraph from becoming one
  // blue word. Preserve Latin words, Unicode characters and every whitespace.
  for (const word of text.match(/\s+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu) ?? []) {
    if (/^\s+$/.test(word) && result.length) result[result.length - 1].separator += word
    else result.push({ word, separator: '' })
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
        data: { streamingText: { words: words(node.value), trailing: 0, caret: false } },
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
    // Keep fenced-code/diagram renderers intact. Their cursor follows the rich
    // block, using the upstream empty segment rather than a second caret design.
    const tail = opaqueTail as { parent: Root | Element; index: number } | undefined
    if (tail) tail.parent.children.splice(tail.index + 1, 0, {
      type: 'element', tagName: 'span', properties: {}, children: [],
      data: { streamingText: { words: [{ word: '', separator: '' }], trailing: 0, caret: true, caretOnly: true } },
    })
  }
}

export function StreamingLeaf({ node }: { node: Element }) {
  const { streaming, animate } = useContext(StreamingBlock)
  const { words, trailing, caret, caretOnly } = node.data!.streamingText!
  if (caretOnly && !streaming) return null
  return <StreamingText segments={emptySegments} tokens={words} count={words.length}
    streaming={streaming} animate={animate && !caretOnly} trailing={trailing} caret={caret} inline />
}
