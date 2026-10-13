// Adapted from Memos MemoContent/CodeBlock.tsx (MIT). See README.md and LICENSE.
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Children, isValidElement, type ReactNode, type CSSProperties, useEffect, useState } from 'react'
import type { ThemedToken } from 'shiki'
import { Button } from '@/components/ui/button'
import { MermaidBlock } from './MermaidBlock'

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

function HighlightedCodeBlock({ language, codeContent }: { language: string; codeContent: string }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState(false)
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null)
  useEffect(() => {
    if (['text', 'txt', 'plain', 'plaintext', ''].includes(language)) return
    let active = true
    void import('shiki').then(async ({ codeToTokens, bundledLanguages }) => {
      if (!Object.hasOwn(bundledLanguages, language)) return
      const result = await codeToTokens(codeContent, { lang: language as keyof typeof bundledLanguages, themes: { light: 'github-light', dark: 'github-dark' } })
      if (active) setTokens(result.tokens)
    }).catch(() => { /* An unknown language or unavailable chunk retains escaped source. */ })
    return () => { active = false }
  }, [language, codeContent])
  useEffect(() => { if (copied) { const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer) } }, [copied])
  return <div className="relative my-0 mb-2 rounded-lg border border-border bg-muted/20 overflow-hidden">
    <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-muted/30">
      <span className="text-xs text-foreground select-none">{language}</span>
      <Button type="button" variant="ghost" size="sm" onClick={async () => {
        try { await navigator.clipboard.writeText(codeContent); setCopied(true); setError(false) }
        catch { setError(true) }
      }} className="h-7 px-1.5 text-xs"
        aria-label={copied ? '已复制' : '复制代码'}>
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}{copied ? '已复制' : '复制'}
      </Button>
    </div>
    <pre className="m-0 overflow-x-auto"><code data-code-highlighted={tokens ? '' : undefined} className={`block px-3 py-2 text-sm leading-relaxed language-${language}`}>
      {tokens ? tokens.map((line, index) => <span key={index} className="block min-h-[1lh]">{line.map((token, tokenIndex) => <span key={tokenIndex} style={token.htmlStyle as CSSProperties}>{token.content}</span>)}</span>) : codeContent}
    </code></pre>
    {error && <p role="status" className="px-3 pb-2 text-xs text-muted-foreground">复制失败，请选择代码后复制。</p>}
  </div>
}
