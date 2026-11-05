import type { LingxiMessageMetadata } from '@/features/chat/runtime/model'
import { conversationListRunLabel } from '@/lib/conversationRunSummary'
import { useChatThreadStore } from '@/features/chat/runtime/store'
import { conversationRunStatus } from '@/features/chat/runtime/conversation-status'
import { NotificationOff01Icon } from '@hugeicons/core-free-icons'
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
import { stableParticipantHash } from '@/lib/agentVisualState'
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
          <span key={person.id} className={cn('absolute flex', positions[index])}>
            <Avatar p={person} size={portraitSize} ringColor="transparent" mode="chat" />
          </span>
        ))}
        {remaining > 0 && (
          <span className="absolute bottom-0 end-0 grid place-items-center rounded-full bg-accent font-medium tabular-nums text-muted-foreground" style={{ width: portraitSize, height: portraitSize, fontSize: Math.max(8, Math.round(size * 0.25)) }} aria-label={`${remaining} 位其他成员`} title={`${remaining} 位其他成员`}>
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
    : <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand px-[5px] text-[11px] font-semibold leading-[18px] tabular-nums text-brand-foreground" aria-label={`${conversation.unread} 条未读消息`}>
      {conversation.unread > 99 ? '99+' : conversation.unread}
    </span>
}

const pinnedColors = ['bleu', 'violet', 'turquoise', 'orange', 'rose', 'vert', 'ambre', 'rouge'].map(id => COLOR_BY_ID.get(id)!.hex)

/** The pinned card surface: the conversation colour washed into the page surface. */
export function pinnedTint(conversation: Conversation) {
  const color = pinnedColors[stableParticipantHash(conversation.id) % pinnedColors.length]
  return { color, surface: `color-mix(in srgb, ${color} var(--pinned-tint-strength, 13%), var(--background))` }
}

// Peeking member portraits, right to left: the front one is largest.
const PEEK = {
  wide: [{ size: 50, end: -6, bottom: -16, rotate: -10 }, { size: 40, end: 38, bottom: -22, rotate: 8 }, { size: 34, end: 78, bottom: -18, rotate: -5 }],
  card: [{ size: 50, end: -12, bottom: -14, rotate: -12 }, { size: 40, end: 14, bottom: -20, rotate: 8 }, { size: 34, end: 36, bottom: -16, rotate: -6 }],
  compact: [{ size: 44, end: -10, bottom: -14, rotate: -12 }, { size: 34, end: 14, bottom: -18, rotate: 8 }, { size: 28, end: 34, bottom: -14, rotate: -6 }],
} as const

export function PinnedConversationContent({ conversation, mode }: { conversation: Conversation; mode: PinnedMode }) {
  const byId = useParticipants(state => state.byId)
  const meId = useMe()
  const members = conversation.members.filter(id => id !== meId).map(id => byId[id]).filter((person): person is Participant => Boolean(person))
  const { color, surface } = pinnedTint(conversation)
  const agents = members.filter(person => person.kind === 'agent').length
  const memberMeta = conversation.kind === 'group' ? `${members.length + 1} 位成员` : agents ? `${agents} 位 agent` : ''
  if (mode === 'tile') return <>
    <ConversationAvatar conversation={conversation} size={28} />
    <span className="relative w-full truncate text-center text-[11.5px] font-medium">{conversation.title}</span>
    <span className="absolute end-1 top-1"><ConversationUnread conversation={conversation} /></span>
  </>
  const peek = PEEK[mode]
  return <>
    {mode === 'wide' ? <>
      <span className="relative flex min-w-0 items-center gap-2">
        <span className="truncate text-[13.5px] font-semibold">{conversation.title}</span>
        {memberMeta && <span className="shrink-0 text-[11.5px] text-muted-foreground">{memberMeta}</span>}
      </span>
      <span className="relative truncate text-[12.5px] text-fg2"><PreviewText body={conversation.preview || '还没有消息'} /></span>
      <span className="relative flex items-center gap-1.5 text-[11.5px] tabular-nums text-muted-foreground">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />{conversation.lastAt}<ConversationUnread conversation={conversation} />
      </span>
    </> : <>
      <span className="relative flex w-full min-w-0 flex-col gap-px">
        <span className="truncate text-[13px] font-semibold tracking-[-0.01em]">{conversation.title}</span>
        <span className="truncate text-[11.5px] text-muted-foreground"><PreviewText body={conversation.preview || memberMeta || '还没有消息'} /></span>
      </span>
      <span className="relative flex items-center gap-[5px] text-[11.5px] tabular-nums text-fg2"><span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />{conversation.lastAt}</span>
      <span className="absolute end-2 top-2 z-[5] flex"><ConversationUnread conversation={conversation} /></span>
    </>}
    <span aria-hidden className="pointer-events-none">
      {members.slice(0, 3).map((person, index) => {
        const place = peek[index]!
        return <span key={person.id} className="absolute flex rounded-full" style={{ insetInlineEnd: place.end, bottom: place.bottom, transform: `rotate(${place.rotate}deg)`, zIndex: 3 - index }}>
          <Avatar p={person} size={place.size} animated={false} ringColor={index ? surface : 'transparent'} />
        </span>
      })}
    </span>
  </>
}

/** Run state, read as one of the list's three status dots. */
export function conversationRunTone(label: string | null | undefined): 'warn' | 'live' | 'done' | null {
  if (!label) return null
  if (/处理中|排队中|已提交|协作/.test(label)) return 'live'
  if (/已完成/.test(label)) return 'done'
  return 'warn'
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
  const unread = !muted && Boolean(conversation.unread)
  const tone = conversationRunTone(runStatus)
  return (
    <>
      <ItemMedia className="relative self-center! translate-y-0!">
        <ConversationAvatar conversation={conversation} size={32} />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-px">
        <div className="flex min-w-0 items-baseline gap-2">
          <ItemTitle className={cn('block min-w-0 flex-1 truncate text-sm leading-5', unread ? 'font-semibold' : 'font-medium')}>{conversation.title}</ItemTitle>
          <span className={cn('shrink-0 whitespace-nowrap text-xs tabular-nums', unread ? 'text-brand' : 'text-muted-foreground')}>{conversation.lastAt}</span>
        </div>
        <ItemDescription className={cn('line-clamp-none flex min-w-0 items-center gap-2 text-[12.5px] leading-[18px]', unread ? 'text-fg2' : 'text-muted-foreground', !selected && typingNames.length > 0 && 'text-brand')}>
          <span className="min-w-0 flex-1 truncate">
            {runStatus && <span data-run-tone={tone ?? undefined} className="text-muted-foreground"><span aria-label={`任务状态：${runStatus}`}>{runStatus}</span><span aria-hidden> · </span></span>}
            {typingNames.length > 0 ? `${typingNames.join('、')} 正在输入…` : <PreviewText body={conversation.preview || '还没有消息'} />}
          </span>
          {muted && <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-label="已静音" title="已静音"><HugeiconsIcon icon={NotificationOff01Icon} strokeWidth={2} className="size-3.5" /></span>}
          <ConversationUnread conversation={conversation} />
        </ItemDescription>
      </ItemContent>
    </>
  )
}
