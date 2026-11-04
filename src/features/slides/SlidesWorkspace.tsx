// Adapted from assistant-ui/examples/with-artifacts/app/page.tsx (MIT, ff654d8).
// ArtifactExperience/ArtifactScopes retain their conversation + active surface composition;
// the native runtime supplies tools, persisted messages, ACLs and the shared usage ledger.
import { lazy, type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { PageHeader } from '@/components/shell/PageHeader'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { artifactsApi, type SlideWorkspace } from '@/features/artifacts/api'
import { useChatThreadStore } from '@/features/chat/runtime/store'
import { useConversations } from '@/features/conversations/store'
import { useParticipants } from '@/features/agents/state'
import { useIsMobile } from '@/hooks/use-mobile'
import { userFacingError } from '@/lib/userFacingError'
import { ArtifactSurface, ArtifactSurfaceProvider } from './artifact-surface'
import type { SlideEditorContext } from '../../../shared/slides-editor-context'

const loadSlidesConversation = () => import('./SlidesConversation')
const SlidesConversation = lazy(() => loadSlidesConversation().then(module => ({ default: module.SlidesConversation })))
export const preloadSlidesAssistant = () => loadSlidesConversation()

function ArtifactExperience({ agentWorking, children, context, syncContext, syncError, onClose, visible }: {
  visible: boolean; agentWorking: boolean; children: ReactNode; context: SlideEditorContext | null; syncContext(context: SlideEditorContext): void; syncError: string; onClose(): void
}) {
  const mobile = useIsMobile()
  return <main className="h-full min-h-0 overflow-hidden bg-background" data-slides-workspace>
    <ResizablePanelGroup orientation={mobile ? 'vertical' : 'horizontal'}>
      <ResizablePanel id="slides-conversation" defaultSize="40%" minSize={mobile ? '25%' : '28%'} className="min-h-0 min-w-0">
        <section aria-label="演示文稿对话" className="chat-surface flex h-full min-h-0 min-w-0 flex-col">
          <PageHeader title="演示文稿助手" crumbs={[{ label: '演示文稿', onSelect: onClose }]} />
          <div className="shrink-0 border-b border-[var(--im-divider-weak)] px-6 py-2 max-md:px-3">
            <p className="text-xs text-muted-foreground" role="status">{context?.slideId ? `第 ${context.slideIndex} 页${context.selectedElementIds.length ? ` · 已选 ${context.selectedElementIds.length} 个元素` : ''}` : '选中页面或元素后，可以直接说明修改。'}{context?.dirty ? ' · 正在保存修改' : ''}</p>
            {syncError && <p role="alert" className="text-xs text-destructive">{syncError}</p>}
          </div>
          <div className="chat-thread-layout min-h-0 min-w-0 flex-1">{children}</div>
        </section>
      </ResizablePanel>
      <ResizableHandle withHandle className="desktop-panel-resize-handle" aria-label="调整对话与演示文稿的大小" title="拖动调整对话与演示文稿宽度" />
      <ResizablePanel id="slides-editor" defaultSize="60%" minSize="35%" className="min-h-0 min-w-0">
        <ArtifactSurface context={context} onEditorContext={syncContext} agentWorking={agentWorking} visible={visible} />
      </ResizablePanel>
    </ResizablePanelGroup>
  </main>
}

export function SlidesWorkspace({ artifactId, title, onClose, visible = true }: { artifactId: string; title: string; onClose(): void; visible?: boolean }) {
  const [workspace, setWorkspace] = useState<SlideWorkspace | null>(null)
  const [context, setContext] = useState<SlideEditorContext | null>(null)
  const [error, setError] = useState('')
  const [syncError, setSyncError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const agentWorking = useChatThreadStore(state => Object.values(state.conversations[workspace?.conversationId ?? '']?.activeRuns ?? {})
    .some(run => run.state === 'queued' || run.state === 'running'))
  const pending = useRef(Promise.resolve())
  const failed = useRef(false)
  const abort = useRef(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    abort.current = controller
    return () => controller.abort()
  }, [artifactId])
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    artifactsApi.slideWorkspace(artifactId, controller.signal).then(async result => {
      void useParticipants.getState().refresh()
      // A channel already in this workspace's authorized list is usable now; the
      // refresh only has to finish first for a newly created assistant channel.
      const refreshed = useConversations.getState().reload()
      if (!useConversations.getState().list.some(item => item.id === result.conversationId)) await refreshed
      if (!controller.signal.aborted) setWorkspace(result)
    }).catch(reason => { if (!controller.signal.aborted) setError(userFacingError(reason, '演示文稿助手暂时无法打开。')) })
    return () => controller.abort()
  }, [artifactId, attempt])
  const syncContext = useCallback((value: SlideEditorContext) => {
    setContext(value)
    pending.current = pending.current.then(async () => {
      if (abort.current.signal.aborted) return
      try {
        await artifactsApi.editorContext(artifactId, value, abort.current.signal)
        failed.current = false
        setSyncError('')
      } catch {
        failed.current = true
        if (!abort.current.signal.aborted) setSyncError('编辑上下文尚未同步，请稍后再发送。')
      }
    })
  }, [artifactId])
  const beforeSend = useCallback(async () => {
    let current
    do { current = pending.current; await current } while (current !== pending.current)
    if (failed.current) throw new Error('编辑上下文尚未同步，请稍后重试。')
  }, [])
  const conversation = error ? <div className="grid h-full place-items-center p-6" role="alert"><div className="flex max-w-sm flex-col items-center gap-3 text-center">
    <p className="text-sm text-muted-foreground">{error}</p>
    <div className="flex gap-2"><Button onClick={() => { setAttempt(value => value + 1); setError('') }}>重试</Button><Button variant="outline" onClick={onClose}>返回列表</Button></div></div></div>
    : <Suspense fallback={<ResourceSkeleton variant="media" label="正在打开演示文稿助手" />}>
      <SlidesConversation key={attempt} conversationId={workspace?.conversationId ?? null} beforeSend={beforeSend} />
    </Suspense>
  // The editor has its own authorized grant; IM setup and roster loading must not gate it.
  return <ArtifactSurfaceProvider initial={{ id: artifactId, title, sourceConversationId: workspace?.sourceConversationId ?? null }} onClose={onClose}>
    <ArtifactExperience visible={visible} agentWorking={agentWorking} context={context} syncContext={syncContext} syncError={syncError} onClose={onClose}>
      {conversation}
    </ArtifactExperience>
  </ArtifactSurfaceProvider>
}
