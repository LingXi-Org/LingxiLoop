import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { codeBlockOptions } from '@blocknote/code-block'
import type { ContentBlock, NativeEditor } from './schema'

/** Import adapter for existing course Markdown. Raw source is retained in the
 * document; official BlockNote HTML parsers own every resulting native block. */
export function importLegacy(editor: NativeEditor, value: string) {
  const html = renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[[rehypeKatex,{output:'mathml'}]]} skipHtml>{value}</ReactMarkdown>)
  const normalize = (blocks: ContentBlock[]): ContentBlock[] => blocks.map(block => ({ ...block,
    // 0.56's HTML parser retains fence aliases; its native language select requires IDs.
    ...(block.type === 'codeBlock' ? { props: { ...block.props, language: Object.entries(codeBlockOptions.supportedLanguages).find(([id,spec]) => id === block.props.language.toLowerCase() || spec.aliases.some(alias => alias === block.props.language.toLowerCase()))?.[0] ?? 'text' } } : {}),
    children: normalize(block.children),
  } as ContentBlock))
  return normalize(editor.tryParseHTMLToBlocks(html))
}
