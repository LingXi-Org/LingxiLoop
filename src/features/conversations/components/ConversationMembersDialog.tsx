import { toast } from 'sonner'
import { Avatar } from '@/components/Avatar'
import { useParticipants } from '@/features/agents/state'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/core/http'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import type { Conversation, Participant } from '@/types'
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
    <MembersStackButton conversation={conversation} onClick={() => setOpen(true)} />
    {open && <ConversationMembersDialog conversation={conversation} onClose={() => setOpen(false)} />}
  </>
}

function MembersStackButton({ conversation, onClick }: { conversation: Conversation; onClick: () => void }) {
  const byId = useParticipants(state => state.byId)
  const people = conversation.members.map(id => byId[id]).filter((person): person is Participant => Boolean(person)).slice(0, 3)
  return <button type="button" onClick={onClick} aria-label={`群成员 · ${conversation.members.length} 人`}
    className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full pe-2.5 ps-[5px] text-[12.5px] text-fg2 shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11">
    <span aria-hidden="true" className="inline-flex">
      {people.map((person, index) => <span key={person.id} className="inline-flex rounded-full shadow-[0_0_0_2px_var(--background)]" style={{ marginInlineStart: index ? -6 : 0 }}>
        <Avatar p={person} size={22} animated={false} ringColor="var(--background)" />
      </span>)}
    </span>
    {conversation.members.length}
  </button>
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
      const name = state.members.find(person => person.id === id)?.name ?? state.candidates.find(person => person.id === id)?.name ?? '成员'
      setNotice(remove ? null : `${name}已加入，可以查看本群历史`)
      if (remove) toast(`已移除${name}，原消息和学习证据会保留`, { action: { label: '撤销', onClick: () => void change(id, false) } })
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
  const byId = useParticipants(state => state.byId)
  const candidates = state?.candidates.filter(p => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? []
  const row = 'flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-[7px]'
  const avatarOf = (person: { id: string; name: string; kind: string }) => byId[person.id]
    ? <Avatar p={byId[person.id]!} size={28} animated={false} />
    : <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full border border-input bg-accent text-xs font-semibold text-fg2">{person.name.slice(0, 1)}</span>
  const role = (person: { kind: string }) => person.kind === 'agent' ? '智能体' : '成员'
  return <Dialog open onOpenChange={open => { if (!open && busy === null) onClose() }}>
    <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] w-[460px] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-[0_0_0_1px_var(--border),0_24px_60px_-12px_rgb(20_20_18/25%)]">
      <div className="flex shrink-0 items-start gap-2 px-[18px] pb-3 pt-[18px]">
        <DialogHeader className="flex-1 gap-0.5 text-start">
          <DialogTitle className="text-base font-semibold">群成员</DialogTitle>
          <DialogDescription className="text-[12.5px]">{conversation.title}{state ? ` · ${state.members.length} 人` : ''}</DialogDescription>
        </DialogHeader>
        <DialogClose disabled={busy !== null} aria-label="关闭" className="grid size-[30px] place-items-center rounded-lg text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </DialogClose>
      </div>
      {!state && !error && <div className="px-[18px] pb-4"><ResourceSkeleton variant="list" count={3} compact label="正在加载群成员" /></div>}
      {error && !state && <div className="px-[18px] pb-[18px]"><DialogError text={error} /></div>}
      {state && <>
        {state.canManage && <div className="shrink-0 px-[18px] pb-3">
          <label className="flex h-9 items-center gap-2 rounded-[9px] px-3 text-muted-foreground shadow-[0_0_0_1px_var(--input)] focus-within:shadow-[0_0_0_1px_var(--brand),0_0_0_4px_var(--brand-surface)]">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-[15px] shrink-0"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input aria-label="搜索可添加的成员" placeholder="添加成员或智能体" value={query} onChange={e => setQuery(e.target.value)} disabled={busy !== null}
              className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground" />
          </label>
        </div>}
        {notice && <p role="status" className="mx-[18px] mb-2.5 flex shrink-0 items-center gap-2 rounded-[9px] bg-brand-surface px-2.5 py-2 text-[12.5px] text-brand">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0"><path d="m5 12 5 5 9-10" /></svg>{notice}
        </p>}
        {error && <div className="mx-[18px] mb-2.5 shrink-0"><DialogError text={error} /></div>}
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
          {state.restriction && <p className="px-2 pb-2 text-[12.5px] text-muted-foreground">{restrictions[state.restriction]}</p>}
          {state.canManage && query.trim() && <section aria-label="添加成员" className="pb-2">
            <p className="px-2 pb-1 pt-1 text-[11.5px] text-muted-foreground">可添加</p>
            {candidates.length === 0 && <p className="px-2 py-2 text-[12.5px] text-muted-foreground">没有可添加的匹配成员。教师或学生需先加入本课程。</p>}
            {candidates.map(p => <div key={p.id} className={row}>
              {avatarOf(p)}
              <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-[13.5px]">{p.name}</span><span className="text-xs text-muted-foreground">{role(p)}</span></span>
              <button type="button" disabled={busy !== null || state.members.length >= 50} aria-label={`添加${p.name}`} onClick={() => void change(p.id, false)}
                className="h-7 shrink-0 rounded-lg bg-brand-surface px-2.5 text-[12.5px] font-medium text-brand hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40">{busy === p.id ? '处理中…' : '添加'}</button>
            </div>)}
          </section>}
          <section aria-label="当前成员">
            <p className="px-2 pb-1 pt-1 text-[11.5px] text-muted-foreground">当前成员</p>
            {state.members.map(p => <div key={p.id} className={row}>
              {avatarOf(p)}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13.5px]">{p.name}{p.id === meId ? '（我）' : ''}</span>
                <span className="text-xs text-muted-foreground">{p.departed_at ? '已离开学习区' : role(p)}</span>
              </span>
              {state.canManage && p.id !== meId && <button type="button" disabled={busy !== null} aria-label={`移除${p.name}`} onClick={() => void change(p.id, true)}
                className="h-7 shrink-0 rounded-lg px-2 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40">{busy === p.id ? '处理中…' : '移除'}</button>}
            </div>)}
          </section>
        </div>
      </>}
      <DialogFooter className="m-0 shrink-0 flex-row justify-end gap-1.5 border-t border-border bg-transparent px-4 py-3">
        {state?.restriction === 'managed_context' && workspace && <NewConversationDialog companyId={workspace.companyId} projectId={workspace.projectId}
          isMobile={false} onCreated={id => { if (current()) { useApp.getState().selectConversation(id); onClose() } }}
          trigger={<button type="button" className="h-[34px] rounded-[10px] px-3 text-[13.5px] font-medium text-fg2 shadow-[inset_0_0_0_1px_var(--input)] hover:bg-accent">新建普通群聊</button>} />}
        <button type="button" disabled={busy !== null} onClick={onClose} className="h-[34px] rounded-[10px] bg-brand px-3.5 text-[13.5px] font-medium text-brand-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40">完成</button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

/** Inline failure row shared by conversation dialogs. */
export function DialogError({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return <div role="alert" className="flex items-center gap-2.5 rounded-[10px] bg-[rgb(200_70_59/6%)] px-3 py-2.5">
    <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-[rgb(200_70_59/12%)] text-[#C8463B]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
    </span>
    <span className="min-w-0 flex-1 text-[13px] text-foreground">{text}</span>
    {onRetry && <button type="button" onClick={onRetry} className="h-7 shrink-0 rounded-lg bg-[rgb(200_70_59/10%)] px-2.5 text-[12.5px] font-semibold text-[#C8463B] focus-visible:outline-2 focus-visible:outline-ring">重试</button>}
  </div>
}
