import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import type { CanvasFrame } from '../contracts'
import type { CanvasReference } from '../mcp-app/contract'
import { createCanvasAppHost } from '../mcp-app/host'
import { upsertCanvasFrame } from '../lib/realtime'
import { useCanvas } from '../state'

export function CanvasDocumentEditor({ frame, visible, onReference, onDirty }: {
  frame: CanvasFrame; visible: boolean
  onReference(reference: CanvasReference): void
  onDirty(dirty: boolean): void
}) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const host = useRef<ReturnType<typeof createCanvasAppHost> | null>(null)
  const props = useRef({ frame, onReference, onDirty })
  props.current = { frame, onReference, onDirty }
  const [phase, setPhase] = useState<'connecting' | 'ready' | 'error'>('connecting')
  const [retry, setRetry] = useState(0)
  const dirty = useRef(false)
  useEffect(() => {
    if (!iframe.current) return
    setPhase('connecting')
    const owner = createCanvasAppHost({
      iframe: iframe.current, frame: props.current.frame,
      onPhase: setPhase,
      onDirty: value => { dirty.current = value; props.current.onDirty(value) },
      onReference: reference => props.current.onReference(reference),
      confirmReload: () => confirmSensitiveAction({ title: '重新载入已保存版本？', description: '当前未保存的草稿会被替换。你可以先取消并复制需要保留的文字。', confirmLabel: '重新载入', tone: 'warning' }),
      onFrame: saved => useCanvas.setState(state => ({
        ...(state.snapshot?.id === saved.canvasId ? { snapshot: { ...state.snapshot, frames: upsertCanvasFrame(state.snapshot.frames, saved) } } : {}),
        ...(state.previews[saved.canvasId] ? { previews: { ...state.previews, [saved.canvasId]: { ...state.previews[saved.canvasId], frames: upsertCanvasFrame(state.previews[saved.canvasId].frames, saved) } } } : {}),
      })),
    })
    host.current = owner
    return () => { host.current = null; void owner.dispose() }
  }, [frame.id, frame.canvasId, retry])
  useEffect(() => { host.current?.update(frame) }, [frame])

  return <div hidden={!visible} className="relative h-full min-h-0" data-canvas-app-phase={phase}>
    {phase === 'connecting' && <span role="status" className="absolute inset-x-3 top-3 text-xs">正在连接编辑器…</span>}
    {phase === 'error' && <div role="alert" className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-background p-3 text-xs">
      <span>连接已失效。可先复制仍在页面内的草稿，再重试。</span>
      <Button size="sm" variant="outline" onClick={() => { void (async () => {
        if (dirty.current && !await confirmSensitiveAction({ title: '重新打开编辑器？', description: '未保存的草稿会被替换，请先复制需要保留的文字。', confirmLabel: '重新打开', tone: 'warning' })) return
        dirty.current = false; props.current.onDirty(false); setRetry(value => value + 1)
      })() }}>重试编辑器</Button>
    </div>}
    <iframe ref={iframe} title={`文档编辑器：${frame.title}`} sandbox="allow-scripts" referrerPolicy="no-referrer" className="h-full w-full border-0" data-canvas-document-app />
  </div>
}
