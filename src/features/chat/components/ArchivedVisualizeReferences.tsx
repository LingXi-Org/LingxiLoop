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
  return <aside className="my-3 space-y-3 rounded-xl border border-border p-3 text-sm" aria-label="历史可视化引用">
    <p className="text-muted-foreground">历史可视化的交互功能已停用。原始内容与个人保存状态可导出留存。</p>
    {references.map(reference => <div key={`${reference.start}:${reference.path}`} className="space-y-1">
      {reference.title && <p className="font-medium break-words">{reference.title}</p>}
      <p className="text-muted-foreground break-all">{reference.path}</p>
      {!readOnly && conversationId && sourceMessageId && <button type="button"
        className="cursor-pointer rounded px-2 py-1 text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-wait aria-disabled:opacity-60"
        aria-disabled={pending !== null} aria-busy={pending === reference.path || undefined} onClick={() => { void download(reference) }}>
        {pending === reference.path ? '正在导出…' : '下载历史内容'}
      </button>}
    </div>)}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </aside>
}
