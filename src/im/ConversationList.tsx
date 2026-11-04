import type { LingxiMessageMetadata } from '@/features/chat/runtime/model'
import { conversationListRunLabel } from '@/lib/conversationRunSummary'
import { useChatThreadStore } from '@/features/chat/runtime/store'
import { conversationRunStatus } from '@/features/chat/runtime/conversation-status'
import { NotificationOff01Icon, PinIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import { useEffect } from 'react'
import { Avatar } from '@/components/Avatar'
import { PreviewText } from '@/components/PreviewText'
import { cn } from '@/lib/utils'
import { useMe } from '@/stores/auth'
import { isMuted } from '@/features/conversations/store'
import { useConversationPresence } from '@/features/chat/runtime'
import { useParticipants } from '@/features/agents/state'
import type { Conversation, Participant } from '@/types'
import type { PinnedMode } from '@/features/conversations/components/PinnedConversations'
import { getBloubIdentity } from '@/lib/agentVisualState'
import { COLOR_BY_ID } from '@/lib/bloub/skins'

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
    const clustered = members.length >= 3
    const portraitSize = Math.round(size * (clustered ? 0.58 : 0.68))
    const remaining = members.length > 3 ? members.length - 2 : 0
    const positions = clustered ? ['start-[21%] top-0', 'start-0 bottom-0', 'end-0 bottom-0'] : ['start-0 top-0', 'end-0 bottom-0']
    return (
      <span className={cn('relative block shrink-0', avatarMotion)} style={{ width: size, height: size }}>
        {members.slice(0, remaining ? 2 : 3).map((person, index) => (
          <span key={person.id} className={cn('absolute flex rounded-full ring-1 ring-background', positions[index])}>
            <Avatar p={person} size={portraitSize} ringColor="var(--background)" mode="chat" />
          </span>
        ))}
        {remaining > 0 && (
          <span className="absolute bottom-0 end-0 grid place-items-center rounded-full bg-accent font-medium tabular-nums text-muted-foreground ring-1 ring-background" style={{ width: portraitSize, height: portraitSize, fontSize: Math.max(8, Math.round(size * 0.25)) }} aria-label={`${remaining} 位其他成员`} title={`${remaining} 位其他成员`}>
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

export function ConversationUnread({ conversation }: { conversation: Conversation }) {
  if (!conversation.unread) return null
  return isMuted(conversation)
    ? <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50" aria-label={`${conversation.unread} 条未读消息，已静音`} />
    : <span className="inline-flex min-w-4 shrink-0 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-medium leading-4 tabular-nums text-brand-foreground" aria-label={`${conversation.unread} 条未读消息`}>
      {conversation.unread > 99 ? '99+' : conversation.unread}
    </span>
}

export function PinnedConversationContent({ conversation, mode }: { conversation: Conversation; mode: PinnedMode }) {
  const byId = useParticipants(state => state.byId)
  const meId = useMe()
  const members = conversation.members.filter(id => id !== meId).map(id => byId[id]).filter((person): person is Participant => Boolean(person))
  const first = members[0]
  const tint = first?.kind === 'agent' ? COLOR_BY_ID.get(getBloubIdentity(first, first.personalAvatar && 'seed' in first.personalAvatar ? first.personalAvatar.seed : undefined).color)?.hex : first?.avatarBg
  return <>
    <span aria-hidden className="pointer-events-none absolute inset-0 opacity-[.13] dark:opacity-[.16]" style={{ backgroundColor: tint || 'var(--brand)' }} />
    {mode === 'tile' ? <>
      <ConversationAvatar conversation={conversation} size={28} />
      <span className="relative w-full truncate text-center text-xs">{conversation.title}</span>
    </> : <>
      <span className="relative w-full truncate pe-4 text-[13px] font-medium">{conversation.title}</span>
      <span className="relative w-full truncate text-xs text-muted-foreground"><PreviewText body={conversation.preview || '还没有消息'} /></span>
      <span className="relative mt-auto flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground"><span className="size-1.5 rounded-full" style={{ backgroundColor: tint || 'var(--brand)' }} />{conversation.lastAt}</span>
      <span aria-hidden className="pointer-events-none absolute -bottom-3 -end-1 flex items-end -space-x-5">
        {members.slice(0, 3).map(person => <Avatar key={person.id} p={person} size={mode === 'compact' ? 40 : 48} animated={false} ringColor="transparent" />)}
      </span>
    </>}
    <span className="absolute end-1.5 top-1.5"><ConversationUnread conversation={conversation} /></span>
  </>
}

/** Shared native Item content for conversation rows. */
export function ConversationListItemContent({
  conversation,
  selected = false,
}: {
  conversation: Conversation
  selected?: boolean
}) {
  // Zustand's external-store selector must return a stable snapshot when no
  // one is typing. A fresh `[]` here causes an infinite render loop in React.
  const { typingAgentIds: typingIds, runStatus: loadedRunStatus } = useConversationPresence(conversation.id)
  const localRun = useChatThreadStore(state => {
    if (!conversation.runSummary?.runId) return undefined
    const messages = state.conversations[conversation.id]?.messages ?? []
    for (let index = messages.length - 1; index >= 0; index--) {
      if (messages[index].metadata.custom.runId === conversation.runSummary.runId) return messages[index]
    }
    return undefined
  })
  const localView = (localRun?.metadata.custom as LingxiMessageMetadata | undefined)?.harness
  const runStatus = conversation.runSummary ? conversationListRunLabel(conversation.runSummary, localRun && localView ? {
    runId: String(localRun.metadata.custom.runId), requestVersion: localView.requestVersion, fence: localView.fence,
    lifecycle: localView.lifecycle ?? '', label: conversationRunStatus([localRun]),
  } : undefined, loadedRunStatus) : loadedRunStatus
  const byId = useParticipants((state) => state.byId)
  const meId = useMe()
  const muted = isMuted(conversation)
  const typingNames = typingIds
    .filter((id) => id !== meId)
    .map((id) => byId[id]?.name?.trim())
    .filter((name): name is string => Boolean(name))
  const secondaryText = 'text-muted-foreground'
  return (
    <>
      <ItemMedia className="relative self-center! translate-y-0!">
        <ConversationAvatar conversation={conversation} size={28} />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <ItemTitle className="block min-w-0 flex-1 truncate text-sm font-medium leading-5">{conversation.title}</ItemTitle>
          <span className={cn('flex shrink-0 items-center gap-1 whitespace-nowrap', !muted && conversation.unread ? 'text-brand' : secondaryText)}>
            <span className="text-xs tabular-nums">{conversation.lastAt}</span>
          </span>
        </div>
        <ItemDescription className={cn('line-clamp-none flex min-w-0 items-center gap-1.5 text-xs leading-4', !selected && typingNames.length > 0 && 'text-brand')}>
          <span className="min-w-0 flex-1 truncate">
            {runStatus && <><span className="text-muted-foreground" aria-label={`任务状态：${runStatus}`}>{runStatus}</span><span aria-hidden> · </span></>}
            {typingNames.length > 0 ? `${typingNames.join('、')} 正在输入…` : <PreviewText body={conversation.preview || '还没有消息'} />}
          </span>
          {conversation.pinned && <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-label="已置顶" title="已置顶"><HugeiconsIcon icon={PinIcon} strokeWidth={2} className="size-3.5" /></span>}
          {muted && <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-label="已静音" title="已静音"><HugeiconsIcon icon={NotificationOff01Icon} strokeWidth={2} className="size-3.5" /></span>}
          <ConversationUnread conversation={conversation} />
        </ItemDescription>
      </ItemContent>
    </>
  )
}
