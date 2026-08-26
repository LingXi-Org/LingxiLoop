import { type ReactNode, useState } from 'react'
import { api } from '@/api/client'
import { AvatarStack } from '@/components/Avatar'
import { SelectMenu } from '@/components/SelectMenu'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { useConversations } from '@/stores/conversations'
import { useParticipants } from '@/stores/participants'
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
    try { await api.setTitle(conversation.id, next) }
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
    try { await api.setTopic(conversation.id, next) }
    catch (error) {
      console.warn('[conversation header] topic update failed', error)
      updateConversation({ topic: previous })
    }
  }

  const changeLeader = async (leaderId: string) => {
    const previous = conversation.leaderId
    updateConversation({ leaderId })
    try { await api.setLeader(conversation.id, leaderId) }
    catch (error) {
      console.warn('[conversation header] leader update failed', error)
      updateConversation({ leaderId: previous })
    }
  }

  return (
    <header
      className={cn(
        'im-conversation-header omb-drag z-20 flex shrink-0 items-center border-b border-hairline bg-panel/92 backdrop-blur-xl',
        mobile ? 'min-h-14 gap-1 px-2 py-2' : 'omb-titlebar-safe min-h-16 gap-3 px-4 py-2.5',
      )}
      style={mobile ? { paddingTop: 'max(env(safe-area-inset-top), 8px)' } : undefined}
    >
      {onBack && (
        <button type="button" onClick={onBack} className="omb-no-drag grid size-10 shrink-0 place-items-center rounded-full text-ink-secondary hover:bg-raised" aria-label="返回会话列表">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-5"><path d="m15 18-6-6 6-6" /></svg>
        </button>
      )}
      <div className="omb-no-drag flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left">
        <button type="button" onClick={onOpenDetails} className="grid size-10 shrink-0 place-items-center rounded-full transition hover:bg-raised" aria-label="打开会话资料">
          {visibleMembers.length > 0
            ? <AvatarStack ps={visibleMembers} size={mobile ? 26 : 30} max={3} />
            : <span className="grid size-9 place-items-center rounded-full bg-raised text-[13px] font-semibold text-ink-secondary">{conversation.title.charAt(0)}</span>}
        </button>
        <span className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); void saveTitle() }
                if (event.key === 'Escape') setEditingTitle(false)
              }}
              className="block w-full border-b border-accent bg-transparent text-[15px] font-semibold leading-tight text-ink"
              maxLength={80}
            />
          ) : (
            <button
              type="button"
              onClick={mobile || conversation.kind !== 'group'
                ? onOpenDetails
                : () => { setTitleDraft(conversation.title); setEditingTitle(true) }}
              className="block max-w-full truncate text-[15px] font-semibold leading-tight text-ink hover:text-accent"
              title={mobile || conversation.kind !== 'group' ? conversation.title : '点击重命名群聊'}
            >{conversation.title}</button>
          )}
          <span className={cn('mt-1 flex min-w-0 items-center gap-1.5 text-[11px]', active.length > 0 ? 'text-accent' : 'text-ink-secondary')}>
            {active.length > 0 && <span className="size-1.5 shrink-0 animate-pulse-soft rounded-full bg-accent" />}
            {editingTopic ? (
              <input
                autoFocus
                value={topicDraft}
                onChange={(event) => setTopicDraft(event.target.value)}
                onBlur={() => void saveTopic()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); void saveTopic() }
                  if (event.key === 'Escape') setEditingTopic(false)
                }}
                placeholder="设置会话话题"
                className="min-w-0 flex-1 border-b border-accent bg-transparent text-[11px] text-ink"
                maxLength={200}
              />
            ) : (
              <button
                type="button"
                onClick={mobile ? onOpenDetails : () => { setTopicDraft(conversation.topic ?? ''); setEditingTopic(true) }}
                className="min-w-0 truncate text-left"
                title={mobile ? subtitle : '点击编辑话题'}
              >{subtitle}</button>
            )}
            {!mobile && conversation.kind === 'group' && agents.length > 0 && (
              <div className="flex shrink-0 items-center gap-1 border-l border-hairline pl-2">
                <span className="text-[9px] font-bold tracking-wider text-ink-secondary">负责人</span>
                <SelectMenu
                  ariaLabel="更换群聊负责人"
                  value={conversation.leaderId ?? ''}
                  onChange={(value) => void changeLeader(value)}
                  options={[
                    ...(!conversation.leaderId ? [{ value: '', label: '选择', disabled: true }] : []),
                    ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
                  ]}
                  className="max-w-24"
                  buttonClassName="border-0 bg-transparent px-1 text-[10px] font-semibold text-accent shadow-none"
                  size="compact"
                />
              </div>
            )}
          </span>
        </span>
      </div>
      {actions && <div className="omb-no-drag flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  )
}
