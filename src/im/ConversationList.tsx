import { NotificationOff01Icon, PinIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@/components/ui/badge'
import { useEffect } from 'react'
import { Avatar, AvatarStack } from '@/components/Avatar'
import { HiveAvatar } from '@/components/HiveAvatar'
import { PreviewText } from '@/components/PreviewText'
import { participantRoleZh } from '@/lib/participantRole'
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
  variant = 'mobile',
}: {
  conversation: Conversation
  size?: number
  variant?: 'desktop' | 'mobile'
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

  if (conversation.tag === 'fresh-pulled') {
    return (
      <span
        className={cn('grid shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground', avatarMotion)}
        style={{ width: size, height: size }}
      >⌘</span>
    )
  }

  if (conversation.kind === 'group' || members.length > 1) {
    if (members.length === 0) {
      return <span className={cn('grid shrink-0 place-items-center rounded-full bg-muted text-muted-foreground', avatarMotion)} style={{ width: size, height: size }}>群</span>
    }
    return variant === 'mobile'
      ? <HiveAvatar ps={members} size={size} ringColor="var(--sidebar)" mode="chat" className={avatarMotion} />
      : <AvatarStack ps={members} size={Math.round(size * 0.68)} max={3} mode="chat" />
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
  const isDirectAgent = conversation.kind === 'direct' && conversation.members.some(
    (id) => id !== meId && byId[id]?.kind === 'agent',
  )
  return (
    <>
      <ConversationAvatar conversation={conversation} size={isMobile ? 42 : !isDirectAgent ? 48 : 54} variant={variant} />
      <span className="min-w-0 flex-1 self-center">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn('truncate font-semibold', isMobile ? 'text-[16px]' : 'text-[15px]', muted ? 'text-muted-foreground' : 'text-foreground')}>
            {conversation.title}
          </span>
          {roleLabels.map((role, index) => <span key={`${role}-${index}`} className="shrink-0 text-[9px] font-normal text-muted-foreground">{role}</span>)}
          {muted && (
            <span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground" aria-label="已静音" title="已静音">
              <HugeiconsIcon icon={NotificationOff01Icon} strokeWidth={2} className="size-3" />
            </span>
          )}
          {conversation.tag === 'fresh-pulled' && <span className="rounded bg-secondary px-1.5 py-0.5 text-[8px] font-bold text-secondary-foreground">新消息</span>}
        </span>
        <span className={cn('mt-0.5 block truncate', isMobile ? 'text-[14px]' : 'text-[13px]', typingNames.length > 0 ? 'text-primary' : 'text-muted-foreground')}>
          {typingNames.length > 0 ? `${typingNames.join('、')} 正在输入…` : <PreviewText body={conversation.preview || '还没有消息'} />}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 self-center">
        <span className="flex items-center gap-1">
          <span className={cn('tabular-nums text-muted-foreground', isMobile ? 'text-[12px]' : 'text-[11px]')}>{conversation.lastAt}</span>
          {conversation.pinned && !isMobile && (
            <span className="inline-flex size-4 items-center justify-center text-muted-foreground" aria-label="已置顶" title="已置顶">
              <HugeiconsIcon icon={PinIcon} strokeWidth={2} className="size-3" />
            </span>
          )}
        </span>
        {!selected && (conversation.unread ?? 0) > 0 && (
          <Badge className="min-w-5 bg-[var(--unread)] px-1.5 text-[10px] font-bold tabular-nums text-[var(--unread-foreground)]">
            {conversation.unread! > 99 ? '99+' : conversation.unread}
          </Badge>
        )}
      </span>
    </>
  )
}
