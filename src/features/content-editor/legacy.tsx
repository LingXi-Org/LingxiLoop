import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import { memoRemarkPlugins } from '@/features/learning/forum/memos/pipeline'
import { remarkCurrencySafeMath } from '@/features/learning/forum/memos/remark-currency-safe-math'
import type { NativeEditor } from './schema'
import type { Root } from 'hast'
import { visit } from 'unist-util-visit'

/** HAST's code renderer appends a formatting LF; it is not part of the source. */
function codeContent() {
  return (tree: Root) => visit(tree, 'element', node => {
    if (node.tagName !== 'pre') return
    const code = node.children[0]
    if (code?.type !== 'element' || code.tagName !== 'code') return
    const last = code.children.at(-1)
    if (last?.type === 'text') last.value = last.value.replace(/\n$/, '')
  })
}

export function legacyMarkdownHtml(value: string, format: 'forum' | 'markdown') {
  return renderToStaticMarkup(<ReactMarkdown remarkPlugins={format === 'forum' ? [remarkCurrencySafeMath,...memoRemarkPlugins] : [remarkGfm]} rehypePlugins={[codeContent, [rehypeKatex,{output:'mathml',trust:false}]]} skipHtml={format === 'forum'}>{value}</ReactMarkdown>)
}

/** Import adapter for existing course Markdown. Raw source is retained in the
 * document; official BlockNote HTML parsers own every resulting native block. */
export function importLegacy(editor: NativeEditor, value: string, format: 'forum' | 'markdown') {
  const html = legacyMarkdownHtml(value, format)
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  // KaTeX omits MathML's default display="inline"; upstream's inline parser
  // intentionally requires that explicit attribute. Normalize at this boundary.
  parsed.querySelectorAll('math:not([display])').forEach(math => { math.setAttribute('display', 'inline') })
  return editor.tryParseHTMLToBlocks(parsed.body.innerHTML)
}
