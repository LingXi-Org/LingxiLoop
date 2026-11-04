import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/core/http'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import type { Conversation } from '@/types'
import { conversationsApi } from '../api'
import type { ConversationMembership } from '../contracts'
import { captureConversationScope, useConversations } from '../store'
import { NewConversationDialog } from './NewConversationDialog'

const restrictions = {
  managed_context: '此会话的成员由原任务或课程管理。需要其他人协作时，请新建普通群聊，只分享允许共享的任务内容。',
  read_only: '当前课程或学习区为只读，暂时不能调整成员。',
  manager_required: '请联系群内课程教师或建群者调整成员。较早创建的群聊未记录建群者时，由群内课程教师管理。',
}

export function ConversationMembersButton({ conversation }: { conversation: Conversation }) {
  const [open, setOpen] = useState(false)
  return <>
    <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setOpen(true)} aria-label="管理群成员">成员</Button>
    {open && <ConversationMembersDialog conversation={conversation} onClose={() => setOpen(false)} />}
  </>
}

export function ConversationMembersDialog({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const meId = useAuth(state => state.user?.id)
  const companyId = useAuth(state => state.activeCompanyId)
  const workspace = getWorkspaceSession()
  return <Members key={`${companyId}:${workspace?.projectId}:${meId}:${conversation.id}`}
    conversation={conversation} onClose={onClose} meId={meId} />
}

function Members({ conversation, onClose, meId }: { conversation: Conversation; onClose: () => void; meId?: string }) {
  const [state, setState] = useState<ConversationMembership | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const mounted = useRef(false)
  const submitting = useRef(false)
  const scope = useRef(captureConversationScope())
  const workspace = getWorkspaceSession()
  const current = () => mounted.current && scope.current()
  const refresh = async () => {
    const next = await conversationsApi.membership(conversation.id)
    if (current()) setState(next)
  }
  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    void conversationsApi.membership(conversation.id, controller.signal)
      .then(next => { if (current()) setState(next) })
      .catch(() => { if (current() && !controller.signal.aborted) setError('成员加载失败，请关闭后重试。') })
    return () => { mounted.current = false; controller.abort() }
  }, [conversation.id])

  const change = async (id: string, remove: boolean) => {
    if (submitting.current || !current() || !state?.canManage) return
    submitting.current = true
    setBusy(id); setError(null); setNotice(null)
    let committed = false
    try {
      const result = remove ? await conversationsApi.removeMember(conversation.id, id) : await conversationsApi.addMember(conversation.id, id)
      committed = true
      if (!current()) return
      setNotice(remove ? '成员已移除，原消息和学习证据保留。' : '成员已加入，可查看本群历史。')
      if ('publication' in result && result.publication === 'queued') setNotice('成员变更已保存，正在更新会话。')
      await refresh()
      await useConversations.getState().reload()
    } catch (reason) {
      if (current()) setError(committed ? '成员变更已保存，列表刷新失败，请关闭后重新打开核对。'
        : reason instanceof ApiError && (reason.status === 403 || reason.status === 404)
          ? '当前无权调整此群成员，请联系群内课程教师。'
          : '成员变更未确认，请关闭后重新打开核对。只可添加当前课程或学习区的有效成员与普通智能体，群人数上限为 50。')
      if (current() && !committed) await refresh().catch(() => undefined)
    } finally {
      submitting.current = false
      if (current()) setBusy(null)
    }
  }
  const candidates = state?.candidates.filter(p => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? []
  return <Dialog open onOpenChange={open => { if (!open && busy === null) onClose() }}>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-hidden">
      <DialogHeader className="shrink-0 pe-8">
        <DialogTitle>群成员</DialogTitle>
        <DialogDescription>{conversation.title}。新成员可查看本群已有消息；不会获得其他私聊或任务会话的访问权。</DialogDescription>
      </DialogHeader>
      {!state && !error && <ResourceSkeleton variant="list" count={3} compact label="正在加载群成员" />}
      {state && <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {state.restriction && <p className="text-sm text-muted-foreground">{restrictions[state.restriction]}</p>}
        <section aria-label="当前成员" className="space-y-1">
          <p className="text-sm font-medium">当前成员 · {state.members.length}</p>
          {state.members.map(p => <div key={p.id} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1">
            <span className="min-w-0 flex-1 break-words text-sm">{p.name}{p.id === meId ? '（我）' : ''}{p.departed_at ? '（已离开学习区）' : ''}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{p.kind === 'agent' ? '智能体' : '成员'}</span>
            {state.canManage && p.id !== meId && <Button variant="ghost" size="sm" disabled={busy !== null} aria-label={`移除${p.name}`} onClick={() => void change(p.id, true)}>{busy === p.id ? '处理中…' : '移除'}</Button>}
          </div>)}
        </section>
        {state.canManage && <section aria-label="添加成员" className="space-y-2">
          <p className="text-sm font-medium">添加成员或智能体</p>
          <Input aria-label="搜索可添加的成员" placeholder="搜索成员或智能体" value={query} onChange={e => setQuery(e.target.value)} disabled={busy !== null} />
          {candidates.length === 0 && <p className="text-sm text-muted-foreground">没有可添加的匹配成员。教师或学生需先加入本课程。</p>}
          {candidates.map(p => <div key={p.id} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1">
            <span className="min-w-0 flex-1 break-words text-sm">{p.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{p.kind === 'agent' ? '智能体' : '成员'}</span>
            <Button variant="outline" size="sm" disabled={busy !== null || state.members.length >= 50} aria-label={`添加${p.name}`} onClick={() => void change(p.id, false)}>{busy === p.id ? '处理中…' : '添加'}</Button>
          </div>)}
        </section>}
      </div>}
      {notice && <p role="status" className="shrink-0 text-sm text-muted-foreground">{notice}</p>}
      {error && <p role="alert" className="shrink-0 text-sm text-destructive">{error}</p>}
      <DialogFooter className="shrink-0">
        {state?.restriction === 'managed_context' && workspace && <NewConversationDialog companyId={workspace.companyId} projectId={workspace.projectId}
          isMobile={false} onCreated={id => { if (current()) { useApp.getState().selectConversation(id); onClose() } }}
          trigger={<Button type="button" variant="outline">新建普通群聊</Button>} />}
        <Button type="button" disabled={busy !== null} onClick={onClose}>完成</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
