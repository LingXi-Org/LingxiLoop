import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import { visit } from 'unist-util-visit'
import type { ContentBlock as Block } from './schema'
import type { Nodes } from 'mdast'

/** UI labels and hashtag extraction use text, never Markdown serialization syntax. */
export function markdownText(markdown: string): string {
  const plain = (node: Nodes): string => {
    if (node.type === 'break') return '\n'
    if ('value' in node) return node.value
    if ('alt' in node) return node.alt ?? ''
    if ('children' in node) return node.children.map(plain).join(['root','list','table','tableRow'].includes(node.type) ? '\n' : '')
    return ''
  }
  return plain(fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }))
}

/** Markdown remains the search/export/legacy-reader projection; blocks are canonical. */
export interface ContentDocument {
  format: 'blocknote'
  version: 1
  blocks: Block[]
  projection: string
  sections: string[]
  /** Original pre-BlockNote source, retained once, never replaced by a lossy export. */
  legacyMarkdown?: string
}

export function withTaskState(document: ContentDocument | null | undefined, markdown: string) {
  if (!document) return document
  const checked: boolean[] = []
  visit(fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }), 'listItem', node => { if (typeof node.checked === 'boolean') checked.push(node.checked) })
  let index = 0
  const updateBlocks = (blocks: Block[]): Block[] => blocks.map(block => ({ ...block,
    ...(block.type === 'checkListItem' ? { props: { ...block.props, checked: checked[index++] ?? block.props.checked } } : {}),
    children: updateBlocks(block.children),
  } as Block))
  return { ...document, projection: markdown, blocks: updateBlocks(document.blocks) }
}

/** JSONB property order and missing optional fields must not mark a saved draft dirty. */
export function equalContent(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined && v !== null).sort(([a],[b]) => a.localeCompare(b)).map(([key,v]) => [key,canonical(v)]))
    return value
  }
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
}

export function usableDocument(document: ContentDocument | null | undefined, text: string): document is ContentDocument {
  return Boolean(document && document.projection?.trim() === text.trim())
}

export function hasCodeSyntax(markdown: string): boolean {
  let found = false
  visit(fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }), 'code', () => { found = true })
  return found
}

/** BlockNote 0.56's Markdown exporter removes one terminal LF from code. Restore
 * only that verified difference using the existing Markdown AST; never trim code
 * or reinterpret an export whose code nodes do not match the native sequence. */
export function preserveCodeNewlines(markdown: string, blocks: Block[]): string {
  const native: string[] = []
  const collect = (items: Block[]) => items.forEach(block => {
    if (block.type === 'codeBlock') native.push(block.content.map(part => part.type === 'text' ? part.text : '').join(''))
    collect(block.children)
  })
  collect(blocks)
  if (!native.some(code => code.endsWith('\n'))) return markdown
  const nodes: Extract<Nodes, { type: 'code' }>[] = []
  visit(fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }), 'code', node => { nodes.push(node) })
  if (nodes.length !== native.length || nodes.some((node, index) => node.value !== native[index] && `${node.value}\n` !== native[index])) return markdown
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index], end = node.position?.end.offset
    if (node.value === native[index] || end === undefined) continue
    const closingStart = markdown.lastIndexOf('\n', end - 1) + 1
    markdown = `${markdown.slice(0, closingStart)}\n${markdown.slice(closingStart)}`
  }
  return markdown
}

export function criteriaSource(criteria: string[], document: ContentDocument | null | undefined): string {
  return document && JSON.stringify(document.sections) === JSON.stringify(criteria) ? document.projection : criteria.join('\n\n')
}
