import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useId, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useParticipants } from '@/features/agents/state'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { userFacingError } from '@/lib/userFacingError'
import { useAuth } from '@/stores/auth'
import { conversationsApi } from '../api'
import { useConversations } from '../store'

export function NewConversationDialog({ companyId, projectId, isMobile, onCreated }: {
  companyId: string
  projectId: string
  isMobile: boolean
  onCreated: (id: string) => void
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
      && useAuth.getState().user?.id === meId
  }

  const changeOpen = (next: boolean) => {
    if (submitting.current) return
    setOpen(next)
    if (next) {
      setQuery(''); setSelectedIds([]); setTitle(''); setError(null); setCreatedId(null)
    }
  }

  const submit = async () => {
    if (submitting.current || (!createdId && !selectionValid) || !isCurrentWorkspace()) return
    submitting.current = true
    setBusy(true); setError(null)
    let conversationId = createdId
    try {
      if (!conversationId) {
        const result = await conversationsApi.create(projectId, {
          participantIds: selectedIds,
          ...(selectedIds.length > 1 && title.trim() ? { title: title.trim() } : {}),
        })
        if (!isCurrentWorkspace()) return
        conversationId = result.id
        setCreatedId(conversationId)
      }
      await useConversations.getState().reload()
      if (!isCurrentWorkspace()) return
      const refreshed = useConversations.getState()
      if (refreshed.error || refreshed.projectId !== projectId || !refreshed.list.some((item) => item.id === conversationId)) {
        setError('对话已就绪，但列表刷新失败，请重试刷新。')
        return
      }
      setOpen(false)
      onCreated(conversationId)
    } catch (reason) {
      if (isCurrentWorkspace()) setError(conversationId
        ? '对话已就绪，但列表刷新失败，请重试刷新。'
        : userFacingError(reason, '暂时无法创建对话，请稍后重试。'))
    } finally {
      submitting.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size={isMobile ? 'icon-lg' : 'icon-sm'} className="omb-no-drag shrink-0 rounded-full bg-sidebar-accent text-muted-foreground hover:bg-[var(--im-conversation-hover)] hover:text-sidebar-foreground" aria-label="新建对话" title="新建对话">
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-hidden">
        <DialogHeader className="shrink-0 pe-8">
          <DialogTitle>新建对话</DialogTitle>
          <DialogDescription>选择一位参与者开始私聊，选择多位参与者创建群聊。</DialogDescription>
        </DialogHeader>
        <form id={formId} className="flex min-h-0 flex-1 flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void submit() }} aria-busy={busy}>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索参与者" aria-label="搜索参与者" disabled={busy || Boolean(createdId)} />
          <div className="min-h-0 flex-1 overflow-y-auto" role="group" aria-label="参与者">
            {!loaded && <p className="p-4 text-center text-sm text-muted-foreground">正在加载参与者…</p>}
            {loaded && visible.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">{query.trim() ? '没有找到匹配的参与者' : '暂无可选择的参与者'}</p>}
            {visible.map((participant) => {
              const checked = selectedIds.includes(participant.id)
              return (
                <label key={participant.id} className="flex cursor-pointer items-center gap-3 rounded-xl p-2 hover:bg-muted has-disabled:cursor-default has-disabled:opacity-50">
                  <Checkbox checked={checked} disabled={busy || Boolean(createdId) || (!checked && selectedIds.length >= 49)} onCheckedChange={(value) => {
                    setSelectedIds((current) => value === true ? [...current, participant.id] : current.filter((id) => id !== participant.id))
                  }} />
                  <Avatar p={participant} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm">{participant.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{participant.kind === 'agent' ? '智能助教' : '成员'}</span>
                </label>
              )
            })}
          </div>
          <p className="shrink-0 text-xs text-muted-foreground" aria-live="polite">已选择 {selectedIds.length} / 49 人</p>
          {selectedIds.length > 1 && <div className="shrink-0 space-y-2">
            <Label htmlFor={titleId}>群聊名称（可选）</Label>
            <Input id={titleId} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="默认使用参与者姓名" disabled={busy || Boolean(createdId)} />
          </div>}
          {error && <p role="alert" className="shrink-0 text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" disabled={busy} onClick={() => changeOpen(false)}>取消</Button>
          <Button type="submit" form={formId} disabled={busy || (!createdId && !selectionValid)}>{busy ? '正在打开…' : createdId ? '重试刷新' : selectedIds.length > 1 ? '创建群聊' : '开始对话'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
