// Adapted from assistant-ui/examples/with-artifacts/app/artifact-surface.tsx,
// ff654d8156680b839774296ef644b57ab1078425 (MIT). See third_party/assistant-ui-with-artifacts.
// Its surface provider, active target and version workbench now use durable native artifacts.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeftIcon, HistoryIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ArtifactEditorFrame } from '@/features/artifacts/components/ArtifactEditorFrame'
import { artifactsApi, type SlideRevisions } from '@/features/artifacts/api'
import { userFacingError } from '@/lib/userFacingError'
import { useApp } from '@/stores/app'
import type { SlideEditorContext } from '../../../shared/slides-editor-context'

type ArtifactSurfaceTarget = { id: string; title: string; sourceConversationId: string | null }
type ArtifactSurfaceContextValue = {
  active: ArtifactSurfaceTarget | null
  open(target: ArtifactSurfaceTarget): void
  close(): void
  returnToOrigin(): void
}
const ArtifactSurfaceContext = createContext<ArtifactSurfaceContextValue | null>(null)

export function ArtifactSurfaceProvider({ children, initial, onClose }: {
  children: ReactNode; initial: ArtifactSurfaceTarget; onClose(): void
}) {
  const [active, setActive] = useState<ArtifactSurfaceTarget | null>(initial)
  const value = useMemo<ArtifactSurfaceContextValue>(() => ({
    active: active?.id === initial.id ? { ...active, title: initial.title } : active, open: setActive,
    close: onClose,
    returnToOrigin: () => {
      if (active?.sourceConversationId) useApp.getState().selectConversation(active.sourceConversationId)
    },
  }), [active, initial.id, initial.title, onClose])
  return <ArtifactSurfaceContext.Provider value={value}>{children}</ArtifactSurfaceContext.Provider>
}

export function useArtifactSurface() {
  const value = useContext(ArtifactSurfaceContext)
  if (!value) throw new Error('useArtifactSurface must be used within ArtifactSurfaceProvider')
  return value
}

export function ArtifactSurface({ onEditorContext, context, agentWorking }: {
  onEditorContext(context: SlideEditorContext): void; context: SlideEditorContext | null; agentWorking: boolean
}) {
  const { active } = useArtifactSurface()
  if (!active) return null
  return <ArtifactWorkbench key={active.id} target={active} onEditorContext={onEditorContext} context={context} agentWorking={agentWorking} />
}

function ArtifactWorkbench({ target, onEditorContext, context, agentWorking }: {
  target: ArtifactSurfaceTarget; onEditorContext(context: SlideEditorContext): void
  context: SlideEditorContext | null; agentWorking: boolean
}) {
  const { close, returnToOrigin } = useArtifactSurface()
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyRef = useRef<HTMLDivElement>(null)
  const [versions, setVersions] = useState<SlideRevisions | null>(null)
  const [historyError, setHistoryError] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [exitPresentation, setExitPresentation] = useState(0)
  const presenting = context?.mode === 'present'

  useEffect(() => {
    if (!historyOpen) return
    let live = true
    setHistoryError('')
    artifactsApi.revisions(target.id).then(result => { if (live) setVersions(result) })
      .catch(error => { if (live) setHistoryError(userFacingError(error, '版本记录暂时无法加载。')) })
    const dismissPointer = (event: PointerEvent) => { if (!historyRef.current?.contains(event.target as Node)) setHistoryOpen(false) }
    const dismissKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setHistoryOpen(false) }
    document.addEventListener('pointerdown', dismissPointer)
    document.addEventListener('keydown', dismissKey)
    return () => {
      live = false
      document.removeEventListener('pointerdown', dismissPointer)
      document.removeEventListener('keydown', dismissKey)
    }
  }, [historyOpen, target.id])

  const restore = async (seq: string) => {
    if (!versions || context?.dirty) return
    setRestoring(true)
    try {
      await artifactsApi.restoreRevision(target.id, seq, versions.current)
      setHistoryOpen(false)
      toast.success('已恢复为新版本，可在版本记录中找回之后的修改。')
    } catch (error) { setHistoryError(userFacingError(error, '稿件已有新修改，请重新打开版本记录后重试。')) }
    finally { setRestoring(false) }
  }

  return <aside data-testid="artifact-surface" aria-label={`演示文稿：${target.title}`}
    className={`flex h-full min-h-0 min-w-0 flex-col bg-background ${presenting ? 'fixed inset-0 z-50' : ''}`}>
    <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border px-2">
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{target.title}</h2>
      {presenting ? <Button variant="outline" className="min-h-10" onClick={() => setExitPresentation(value => value + 1)}>退出放映</Button> : <>
        <div className="relative" ref={historyRef}>
          <Button variant="ghost" className="min-h-10" aria-label="版本记录" aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}>
            <HistoryIcon className="size-4" />版本
          </Button>
          {historyOpen && <div className="absolute right-0 top-11 z-20 max-h-80 w-64 overflow-y-auto rounded-md border bg-popover p-2 shadow-lg" aria-label="版本记录">
            {context?.dirty && <p className="p-2 text-xs text-muted-foreground">保存当前修改后即可恢复版本。</p>}
            {historyError && <p role="alert" className="p-2 text-sm">{historyError}</p>}
            {!versions ? <p role="status" className="p-2 text-sm">正在加载版本…</p> : !versions.revisions.length ? <p className="p-2 text-sm">首次保存后会显示版本。</p>
              : versions.revisions.map(version => <Button key={version.seq} variant="ghost" className="h-auto min-h-11 w-full justify-start whitespace-normal text-start"
                disabled={restoring || context?.dirty || version.version === versions.current} onClick={() => void restore(version.seq)}>
                <span>版本 {version.seq} · {new Date(version.createdAt).toLocaleString()}{version.version === versions.current ? ' · 当前' : ''}</span>
              </Button>)}
          </div>}
        </div>
        {target.sourceConversationId && <Button variant="ghost" className="min-h-10" onClick={returnToOrigin} aria-label="打开来源对话"><ArrowLeftIcon className="size-4" /><span className="hidden xl:inline">来源对话</span></Button>}
        <Button variant="ghost" size="icon" className="size-10" aria-label="返回演示文稿列表" onClick={close}><XIcon className="size-4" /></Button>
      </>}
    </header>
    <div className="min-h-0 flex-1">
      <ArtifactEditorFrame artifactId={target.id} kind="slides" title={target.title} onEditorContext={onEditorContext}
        agentWorking={agentWorking} exitPresentation={exitPresentation} />
    </div>
  </aside>
}
