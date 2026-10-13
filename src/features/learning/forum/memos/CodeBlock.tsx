// Adapted from Memos MemoContent/CodeBlock.tsx (MIT). See README.md and LICENSE.
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Children, isValidElement, type ReactNode, useState } from 'react'

function codeText(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === 'string' || typeof child === 'number'
    ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? codeText(child.props.children) : '').join('')
}

export function CodeBlock({ children }: { children?: ReactNode }) {
  const element = isValidElement<{ className?: string }>(children) ? children : null
  const language = /language-(\S+)/.exec(element?.props.className ?? '')?.[1] ?? 'text'
  const codeContent = codeText(children)
  const [copied, setCopied] = useState(false), [error, setError] = useState(false)
  return <div className="relative my-0 mb-2 rounded-lg border border-border bg-muted/20 overflow-hidden">
    <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-muted/30">
      <span className="text-xs text-foreground select-none">{language}</span>
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(codeContent); setCopied(true); setError(false) }
        catch { setError(true) }
      }} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={copied ? '已复制' : '复制代码'}>
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}{copied ? '已复制' : '复制'}
      </button>
    </div>
    <pre className="m-0 overflow-x-auto"><code className={`block px-3 py-2 text-sm leading-relaxed language-${language}`}>{codeContent}</code></pre>
    {error && <p role="status" className="px-3 pb-2 text-xs text-muted-foreground">复制失败，请选择代码后复制。</p>}
  </div>
}
