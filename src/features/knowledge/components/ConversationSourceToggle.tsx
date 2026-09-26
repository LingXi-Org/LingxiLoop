import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useConversations } from '@/features/conversations/store'
import { useApp } from '@/stores/app'
import { userFacingError } from '@/lib/userFacingError'
import { useKnowledgeSources } from '../state'

export function ConversationSourceToggle({ projectId, sourceId }: { projectId: string; sourceId: string }) {
  const selectedId = useApp((state) => state.selectedConversationId)
  const conversation = useConversations((state) => state.projectId === projectId
    ? state.list.find((item) => item.id === selectedId && (item.kind === 'group' || item.kind === 'direct')) : undefined)
  const selection = useKnowledgeSources((state) => state.conversationSelection)
  const source = selection?.conversationId === conversation?.id ? selection?.sources.find((item) => item.sourceId === sourceId) : undefined
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const id = useId()

  useEffect(() => {
    let active = true
    setError('')
    setLoaded(false)
    if (conversation) void useKnowledgeSources.getState().loadConversationSelection(conversation.id)
      .then(() => { if (active) setLoaded(true) })
      .catch((reason) => { if (active) setError(userFacingError(reason, '对话资料状态加载失败。')) })
    return () => { active = false }
  }, [conversation?.id, attempt])

  if (!conversation) return null
  if (error) return <div role="alert" className="mt-4 flex items-center gap-3 text-sm text-destructive">{error}<Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>重试</Button></div>
  if (!loaded || !source || source.status !== 'ready') return null

  const toggle = async (enabled: boolean) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try { await useKnowledgeSources.getState().setSourceEnabled(conversation.id, sourceId, enabled) }
    catch (reason) { setError(userFacingError(reason, '对话资料设置未能保存。')) }
    finally { pending.current = false; setBusy(false) }
  }
  return <div className="mt-4 flex items-start gap-3 rounded-xl bg-muted/50 p-3">
    <Checkbox id={id} checked={source.enabled} disabled={busy} onCheckedChange={(checked) => void toggle(checked === true)} />
    <Label htmlFor={id} className="min-w-0 flex-col items-start gap-1"><span>用于当前对话</span><span className="font-normal text-muted-foreground">{conversation.title}</span></Label>
  </div>
}
