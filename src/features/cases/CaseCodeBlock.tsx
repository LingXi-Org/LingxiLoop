import { isValidElement, type ReactNode } from 'react'
import { HighlightedCodeBlock } from '@/features/learning/forum/memos/CodeBlock'

/** Reuse the source renderer; a case's Mermaid fence remains source, like other code. */
export function CaseCodeBlock({ children }: { children?: ReactNode }) {
  const code = isValidElement<{ className?: string; children?: string }>(children) ? children.props : undefined
  const language = /language-(\S+)/.exec(code?.className ?? '')?.[1] ?? 'text'
  // ReactMarkdown adds one formatting newline; keep only the actual code content.
  const codeContent = (code?.children ?? '').replace(/\n$/, '')
  return <HighlightedCodeBlock key={`${language}\0${codeContent}`} language={language} codeContent={codeContent} />
}
