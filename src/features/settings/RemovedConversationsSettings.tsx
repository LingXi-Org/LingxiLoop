import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { notifyAction } from '@/lib/actionToast'
import { userFacingError } from '@/lib/userFacingError'
import { conversationsApi } from '@/features/conversations/api'
import type { ApiConversation } from '@/features/conversations/contracts'
import { captureConversationScope, useConversations } from '@/features/conversations/store'
import { SettingsGroup } from './SettingsComponents'

/** Mounted with a user/company/project key so closed and pending views cannot cross scopes. */
export function RemovedConversationsSettings() {
  const [rows, setRows] = useState<ApiConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const request = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController(), current = captureConversationScope()
    request.current = controller
    setLoading(true); setError(null); setRows([])
    void conversationsApi.getRemovedConversations(controller.signal).then(result => {
      if (!controller.signal.aborted && current()) setRows(result)
    }).catch(reason => {
      if (!controller.signal.aborted && current()) setError(userFacingError(reason, '暂时无法加载已删除的对话。'))
    }).finally(() => {
      if (!controller.signal.aborted && current()) setLoading(false)
    })
    return () => controller.abort()
  }, [attempt])

  const restore = async (row: ApiConversation) => {
    const scopeCurrent = captureConversationScope(), controller = request.current
    const current = () => Boolean(controller && !controller.signal.aborted && scopeCurrent())
    if (!current() || pending !== null) return
    setPending(row.id); setError(null)
    try {
      if (await useConversations.getState().restore(row.id) && current()) {
        setRows(previous => previous.filter(item => item.id !== row.id))
        notifyAction({ title: '对话已恢复', description: row.title })
      }
    } catch (reason) {
      if (current()) setError(userFacingError(reason, '恢复失败，请稍后重试。'))
    } finally { if (current()) setPending(null) }
  }

  return <SettingsGroup title="已删除的对话" description="仅从你的列表移除，消息和成员关系仍保留。">
    <div className="p-4">
      {loading ? <ResourceSkeleton variant="list" count={3} label="正在加载已删除的对话" /> : <>
        {error && <div role="alert" className="mb-3 grid gap-2 text-sm text-destructive"><p>{error}</p><Button type="button" variant="outline" size="sm" disabled={pending !== null} onClick={() => setAttempt(value => value + 1)}>重试</Button></div>}
        {!error && rows.length === 0 && <p role="status" className="py-6 text-center text-sm text-muted-foreground">没有已删除的对话</p>}
        <ul aria-label="已删除的对话" className="grid gap-2">{rows.map(row => <li key={row.id} className="flex min-w-0 items-center gap-3 rounded-lg border p-3">
          <span className="min-w-0 flex-1 truncate">{row.title}</span>
          <Button type="button" variant="outline" size="sm" disabled={pending !== null} onClick={() => void restore(row)} aria-label={`恢复“${row.title}”`}>{pending === row.id ? '正在恢复…' : '恢复'}</Button>
        </li>)}</ul>
      </>}
    </div>
  </SettingsGroup>
}
