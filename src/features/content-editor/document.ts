import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import { visit } from 'unist-util-visit'
import type { Block } from '@blocknote/core'

/** Markdown remains the search/export/legacy-reader projection; blocks are canonical. */
export interface ContentDocument {
  format: 'blocknote'
  version: 1
  blocks: Block[]
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
  return { ...document, blocks: updateBlocks(document.blocks) }
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
