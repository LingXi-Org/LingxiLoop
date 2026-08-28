import { useEffect } from 'react'
import { Avatar, AvatarStack } from '@/components/Avatar'
import { HiveAvatar } from '@/components/HiveAvatar'
import { PreviewText } from '@/components/PreviewText'
import { participantRoleZh } from '@/lib/participantRole'
import { cn } from '@/lib/utils'
import { useMe } from '@/stores/auth'
import { isMuted } from '@/features/conversations/store'
import { useMessages } from '@/features/chat/state/messages'
import { useParticipants } from '@/stores/participants'
import type { Conversation, Participant } from '@/types'

let lastRosterBackfillAt = 0
const EMPTY_TYPING_IDS: string[] = []

function backfillRosterOnce() {
  const now = Date.now()
  if (now - lastRosterBackfillAt < 8000) return
  lastRosterBackfillAt = now
  void useParticipants.getState().refresh()
}

export function ConversationAvatar({
  conversation,
  size = 48,
  variant = 'mobile',
}: {
  conversation: Conversation
  size?: number
  variant?: 'desktop' | 'mobile'
}) {
  const byId = useParticipants((state) => state.byId)
  const meId = useMe()
  const noneResolved = conversation.members.length > 0 && conversation.members.every((id) => !byId[id])

  useEffect(() => {
    if (noneResolved) backfillRosterOnce()
  }, [noneResolved])

  const members = conversation.members
    .filter((id) => id !== meId)
    .map((id) => byId[id])
    .filter((participant): participant is Participant => Boolean(participant))

  if (conversation.tag === 'fresh-pulled') {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
        style={{ width: size, height: size, background: 'conic-gradient(from 0deg, #B57BFF, var(--coral), #6B7BE6, var(--gold), #B57BFF)' }}
      >⌘</span>
    )
  }

  if (conversation.kind === 'group' || members.length > 1) {
    if (members.length === 0) {
      return <span className="grid shrink-0 place-items-center rounded-full bg-raised text-ink-secondary" style={{ width: size, height: size }}>群</span>
    }
    return variant === 'mobile'
      ? <HiveAvatar ps={members} size={size} ringColor="var(--panel)" />
      : <AvatarStack ps={members} size={Math.round(size * 0.68)} max={3} />
  }

  const person = members[0] ?? conversation.members.map((id) => byId[id]).find(Boolean)
  if (person) return <Avatar p={person} size={size} ringColor="var(--panel)" />
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-raised font-semibold text-ink" style={{ width: size, height: size }}>
      {conversation.kind === 'email' ? '邮' : conversation.title.charAt(0).toUpperCase()}
    </span>
  )
}

/** Shared content for conversation rows. Desktop and mobile keep their own
 * pointer/gesture wrappers but render the same titles, activity, previews,
 * mute state and unread semantics. */
export function ConversationListItemContent({
  conversation,
  variant = 'desktop',
  selected = false,
}: {
  conversation: Conversation
  variant?: 'desktop' | 'mobile'
  selected?: boolean
}) {
  // Zustand's external-store selector must return a stable snapshot when no
  // one is typing. A fresh `[]` here causes an infinite render loop in React.
  const typingIds = useMessages((state) => state.typing[conversation.id] ?? EMPTY_TYPING_IDS)
  const byId = useParticipants((state) => state.byId)
  const meId = useMe()
  const muted = isMuted(conversation)
  const roleLabels = conversation.kind === 'direct'
    ? conversation.members
      .map((id) => byId[id])
      .filter((participant): participant is Participant => Boolean(participant && participant.id !== meId && participant.kind === 'agent'))
      .map((participant) => participantRoleZh(participant))
      .filter((role): role is string => Boolean(role))
    : []
  const typingNames = typingIds
    .filter((id) => id !== meId)
    .map((id) => byId[id]?.name?.trim())
    .filter((name): name is string => Boolean(name))
  const isMobile = variant === 'mobile'
  const isDirectAgent = conversation.kind === 'direct' && conversation.members.some((id) => id !== meId && byId[id]?.kind === 'agent')

  return (
    <>
      <ConversationAvatar conversation={conversation} size={isMobile || !isDirectAgent ? 48 : 54} variant={variant} />
      <span className="min-w-0 flex-1 self-center">
        <span className="flex min-w-0 items-center gap-1.5">
          {conversation.pinned && !isMobile && <span className={cn('text-[9px]', selected ? 'text-white/70' : 'text-ink-secondary')} aria-label="已置顶">◆</span>}
          <span className={cn('truncate text-[16px] font-semibold', selected ? 'text-white' : muted ? 'text-ink-secondary' : 'text-ink')}>
            {conversation.title}
          </span>
          {roleLabels.map((role, index) => <span key={`${role}-${index}`} className={cn('shrink-0 text-[10px] font-normal', selected ? 'text-white/70' : 'text-ink-secondary')}>{role}</span>)}
          {muted && <span className={cn('shrink-0 text-[11px]', selected ? 'text-white/70' : 'text-ink-secondary')} aria-label="已静音">⌁</span>}
          {conversation.tag === 'fresh-pulled' && <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[8px] font-bold text-gold-deep">NEW</span>}
        </span>
        <span className={cn('mt-0.5 block truncate text-[14px]', selected ? 'text-white/75' : typingNames.length > 0 ? 'text-accent' : 'text-ink-secondary')}>
          {typingNames.length > 0 ? `${typingNames.join('、')} 正在输入…` : <PreviewText body={conversation.preview || '还没有消息'} />}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 self-center">
        <span className={cn('text-[12px] tabular-nums', selected ? 'text-white/75' : 'text-ink-secondary')}>{conversation.lastAt}</span>
        {(conversation.unread ?? 0) > 0 && (
          <span className={cn('grid min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold leading-5', selected ? 'bg-white text-accent' : muted ? 'bg-raised text-ink-secondary' : 'bg-accent text-white')}>
            {conversation.unread! > 99 ? '99+' : conversation.unread}
          </span>
        )}
      </span>
    </>
  )
}
