import { useLayoutEffect, useRef } from 'react'
import type { Root } from 'hast'
import { SKIP, visit } from 'unist-util-visit'

export function rehypeStreamingWords() {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (node.type === 'element' && ['pre', 'svg', 'math'].includes(node.tagName)) return SKIP
      if (node.type !== 'text' || index === undefined || !parent || !node.value.trim()) return
      // CJK has no spaces; preserve whitespace and emoji sequences without changing Markdown.
      const words = node.value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+|\s+/gu) ?? []
      parent.children.splice(index, 1, ...words.map(value => /^\s+$/.test(value)
        ? { type: 'text' as const, value }
        : { type: 'element' as const, tagName: 'span', properties: { 'data-streaming-word': '' }, children: [{ type: 'text' as const, value }] }))
      return [SKIP, index + words.length]
    })
  }
}

export function useStreamingTail(text: string, streaming: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    root.querySelectorAll('[data-streaming-fresh], [data-streaming-cursor]').forEach(word => {
      word.removeAttribute('data-streaming-fresh')
      word.removeAttribute('data-streaming-cursor')
    })
    if (!streaming || !text.trim()) return
    // Rendered order lets block boundaries, inline formatting and citations share one tail.
    const words = [...root.querySelectorAll('[data-streaming-word], pre code')]
    for (const word of words.slice(-2)) {
      if (word.hasAttribute('data-streaming-word')) word.setAttribute('data-streaming-fresh', '')
    }
    words.at(-1)?.setAttribute('data-streaming-cursor', '')
  }, [text, streaming])
  return ref
}
