// Adapted from Memos rehype-heading-id and markdown-manipulation (MIT). See README.md.
import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'

function headingText(node: Element): string {
  return node.children.map(child => child.type === 'text' ? child.value : child.type === 'element' ? headingText(child) : '').join('')
}

export function rehypeHeadingId() {
  return (tree: Root) => {
    const used = new Set<string>()
    visit(tree, 'element', node => { if (typeof node.properties.id === 'string') used.add(node.properties.id) })
    visit(tree, 'element', node => {
      if (!/^h[1-6]$/.test(node.tagName) || node.properties.id) return
      const base = headingText(node).normalize('NFC').toLowerCase().trim().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
        .replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'heading'
      let slug = base, suffix = 0
      while (used.has(slug)) slug = `${base}-${++suffix}`
      used.add(slug)
      node.properties.id = slug
    })
  }
}
