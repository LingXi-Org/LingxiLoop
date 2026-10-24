import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import { memoRemarkPlugins } from '@/features/learning/forum/memos/pipeline'
import { remarkCurrencySafeMath } from '@/features/learning/forum/memos/remark-currency-safe-math'
import type { NativeEditor } from './schema'
import type { Root } from 'hast'
import { visit } from 'unist-util-visit'

/** Normalize generated HTML for upstream native code and math parsers. */
function nativeHtmlContent() {
  return (tree: Root) => visit(tree, 'element', node => {
    // Upstream inline math parsing requires the explicit MathML default.
    if (node.tagName === 'math' && !node.properties.display) node.properties.display = 'inline'
    if (node.tagName !== 'pre') return
    // HAST's formatting LF is not part of the original code.
    const code = node.children[0]
    if (code?.type !== 'element' || code.tagName !== 'code') return
    const last = code.children.at(-1)
    if (last?.type === 'text') last.value = last.value.replace(/\n$/, '')
  })
}

export function legacyMarkdownHtml(value: string, format: 'forum' | 'markdown') {
  return renderToStaticMarkup(<ReactMarkdown remarkPlugins={format === 'forum' ? [remarkCurrencySafeMath,...memoRemarkPlugins] : [remarkGfm]} rehypePlugins={[[rehypeKatex,{output:'mathml',trust:false}], nativeHtmlContent]} skipHtml={format === 'forum'}>{value}</ReactMarkdown>)
}

/** Import adapter for existing course Markdown. Raw source is retained in the
 * document; official BlockNote HTML parsers own every resulting native block. */
export function importLegacy(editor: NativeEditor, value: string, format: 'forum' | 'markdown') {
  const html = legacyMarkdownHtml(value, format)
  return editor.tryParseHTMLToBlocks(html)
}
