import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import { codeBlockOptions } from '@blocknote/code-block'
import { memoRemarkPlugins } from '@/features/learning/forum/memos/pipeline'
import { remarkCurrencySafeMath } from '@/features/learning/forum/memos/remark-currency-safe-math'
import type { ContentBlock, NativeEditor } from './schema'

/** Import adapter for existing course Markdown. Raw source is retained in the
 * document; official BlockNote HTML parsers own every resulting native block. */
export function importLegacy(editor: NativeEditor, value: string, format: 'forum' | 'markdown') {
  const html = renderToStaticMarkup(<ReactMarkdown remarkPlugins={format === 'forum' ? [remarkCurrencySafeMath,...memoRemarkPlugins] : [remarkGfm]} rehypePlugins={[[rehypeKatex,{output:'mathml',trust:false}]]} skipHtml>{value}</ReactMarkdown>)
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  // KaTeX omits MathML's default display="inline"; upstream's inline parser
  // intentionally requires that explicit attribute. Normalize at this boundary.
  parsed.querySelectorAll('math:not([display])').forEach(math => { math.setAttribute('display', 'inline') })
  const normalize = (blocks: ContentBlock[]): ContentBlock[] => blocks.map(block => ({ ...block,
    // 0.56's HTML parser retains fence aliases; its native language select requires IDs.
    ...(block.type === 'codeBlock' ? { props: { ...block.props, language: Object.entries(codeBlockOptions.supportedLanguages).find(([id,spec]) => id === block.props.language.toLowerCase() || spec.aliases.some(alias => alias === block.props.language.toLowerCase()))?.[0] ?? 'text' } } : {}),
    children: normalize(block.children),
  } as ContentBlock))
  return normalize(editor.tryParseHTMLToBlocks(parsed.body.innerHTML))
}
