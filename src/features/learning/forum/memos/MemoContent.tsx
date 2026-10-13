// Adapted from Memos MemoContent/index, MemoMarkdownRenderer and markdown/Paragraph (MIT). See README.md.
import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { CodeBlock } from './CodeBlock'
import { Blockquote } from './markdown/Blockquote'
import { Heading } from './markdown/Heading'
import { InlineCode } from './markdown/InlineCode'
import { Link } from './markdown/Link'
import { List, ListItem } from './markdown/List'
import { markdownStyles } from './markdownStyles'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from './Table'

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
  hr: ({ node: _node, ...props }) => <hr className={markdownStyles.horizontalRule} {...props} />,
  img: ({ node: _node, ...props }) => <img className={markdownStyles.image} loading="lazy" {...props} />,
  table: Table, thead: TableHead, tbody: TableBody, tr: TableRow, th: TableHeaderCell, td: TableCell,
}

export const MemoContent = memo(function MemoContent({ content, className }: { content: string; className?: string }) {
  return <div className={cn('w-full min-w-0 flex flex-col justify-start items-start text-foreground', className)}>
    <div data-memo-content className="relative w-full max-w-full min-w-0 [overflow-wrap:anywhere] text-base leading-6 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_.footnotes]:mt-4 [&_.footnotes]:border-t [&_.footnotes]:border-border [&_.footnotes]:pt-2 [&_.footnotes]:text-sm [&_.footnotes]:text-muted-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components} skipHtml>{content}</ReactMarkdown>
    </div>
  </div>
})
