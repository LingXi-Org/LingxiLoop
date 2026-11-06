import type { ResponseEnvelope } from '@lingxi-org/lingxios/ui'
import { formatFileSize } from '@/components/assistant-ui/elements/file'
import { FileKindIcon, fileKind } from '@/components/assistant-ui/elements/file-kind'
import { useEffect, useRef, useState } from 'react'
import { FilePreviewDialog } from '@/components/retab/ui/lazy-file-preview-dialog'
import type { ViewerSource } from '@/components/retab/lib/viewer-source'
import { useAuth } from '@/stores/auth'
import { useApp } from '@/stores/app'

export function DeliveryCard({ artifacts, busy, onDownload, onPreview }: {
  artifacts: ResponseEnvelope['artifacts']; busy: boolean; onDownload: (artifact: ResponseEnvelope['artifacts'][number]) => void
  onPreview: (artifact: ResponseEnvelope['artifacts'][number]) => Promise<Blob>
}) {
  const [source, setSource] = useState<ViewerSource | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(false)
  const generation = useRef(0)
  const identity = useAuth(state => `${state.activeCompanyId}:${state.user?.id}`)
  const conversation = useApp(state => state.selectedConversationId)
  useEffect(() => { generation.current++; setSource(null); setLoading(false); return () => { generation.current++ } }, [identity, conversation])
  useEffect(() => {
    const changed = () => { generation.current++; setSource(null); setLoading(false) }
    window.addEventListener('lingxiloop-workspace-changed', changed)
    return () => window.removeEventListener('lingxiloop-workspace-changed', changed)
  }, [])
  const open = async (artifact: ResponseEnvelope['artifacts'][number]) => {
    const current = ++generation.current; setLoading(true); setError(false)
    try {
      const blob = await onPreview(artifact)
      if (current === generation.current) setSource({ kind: 'blob', blob, fileName: artifact.path.split('/').at(-1), mimeType: artifact.mime, identityKey: crypto.randomUUID() })
    } catch { if (current === generation.current) setError(true) }
    finally { if (current === generation.current) setLoading(false) }
  }
  const total = artifacts.reduce((sum, artifact) => sum + (artifact.size ?? 0), 0)
  const icon = <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><path d="M21 8 12 3 3 8l9 5 9-5zM3 8v8l9 5 9-5V8" /></svg>
  return <section aria-label="交付清单" className="action-ticket flex w-full max-w-[640px] flex-col gap-2.5 rounded-2xl bg-card px-[18px] py-4 text-foreground">
    <div className="flex items-center gap-2">
      <span className="inline-flex flex-1 items-center gap-1.5 text-xs text-muted-foreground">{icon}交付文件 · {artifacts.length} 个{total ? ` · ${formatFileSize(total)}` : ''}</span>
    </div>
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
      {artifacts.map(artifact => {
        const name = artifact.path.split('/').at(-1) ?? artifact.path
        const kind = fileKind(artifact.mime, name)
        return <li key={artifact.path} className="flex min-w-0 items-center gap-2.5 rounded-[10px] py-2 pe-1.5 ps-2 shadow-[inset_0_0_0_1px_var(--border)]">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-start focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60" disabled={busy || loading} onClick={() => void open(artifact)} aria-label={`打开 ${name}`}>
            <FileKindIcon kind={kind} size={28} />
            <span className="flex min-w-0 flex-col"><span className="truncate text-[13px] font-medium">{name}</span><span className="text-[11.5px] text-muted-foreground">{formatFileSize(artifact.size ?? 0)}</span></span>
          </button>
          <button type="button" className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 max-md:size-11" disabled={busy} aria-label={`下载 ${name}`} onClick={() => onDownload(artifact)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
          </button>
        </li>
      })}
    </ul>
    {error && <p role="alert" className="text-xs text-destructive">文件无法读取，请重试。</p>}
    {source && <FilePreviewDialog source={source} onClose={() => setSource(null)} />}
  </section>
}
