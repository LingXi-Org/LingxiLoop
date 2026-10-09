import { NotificationOff01Icon, PinIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@/components/ui/badge'
import { useEffect } from 'react'
import { Avatar } from '@/components/Avatar'
import { PreviewText } from '@/components/PreviewText'
import { cn } from '@/lib/utils'
import { useMe } from '@/stores/auth'
import { isMuted } from '@/features/conversations/store'
import { useConversationPresence } from '@/features/chat/runtime'
import { useParticipants } from '@/features/agents/state'
import type { Conversation, Participant } from '@/types'

let lastRosterBackfillAt = 0
function backfillRosterOnce() {
  const now = Date.now()
  if (now - lastRosterBackfillAt < 8000) return
  lastRosterBackfillAt = now
  void useParticipants.getState().refresh()
}

export function ConversationAvatar({
  conversation,
  size = 48,
}: {
  conversation: Conversation
  size?: number
}) {
  const avatarMotion = 'transition-[width,height] duration-200 ease-out motion-reduce:transition-none'
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

  if (conversation.kind === 'group' || members.length > 1) {
    if (members.length === 0) {
      return <span className={cn('grid shrink-0 place-items-center rounded-full bg-muted text-muted-foreground', avatarMotion)} style={{ width: size, height: size }}>群</span>
    }
    if (members.length === 1) return <Avatar p={members[0]} size={size} ringColor="var(--sidebar)" mode="chat" className={avatarMotion} />
    const portraitSize = Math.round(size * 0.64)
    const remaining = members.length - 2
    return (
      <span className={cn('relative block shrink-0', avatarMotion)} style={{ width: size, height: size }}>
        {members.slice(0, 2).map((person, index) => (
          <span key={person.id} className={cn('absolute flex rounded-full ring-1 ring-sidebar', index === 0 ? 'start-0 top-0' : 'end-0 bottom-0')}>
            <Avatar p={person} size={portraitSize} ringColor="var(--sidebar)" mode="chat" />
          </span>
        ))}
        {remaining > 0 && (
          <span className="absolute bottom-0 start-0 rounded-full bg-sidebar px-0.5 text-xs font-medium leading-none tabular-nums text-muted-foreground" aria-label={`${remaining} 位其他成员`} title={`${remaining} 位其他成员`}>
            {remaining > 99 ? '99+' : `+${remaining}`}
          </span>
        )}
      </span>
    )
  }

  const person = members[0] ?? conversation.members.map((id) => byId[id]).find(Boolean)
  if (person) return <Avatar p={person} size={size} ringColor="var(--sidebar)" mode="chat" className={avatarMotion} />
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full bg-muted font-semibold text-foreground', avatarMotion)} style={{ width: size, height: size }}>
      {conversation.kind === 'email' ? '邮' : conversation.title.charAt(0).toUpperCase()}
    </span>
  )
}

/** Shared content for conversation rows. Desktop and mobile keep their own
 * pointer/gesture wrappers but render the same titles, activity, previews,
 * mute state and unread semantics. */
export function ConversationListItemContent({
  conversation,
  selected = false,
  variant = 'desktop',
}: {
  conversation: Conversation
  selected?: boolean
  variant?: 'desktop' | 'mobile'
}) {
  // Zustand's external-store selector must return a stable snapshot when no
  // one is typing. A fresh `[]` here causes an infinite render loop in React.
  const { typingAgentIds: typingIds } = useConversationPresence(conversation.id)
  const byId = useParticipants((state) => state.byId)
  const meId = useMe()
  const muted = isMuted(conversation)
  const typingNames = typingIds
    .filter((id) => id !== meId)
    .map((id) => byId[id]?.name?.trim())
    .filter((name): name is string => Boolean(name))
  const isMobile = variant === 'mobile'
  const secondaryText = 'text-muted-foreground'
  return (
    <>
      <span className="relative flex shrink-0">
        <ConversationAvatar conversation={conversation} size={40} />
        {!selected && muted && (conversation.unread ?? 0) > 0 && <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full bg-destructive" aria-label={`${conversation.unread} 条未读消息`} />}
        {!selected && (conversation.unread ?? 0) > 0 && !muted && (
          <Badge className="absolute -end-1 -top-1 min-w-5 bg-[var(--unread)] px-1.5 text-xs font-semibold tabular-nums text-[var(--unread-foreground)] ring-2 ring-sidebar" aria-label={`${conversation.unread} 条未读消息`}>
            {conversation.unread! > 99 ? '99+' : conversation.unread}
          </Badge>
        )}
      </span>
      <span className="min-w-0 flex-1 self-center">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <span className={cn('truncate font-semibold', isMobile ? 'text-base' : 'text-sm', 'text-foreground')}>
              {conversation.title}
            </span>
          </span>
          <span className={cn('flex shrink-0 items-center gap-1 whitespace-nowrap', secondaryText)}>
            <span className="text-xs tabular-nums">{conversation.lastAt}</span>
          </span>
        </span>
        <span className={cn('mt-1 flex min-w-0 items-center gap-1.5', isMobile ? 'text-sm' : 'text-xs', !selected && typingNames.length > 0 ? 'text-primary' : secondaryText)}>
          <span className="min-w-0 flex-1 truncate">{typingNames.length > 0 ? `${typingNames.join('、')} 正在输入…` : <PreviewText body={conversation.preview || '还没有消息'} />}</span>
          {conversation.pinned && <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-label="已置顶" title="已置顶"><HugeiconsIcon icon={PinIcon} strokeWidth={2} className="size-3.5" /></span>}
          {muted && <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-label="已静音" title="已静音"><HugeiconsIcon icon={NotificationOff01Icon} strokeWidth={2} className="size-3.5" /></span>}
        </span>
      </span>
    </>
  )
}
