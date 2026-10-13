// Memos MathMarkdownRenderer, adapted to the shared course renderer (MIT). See README.md.
import 'katex/dist/katex.min.css'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import { remarkCurrencySafeMath } from './remark-currency-safe-math'
import { memoRemarkPlugins } from './pipeline'
import { rehypeHeadingId } from './heading-anchors'

export default function MathMarkdownRenderer({ content, components }: { content: string; components: Components }) {
  return <ReactMarkdown components={components} remarkPlugins={[remarkCurrencySafeMath, ...memoRemarkPlugins]}
    rehypePlugins={[rehypeHeadingId, [rehypeKatex, { throwOnError: false, strict: false, trust: false }]]} skipHtml>{content}</ReactMarkdown>
}
