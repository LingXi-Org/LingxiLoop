import { Children, isValidElement, type ReactNode } from 'react'
import { CodeBlock as HighlightedCodeBlock } from '@/components/CodeBlock'
import { MermaidBlock } from './MermaidBlock'
export { HighlightedCodeBlock }

function codeText(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === 'string' || typeof child === 'number'
    ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? codeText(child.props.children) : '').join('')
}

export function CodeBlock({ children }: { children?: ReactNode }) {
  const element = isValidElement<{ className?: string }>(children) ? children : null
  const language = /language-(\S+)/.exec(element?.props.className ?? '')?.[1] ?? 'text'
  const codeContent = codeText(children)
  if (language === 'mermaid') return <MermaidBlock code={codeContent} />
  return <HighlightedCodeBlock key={`${language}\0${codeContent}`} language={language} codeContent={codeContent} />
}
