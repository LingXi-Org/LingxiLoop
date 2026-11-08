import { ArchiveNote } from '@/components/assistant-ui/elements/archive-note'
import { useState } from 'react'
import { http } from '@/api/core/http'
import type { LegacyVisualizeReference } from '../../../../shared/retired-visualize'

/** Old HTML is never mounted, previewed, or run. Export is an explicit user
 * action against the original durable message under current server ACL. */
export function ArchivedVisualizeReferences({ references, conversationId, sourceMessageId, readOnly }: {
  references: readonly LegacyVisualizeReference[]
  conversationId?: string
  sourceMessageId?: string
  readOnly: boolean
}) {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function download(reference: LegacyVisualizeReference) {
    if (readOnly || !conversationId || !sourceMessageId || pending) return
    setPending(reference.path); setError(null)
    try {
      const query = new URLSearchParams({ path: reference.path, sourceMessageId })
      const archive = await http<unknown>(`/im/channels/${encodeURIComponent(conversationId)}/visualize/archive?${query}`)
      const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      try {
        const link = document.createElement('a')
        link.href = url; link.download = `${reference.path.split(/[\\/]/u).at(-1) ?? 'historical-view'}.json`
        link.click()
      } finally { URL.revokeObjectURL(url) }
    } catch { setError('历史内容暂时无法导出，请稍后重试或检查当前访问权限。') }
    finally { setPending(null) }
  }
  if (!references.length) return null
  return <aside aria-label="历史可视化引用" className="my-1">
    <ArchiveNote kind="visualize" tag="可视化引用" title={`${references.length} 个历史可视化`}>
      <p className="m-0 text-[12.5px] leading-[1.6] text-fg2">这些可视化来自旧版画板，已不能在线打开，可以下载原始内容。</p>
      {references.map(reference => <div key={`${reference.start}:${reference.path}`} className="flex min-w-0 flex-wrap items-center gap-2">
        {reference.title && <span className="min-w-0 text-[12.5px] font-medium break-words">{reference.title}</span>}
        {!readOnly && conversationId && sourceMessageId && <button type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-card px-2.5 text-[12.5px] font-medium text-foreground shadow-[0_0_0_1px_var(--input)] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-disabled:cursor-wait aria-disabled:opacity-60 max-md:min-h-11"
          aria-disabled={pending !== null} aria-busy={pending === reference.path || undefined} onClick={() => { void download(reference) }}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
          {pending === reference.path ? '正在导出…' : '下载历史内容'}
        </button>}
      </div>)}
      {error && <p role="alert" className="m-0 text-xs text-destructive">{error}</p>}
    </ArchiveNote>
  </aside>
}
