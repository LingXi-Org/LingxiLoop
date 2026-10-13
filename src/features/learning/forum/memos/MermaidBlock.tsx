// Adapted from Memos MemoContent/MermaidBlock at 8120a6c (MIT). See README.md.
import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { useTheme } from '@/stores/theme'

export function MermaidBlock({ code }: { code: string }) {
  const { theme } = useTheme()
  const [svg, setSvg] = useState(''), [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    setSvg(''); setError(false)
    void (async () => {
      try {
        const { default: mermaid } = await import('mermaid')
        await document.fonts?.ready
        if (cancelled) return
        mermaid.initialize({ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default', securityLevel: 'strict',
          fontFamily: getComputedStyle(document.body).fontFamily || 'sans-serif', suppressErrorRendering: true })
        const result = await mermaid.render(`memo-mermaid-${crypto.randomUUID()}`, code)
        if (!cancelled) setSvg(result.svg)
      } catch { if (!cancelled) setError(true) }
    })()
    return () => { cancelled = true }
  }, [code, theme])
  if (error) return <div className="space-y-2"><p role="status" className="text-sm text-destructive">图表无法显示，请检查 Mermaid 语法。</p><pre className="overflow-x-auto text-sm"><code>{code}</code></pre></div>
  if (!svg) return <div role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Spinner className="motion-reduce:animate-none" />正在绘制图表…</div>
  // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid strict mode sanitizes generated SVG and disables clickable links.
  return <div className="mermaid-diagram mb-2 flex w-full min-w-0 items-center justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}
