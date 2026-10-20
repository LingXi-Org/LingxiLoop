import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { notifyAction } from '@/lib/actionToast'
import { userFacingError } from '@/lib/userFacingError'
import { conversationsApi } from '../api'
import type { ApiConversation } from '../contracts'
import { captureConversationScope, useConversations } from '../store'

/** Mounted with a user/company/project key so closed and pending views cannot cross scopes. */
export function RemovedConversationsDialog() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ApiConversation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController(), current = captureConversationScope()
    setLoading(true); setError(null); setRows([])
    void conversationsApi.getRemovedConversations(controller.signal).then(result => {
      if (!controller.signal.aborted && current()) setRows(result)
    }).catch(reason => {
      if (!controller.signal.aborted && current()) setError(userFacingError(reason, '暂时无法加载已删除的对话。'))
    }).finally(() => {
      if (!controller.signal.aborted && current()) setLoading(false)
    })
    return () => controller.abort()
  }, [open, attempt])

  const restore = async (row: ApiConversation) => {
    const current = captureConversationScope()
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

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" variant="ghost" size="sm" className="omb-no-drag w-full justify-start text-muted-foreground">已删除的对话</Button></DialogTrigger>
    <DialogContent className="max-h-[80dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>已删除的对话</DialogTitle><DialogDescription>这里仅移除了你的列表记录。消息和成员关系仍保留，可随时恢复。</DialogDescription></DialogHeader>
      {loading ? <ResourceSkeleton variant="list" count={3} label="正在加载已删除的对话" /> : <>
        {error && <div role="alert" className="grid gap-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>重试</Button></div>}
        {!error && rows.length === 0 && <p role="status" className="py-6 text-center text-sm text-muted-foreground">没有已删除的对话</p>}
        <ul className="grid gap-2">{rows.map(row => <li key={row.id} className="flex min-w-0 items-center gap-3 rounded-lg border p-3">
          <span className="min-w-0 flex-1 truncate">{row.title}</span>
          <Button type="button" variant="outline" size="sm" disabled={pending !== null} onClick={() => void restore(row)} aria-label={`恢复“${row.title}”`}>{pending === row.id ? '正在恢复…' : '恢复'}</Button>
        </li>)}</ul>
      </>}
    </DialogContent>
  </Dialog>
}
