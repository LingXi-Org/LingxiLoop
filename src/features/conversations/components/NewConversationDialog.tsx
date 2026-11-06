import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { ApiError } from '@/api/core/http'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { participantRoleZh } from '@/lib/participantRole'
import { useParticipants } from '@/features/agents/state'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { userFacingError } from '@/lib/userFacingError'
import { useAuth } from '@/stores/auth'
import { conversationsApi } from '../api'
import { captureConversationScope, useConversations } from '../store'

export function NewConversationDialog({ companyId, projectId, isMobile, onCreated, trigger }: {
  companyId: string
  projectId: string
  isMobile: boolean
  onCreated: (id: string) => void
  trigger?: ReactNode
}) {
  const meId = useAuth((state) => state.user?.id)
  const byId = useParticipants((state) => state.byId)
  const loaded = useParticipants((state) => state.loaded)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const creationIntent = useRef<{ fingerprint: string; requestId: string } | null>(null)
  const submitting = useRef(false)
  const mounted = useRef(false)
  const formId = useId()
  const titleId = useId()

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const candidates = Object.values(byId).filter((participant) =>
    participant.id !== meId && !participant.departedAt && !participant.managed,
  )
  const visible = candidates.filter((participant) => participant.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const selectionValid = selectedIds.length > 0 && selectedIds.every((id) => candidates.some((participant) => participant.id === id))
  const isCurrentWorkspace = () => {
    const workspace = getWorkspaceSession()
    return mounted.current && workspace?.companyId === companyId && workspace.projectId === projectId
      && useAuth.getState().user?.id === meId && useAuth.getState().activeCompanyId === companyId
  }

  const changeOpen = (next: boolean) => {
    if (submitting.current) return
    setOpen(next)
    if (next) {
      creationIntent.current = null
      setQuery(''); setSelectedIds([]); setTitle(''); setError(null); setCreatedId(null)
    }
  }

  const submit = async () => {
    if (submitting.current || (!createdId && !selectionValid) || !isCurrentWorkspace()) return
    const scopeIsCurrent = captureConversationScope()
    submitting.current = true
    setBusy(true); setError(null)
    let conversationId = createdId
    try {
      if (!conversationId) {
        const input = { participantIds: selectedIds,
          ...(selectedIds.length > 1 && title.trim() ? { title: title.trim() } : {}) }
        const fingerprint = JSON.stringify([[...selectedIds].sort(), input.title ?? ''])
        if (creationIntent.current?.fingerprint !== fingerprint) {
          creationIntent.current = { fingerprint, requestId: crypto.randomUUID() }
        }
        const result = await conversationsApi.create(projectId, { ...input, requestId: creationIntent.current.requestId })
        if (!isCurrentWorkspace() || !scopeIsCurrent()) return
        conversationId = result.id
        setCreatedId(conversationId)
      }
      await useConversations.getState().reload()
      if (!isCurrentWorkspace() || !scopeIsCurrent()) return
      const refreshed = useConversations.getState()
      if (refreshed.error || !refreshed.loaded || refreshed.loading || refreshed.projectId !== projectId || !refreshed.list.some((item) => item.id === conversationId)) {
        setError('对话已就绪，但列表刷新失败，请重试刷新。')
        return
      }
      setOpen(false)
      onCreated(conversationId)
    } catch (reason) {
      if (isCurrentWorkspace() && scopeIsCurrent()) setError(conversationId
        ? '对话已就绪，但列表刷新失败，请重试刷新。'
        : reason instanceof ApiError && (reason.code === 'invalid_members' || reason.code === 'invalid_selection')
          ? '所选参与者已不可用或不属于当前项目，请重新选择。'
          : reason instanceof ApiError && reason.code === 'creation_conflict'
            ? '本次创建请求的选择已发生变化，请关闭后重新创建。'
            : userFacingError(reason, '暂时无法创建对话，请稍后重试。'))
    } finally {
      submitting.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button type="button" variant="ghost" size="icon" className={isMobile ? 'size-11 shrink-0 rounded-lg text-fg2' : 'size-9 shrink-0 rounded-lg text-fg2 hover:bg-accent'} aria-label="新建对话" title="新建对话">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
        </Button>}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] w-[460px] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-[0_0_0_1px_var(--border),0_24px_60px_-12px_rgb(20_20_18/25%)]">
        <div className="flex shrink-0 items-start gap-2 px-[18px] pb-3 pt-[18px]">
          <DialogHeader className="flex-1 gap-0.5 text-start">
            <DialogTitle className="text-base font-semibold">新建对话</DialogTitle>
            <DialogDescription className="text-[12.5px]">选一个人开始私信，选多个人自动变成群聊</DialogDescription>
          </DialogHeader>
          <DialogClose disabled={busy} aria-label="关闭" className="grid size-[30px] place-items-center rounded-lg text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </DialogClose>
        </div>
        <form id={formId} className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); void submit() }} aria-busy={busy}>
          <div className="flex shrink-0 flex-col gap-2.5 px-[18px] pb-3">
            <label className="flex h-9 items-center gap-2 rounded-[9px] px-3 text-muted-foreground shadow-[0_0_0_1px_var(--input)] focus-within:shadow-[0_0_0_1px_var(--brand),0_0_0_4px_var(--brand-surface)]">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-[15px] shrink-0"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索成员或智能助教" aria-label="搜索参与者" disabled={busy || Boolean(createdId)}
                className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground" />
            </label>
            {selectedIds.length > 0 && <div className="flex flex-wrap gap-1.5" aria-label="已选择">
              {selectedIds.map(id => byId[id] && <span key={id} className="inline-flex h-[26px] items-center gap-[5px] rounded-full bg-accent pe-1.5 ps-[3px] text-[12.5px]">
                <Avatar p={byId[id]!} size={20} animated={false} ringColor="transparent" />{byId[id]!.name}
                <button type="button" aria-label={`取消选择${byId[id]!.name}`} disabled={busy || Boolean(createdId)} onClick={() => setSelectedIds(current => current.filter(item => item !== id))}
                  className="grid size-4 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </span>)}
            </div>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2" role="group" aria-label="参与者">
            {!loaded && <ResourceSkeleton variant="list" count={4} compact label="正在加载参与者" />}
            {loaded && visible.length === 0 && <p className="p-4 text-center text-[12.5px] text-muted-foreground">{query.trim() ? '没有找到匹配的参与者' : '暂无可选择的参与者'}</p>}
            {(['agent', 'human'] as const).map(kind => {
              const group = visible.filter(participant => (participant.kind === 'agent') === (kind === 'agent'))
              if (!group.length) return null
              return <div key={kind} role="group" aria-label={kind === 'agent' ? '智能助教' : '成员'}>
                <p className="px-2 pb-1 pt-2 text-[11.5px] text-muted-foreground">{kind === 'agent' ? '智能助教' : '成员'}</p>
                {group.map((participant) => {
                  const checked = selectedIds.includes(participant.id)
                  const disabled = busy || Boolean(createdId) || (!checked && selectedIds.length >= 49)
                  return <label key={participant.id} className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-[7px] has-disabled:cursor-default has-disabled:opacity-50 ${checked ? 'bg-[rgb(46_125_91/5%)]' : 'hover:bg-accent/60'}`}>
                    <Avatar p={participant} size={28} animated={false} />
                    <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-[13.5px]">{participant.name}</span><span className="text-xs text-muted-foreground">{participantRoleZh(participant) ?? (participant.kind === 'agent' ? '智能助教' : '成员')}</span></span>
                    <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled}
                      onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, participant.id] : current.filter((id) => id !== participant.id))} />
                    <span aria-hidden="true" className={`grid size-[18px] shrink-0 place-items-center rounded-[5px] peer-focus-visible:outline-2 peer-focus-visible:outline-ring ${checked ? 'bg-brand text-white' : 'shadow-[inset_0_0_0_1.5px_var(--input)]'}`}>
                      {checked && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="m5 12 5 5 9-10" /></svg>}
                    </span>
                  </label>
                })}
              </div>
            })}
          </div>
          {selectedIds.length > 1 && <div className="flex shrink-0 flex-col gap-1.5 px-[18px] pb-3.5 pt-1">
            <label htmlFor={titleId} className="text-[12.5px] text-fg2">群名称 <span className="text-muted-foreground">（可选）</span></label>
            <input id={titleId} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} disabled={busy || Boolean(createdId)}
              placeholder={selectedIds.map(id => byId[id]?.name).filter(Boolean).join('、') || '默认使用参与者姓名'}
              className="h-9 rounded-[9px] border-0 bg-transparent px-3 text-[13.5px] shadow-[0_0_0_1px_var(--input)] outline-none placeholder:text-muted-foreground focus-visible:shadow-[0_0_0_1px_var(--brand),0_0_0_4px_var(--brand-surface)]" />
          </div>}
          {selectedIds.length > 0 && !selectionValid && <p role="alert" className="mx-[18px] mb-2 shrink-0 text-xs text-destructive">所选参与者已不可用或不属于当前项目，请重新选择。</p>}
          {error && <p role="alert" className="mx-[18px] mb-2 shrink-0 text-xs text-destructive">{error}</p>}
        </form>
        <DialogFooter className="m-0 shrink-0 flex-row items-center justify-end gap-1.5 border-t border-border bg-transparent px-4 py-3">
          <span className="me-auto text-xs text-muted-foreground" aria-live="polite">已选择 {selectedIds.length} / 49</span>
          <button type="button" disabled={busy} onClick={() => changeOpen(false)} className="h-[34px] rounded-[10px] px-3 text-[13.5px] font-medium text-fg2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">取消</button>
          <button type="submit" form={formId} disabled={busy || (!createdId && !selectionValid)}
            className="h-[34px] rounded-[10px] bg-brand px-3.5 text-[13.5px] font-medium text-brand-foreground hover:bg-[color-mix(in_srgb,var(--brand)_90%,var(--foreground))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40">
            {busy ? '正在打开…' : createdId ? '重试刷新' : selectedIds.length > 1 ? `创建群聊 · ${selectedIds.length} 人` : '开始对话'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
