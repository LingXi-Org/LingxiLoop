import Markdown, { type Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

type TypesetPreset = 'chat' | 'document' | 'canvas' | 'preview'

const presetClass: Record<TypesetPreset, string> = {
  chat: 'typeset-chat',
  document: 'typeset-document',
  canvas: 'typeset-canvas',
  preview: 'typeset-preview',
}

export function TypesetMarkdown({
  content,
  preset = 'document',
  as: Root = 'div',
  className,
  components,
  remarkPlugins = [],
}: {
  content: string
  preset?: TypesetPreset
  as?: 'article' | 'div'
  className?: string
  components?: Components
  remarkPlugins?: NonNullable<React.ComponentProps<typeof Markdown>['remarkPlugins']>
}) {
  return (
    <Root className={cn('typeset', presetClass[preset], className)} data-typeset-preset={preset}>
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks, ...remarkPlugins]} components={components} skipHtml>
        {content}
      </Markdown>
    </Root>
  )
}
