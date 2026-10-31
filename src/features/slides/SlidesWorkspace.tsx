// Adapted from assistant-ui/examples/with-artifacts/app/page.tsx (MIT, ff654d8).
// ArtifactExperience/ArtifactScopes retain their conversation + active surface composition;
// the native runtime supplies tools, persisted messages, ACLs and the shared usage ledger.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { artifactsApi, type SlideWorkspace } from '@/features/artifacts/api'
import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { ConversationRuntimeProvider } from '@/features/chat/runtime'
import { useConversationPresence } from '@/features/chat/runtime/runtime'
import { useConversations } from '@/features/conversations/store'
import { useParticipants } from '@/features/agents/state'
import { useIsMobile } from '@/hooks/use-mobile'
import { userFacingError } from '@/lib/userFacingError'
import { ArtifactSurface, ArtifactSurfaceProvider } from './artifact-surface'
import type { SlideEditorContext } from '../../../shared/slides-editor-context'

function ArtifactExperience({ workspace, context, syncContext, syncError }: {
  workspace: SlideWorkspace; context: SlideEditorContext | null; syncContext(context: SlideEditorContext): void; syncError: string
}) {
  const mobile = useIsMobile()
  const presence = useConversationPresence(workspace.conversationId)
  const readOnly = useConversations(state => state.list.find(item => item.id === workspace.conversationId)?.readOnly)
  return <main className="h-full min-h-0 overflow-hidden bg-background" data-slides-workspace>
    <ResizablePanelGroup orientation={mobile ? 'vertical' : 'horizontal'}>
      <ResizablePanel id="slides-conversation" defaultSize="36%" minSize={mobile ? '25%' : '28%'} className="min-h-0 min-w-0">
        <section aria-label="演示文稿对话" className="chat-surface flex h-full min-h-0 min-w-0 flex-col">
          <header className="shrink-0 border-b px-3 py-2">
            <h2 className="text-sm font-medium">演示文稿助手</h2>
            <p className="text-xs text-muted-foreground" role="status">{context?.slideId ? `第 ${context.slideIndex} 页${context.selectedElementIds.length ? ` · 已选 ${context.selectedElementIds.length} 个元素` : ''}` : '选中页面或元素后，可以直接说明修改。'}{context?.dirty ? ' · 正在保存修改' : ''}</p>
            {syncError && <p role="alert" className="text-xs text-destructive">{syncError}</p>}
          </header>
          <div className="chat-thread-layout min-h-0 min-w-0 flex-1"><ConversationThread conversationId={workspace.conversationId} readOnly={readOnly} /></div>
        </section>
      </ResizablePanel>
      <ResizableHandle withHandle aria-label="调整对话与演示文稿的大小" />
      <ResizablePanel id="slides-editor" defaultSize="64%" minSize="35%" className="min-h-0 min-w-0">
        <ArtifactSurface context={context} onEditorContext={syncContext} agentWorking={presence.activeAgentIds.length > 0} />
      </ResizablePanel>
    </ResizablePanelGroup>
  </main>
}

export function SlidesWorkspace({ artifactId, title, onClose }: { artifactId: string; title: string; onClose(): void }) {
  const [workspace, setWorkspace] = useState<SlideWorkspace | null>(null)
  const [context, setContext] = useState<SlideEditorContext | null>(null)
  const [error, setError] = useState('')
  const [syncError, setSyncError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const pending = useRef(Promise.resolve())
  const failed = useRef(false)
  const abort = useRef(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    abort.current = controller
    setError('')
    artifactsApi.slideWorkspace(artifactId, controller.signal).then(async result => {
      await Promise.all([useConversations.getState().reload(), useParticipants.getState().refresh()])
      if (!controller.signal.aborted) setWorkspace(result)
    }).catch(reason => { if (!controller.signal.aborted) setError(userFacingError(reason, '演示文稿工作区暂时无法打开。')) })
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
  if (error) return <div className="grid h-full place-content-center gap-3 p-6" role="alert"><p>{error}</p>
    <Button onClick={() => { setAttempt(value => value + 1); setError('') }}>重试</Button><Button variant="ghost" onClick={onClose}>返回列表</Button></div>
  if (!workspace) return <ResourceSkeleton variant="media" label="正在打开演示文稿工作区" />
  return <ConversationRuntimeProvider key={`${workspace.conversationId}:${attempt}`} conversationId={workspace.conversationId} beforeSend={beforeSend}>
    <ArtifactSurfaceProvider initial={{ id: artifactId, title, sourceConversationId: workspace.sourceConversationId }} onClose={onClose}>
      <ArtifactExperience workspace={workspace} context={context} syncContext={syncContext} syncError={syncError} />
    </ArtifactSurfaceProvider>
  </ConversationRuntimeProvider>
}
