import { type ReactNode, useState } from 'react'
import { conversationsApi } from '@/features/conversations/api'
import { AvatarStack } from '@/components/Avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { useConversations } from '@/features/conversations/store'
import { useParticipants } from '@/features/agents/state'
import type { Participant } from '@/types'

export function ConversationHeader({
  conversationId,
  variant = 'desktop',
  onBack,
  onOpenDetails,
  actions,
}: {
  conversationId: string
  variant?: 'desktop' | 'mobile'
  onBack?: () => void
  onOpenDetails?: () => void
  actions?: ReactNode
}) {
  const conversation = useConversations((state) => state.list.find((item) => item.id === conversationId))
  const byId = useParticipants((state) => state.byId)
  const meId = useAuth((state) => state.user?.id)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingTopic, setEditingTopic] = useState(false)
  const [topicDraft, setTopicDraft] = useState('')
  if (!conversation) return null

  const members = conversation.members
    .map((id) => byId[id])
    .filter((participant): participant is Participant => Boolean(participant))
  const visibleMembers = members.filter((participant) => participant.id !== meId)
  const active = visibleMembers.filter((participant) => participant.status === 'working' || participant.status === 'thinking')
  const subtitle = active.length > 0
    ? `${active.map((participant) => participant.name).join('、')} 正在工作`
    : conversation.topic || `${visibleMembers.length || members.length} 位成员`
  const mobile = variant === 'mobile'
  const agents = visibleMembers.filter((participant) => participant.kind === 'agent' && !participant.departedAt)

  const updateConversation = (patch: Partial<typeof conversation>) => {
    useConversations.setState((state) => ({
      list: state.list.map((item) => item.id === conversation.id ? { ...item, ...patch } : item),
    }))
  }

  const saveTitle = async () => {
    const next = titleDraft.trim()
    setEditingTitle(false)
    if (!next || next === conversation.title) return
    const previous = conversation.title
    updateConversation({ title: next })
    try { await conversationsApi.setTitle(conversation.id, next) }
    catch (error) {
      console.warn('[conversation header] rename failed', error)
      updateConversation({ title: previous })
    }
  }

  const saveTopic = async () => {
    const next = topicDraft.trim() || null
    setEditingTopic(false)
    const previous = conversation.topic ?? null
    updateConversation({ topic: next })
    try { await conversationsApi.setTopic(conversation.id, next) }
    catch (error) {
      console.warn('[conversation header] topic update failed', error)
      updateConversation({ topic: previous })
    }
  }

  const changeLeader = async (leaderId: string) => {
    const previous = conversation.leaderId
    updateConversation({ leaderId })
    try { await conversationsApi.setLeader(conversation.id, leaderId) }
    catch (error) {
      console.warn('[conversation header] leader update failed', error)
      updateConversation({ leaderId: previous })
    }
  }

  return (
    <header
      className={cn(
        'im-conversation-header omb-drag z-20 flex shrink-0 items-center border-b border-border bg-background/92 backdrop-blur-xl',
        mobile ? 'min-h-14 gap-1 px-2 py-2' : 'omb-titlebar-safe min-h-16 gap-3 px-4 py-2.5',
      )}
      style={mobile ? { paddingTop: 'max(env(safe-area-inset-top), 8px)' } : undefined}
    >
      {onBack && (
        <Button type="button" variant="ghost" size="icon-lg" onClick={onBack} className="omb-no-drag shrink-0 text-muted-foreground" aria-label="返回会话列表">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-5"><path d="m15 18-6-6 6-6" /></svg>
        </Button>
      )}
      <div className="omb-no-drag flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left">
        <Button type="button" variant="ghost" size="icon-lg" onClick={onOpenDetails} className="shrink-0" aria-label="打开会话资料">
          {visibleMembers.length > 0
            ? <AvatarStack ps={visibleMembers} size={mobile ? 26 : 30} max={3} />
            : <span className="grid size-9 place-items-center rounded-full bg-muted text-[13px] font-semibold text-muted-foreground">{conversation.title.charAt(0)}</span>}
        </Button>
        <span className="min-w-0 flex-1">
          {editingTitle ? (
            <Input
              autoFocus
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); void saveTitle() }
                if (event.key === 'Escape') setEditingTitle(false)
              }}
              className="block w-full border-b border-primary bg-transparent text-[15px] font-semibold leading-tight text-foreground"
              maxLength={80}
            />
          ) : (
            <Button
              variant="ghost"
              type="button"
              onClick={mobile || conversation.kind !== 'group'
                ? onOpenDetails
                : () => { setTitleDraft(conversation.title); setEditingTitle(true) }}
              className="h-auto max-w-full justify-start truncate p-0 text-[15px] font-semibold leading-tight text-foreground hover:bg-transparent hover:text-primary"
              title={mobile || conversation.kind !== 'group' ? conversation.title : '点击重命名群聊'}
            >{conversation.title}</Button>
          )}
          <span className={cn('mt-1 flex min-w-0 items-center gap-1.5 text-[11px]', active.length > 0 ? 'text-primary' : 'text-muted-foreground')}>
            {active.length > 0 && <span className="size-1.5 shrink-0 animate-pulse-soft rounded-full bg-primary" />}
            {editingTopic ? (
              <Input
                autoFocus
                value={topicDraft}
                onChange={(event) => setTopicDraft(event.target.value)}
                onBlur={() => void saveTopic()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); void saveTopic() }
                  if (event.key === 'Escape') setEditingTopic(false)
                }}
                placeholder="设置会话话题"
                className="min-w-0 flex-1 border-b border-primary bg-transparent text-[11px] text-foreground"
                maxLength={200}
              />
            ) : (
              <Button
                variant="ghost"
                type="button"
                onClick={mobile ? onOpenDetails : () => { setTopicDraft(conversation.topic ?? ''); setEditingTopic(true) }}
                className="h-auto min-w-0 justify-start truncate p-0 text-left text-xs font-normal hover:bg-transparent"
                title={mobile ? subtitle : '点击编辑话题'}
              >{subtitle}</Button>
            )}
            {!mobile && conversation.kind === 'group' && agents.length > 0 && (
              <div className="flex shrink-0 items-center gap-1 border-s border-border ps-2">
                <span className="text-[9px] font-bold tracking-wider text-muted-foreground">负责人</span>
                <Select value={conversation.leaderId ?? undefined} onValueChange={(value) => void changeLeader(value)}>
                  <SelectTrigger className="h-7 max-w-24 border-0 bg-transparent px-1 text-[10px] font-semibold text-primary shadow-none" aria-label="更换群聊负责人"><SelectValue placeholder="选择" /></SelectTrigger>
                  <SelectContent>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </span>
        </span>
      </div>
      {actions && <div className="omb-no-drag flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  )
}
