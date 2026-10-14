// Adapted from Memos MemoContent/index, MemoMarkdownRenderer and markdown/Paragraph (MIT). See README.md.
import { TaskEditContext } from './TaskEditContext'
import { useContext, lazy, memo, Suspense } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { CodeBlock } from './CodeBlock'
import { Blockquote } from './markdown/Blockquote'
import { Heading } from './markdown/Heading'
import { InlineCode } from './markdown/InlineCode'
import { Image } from './markdown/Image'
import { Link } from './markdown/Link'
import { List, ListItem } from './markdown/List'
import { markdownStyles } from './markdownStyles'
import { hasMathSyntax } from './math'
import { memoRemarkPlugins } from './pipeline'
import { rehypeHeadingId } from './heading-anchors'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from './Table'

function TaskCheckbox({checked}: {checked?: boolean}) {
  const edit = useContext(TaskEditContext)
  return <Checkbox checked={Boolean(checked)} disabled={!edit} aria-label={checked ? '已完成事项' : '未完成事项'} />
}
const components: Components = {
  h1: props => <Heading level={1} {...props} />,
  h2: props => <Heading level={2} {...props} />,
  h3: props => <Heading level={3} {...props} />,
  h4: props => <Heading level={4} {...props} />,
  h5: props => <Heading level={5} {...props} />,
  h6: props => <Heading level={6} {...props} />,
  p: ({ node: _node, className, ...props }) => <p className={cn(markdownStyles.paragraph, className)} {...props} />,
  blockquote: Blockquote,
  ul: List,
  ol: props => <List ordered {...props} />,
  li: ListItem,
  a: Link,
  code: InlineCode,
  pre: CodeBlock,
  input: ({ type, checked }) => type === 'checkbox' ? <TaskCheckbox checked={checked} /> : null,
  span: ({ node, ...props }) => {
    const tag = node?.properties['data-tag'] ?? node?.properties.dataTag
    return <span {...props} className={typeof tag === 'string' ? 'inline-flex rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[.9em] leading-none text-primary' : props.className} />
  },
  hr: ({ node: _node, ...props }) => <hr className={markdownStyles.horizontalRule} {...props} />,
  img: Image,
  table: Table, thead: TableHead, tbody: TableBody, tr: TableRow, th: TableHeaderCell, td: TableCell,
}
const MathMarkdownRenderer = lazy(() => import('./MathMarkdownRenderer'))

export const MemoContent = memo(function MemoContent({ content, className, onTaskToggle }: { content: string; className?: string; onTaskToggle?:(line:number)=>void }) {
  return <TaskEditContext value={onTaskToggle}><div className={cn('w-full min-w-0 flex flex-col justify-start items-start text-foreground', className)}>
    <div data-memo-content className="relative w-full max-w-full min-w-0 [overflow-wrap:anywhere] text-base leading-6 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_.katex-display]:max-w-full [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.footnotes]:mt-4 [&_.footnotes]:border-t [&_.footnotes]:border-border [&_.footnotes]:pt-2 [&_.footnotes]:text-sm [&_.footnotes]:text-muted-foreground">
      {hasMathSyntax(content) ? <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">正在排版公式…</p>}><MathMarkdownRenderer content={content} components={components} /></Suspense>
        : <ReactMarkdown remarkPlugins={memoRemarkPlugins} rehypePlugins={[rehypeHeadingId]} components={components} skipHtml>{content}</ReactMarkdown>}
    </div>
  </div></TaskEditContext>
})
