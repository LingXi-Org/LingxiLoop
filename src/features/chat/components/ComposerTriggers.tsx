import {
  ComposerPrimitive,
  type Unstable_DirectiveSegment,
  type Unstable_DirectiveFormatter,
  type Unstable_TriggerItem,
  unstable_useMentionAdapter,
  unstable_useSlashCommandAdapter,
} from '@assistant-ui/react'
import { useMemo, type ReactNode } from 'react'
import { BarChart3Icon, UsersRoundIcon } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import { useMe } from '@/stores/auth'
import { participantRoleZh } from '@/lib/participantRole'
import { scanMentions, type MentionTarget } from '@/lib/mentions'
import { MentionBadge } from '@/components/MentionBadge'
import { EVERYONE_BLOUB_PARTICIPANT } from '@/lib/agentVisualState'
import { participantDisplayName } from '@/lib/participantDisplayName'

function mentionFormatter(targets: readonly MentionTarget[]): Unstable_DirectiveFormatter { return {
  serialize: (item) => `@${item.id}`,
  parse(text) {
    const segments: Unstable_DirectiveSegment[] = []
    let cursor = 0
    for (const { id, start, end } of scanMentions(text, targets)) {
      if (start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, start) })
      const target = targets.find(target => target.id === id)
      segments.push({ kind: 'mention', type: id === 'all' ? 'broadcast' : 'participant', label: target ? participantDisplayName(target) : '所有人', id })
      cursor = end
    }
    if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) })
    return segments
  },
} }

function TriggerIcon({ item }: { item: Unstable_TriggerItem }) {
  const participant = useParticipants((state) => state.byId[item.id])
  if (item.type === 'participant' && participant) {
    return <span aria-hidden="true"><Avatar p={participant} size={28} ringColor="transparent" animated={false} mode="chat" /></span>
  }
  const Icon = item.type === 'broadcast' ? UsersRoundIcon : BarChart3Icon
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
      <Icon className="size-4" aria-hidden />
    </span>
  )
}

function TriggerItems() {
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverItems className="max-h-64 overflow-y-auto p-1">
      {(items) => items.map((item, index) => (
        <ComposerPrimitive.Unstable_TriggerPopoverItem
          key={`${item.type}:${item.id}`}
          item={item}
          index={index}
          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left outline-none hover:bg-muted data-[highlighted]:bg-muted"
        >
          <TriggerIcon item={item} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-foreground">{item.label}</span>
            {item.description ? <span className="block truncate text-[10.5px] text-muted-foreground">{item.description}</span> : null}
          </span>
        </ComposerPrimitive.Unstable_TriggerPopoverItem>
      ))}
    </ComposerPrimitive.Unstable_TriggerPopoverItems>
  )
}

export function ComposerDirectiveChip({
  directiveId,
  directiveType,
  label,
}: {
  directiveId: string
  directiveType: string
  label: string
}) {
  const participant = useParticipants((state) => state.byId[directiveId])
  return <span data-directive-type={directiveType} data-directive-id={directiveId}>
    {participant || directiveId === 'all' ? <MentionBadge participant={participant ?? EVERYONE_BLOUB_PARTICIPANT} id={directiveId} /> : <span>@{label}</span>}
  </span>
}

export function ComposerTriggers({
  conversationId,
  onOpenPoll,
  children,
}: {
  conversationId: string
  onOpenPoll: () => void
  children: ReactNode
}) {
  const meId = useMe()
  const conversation = useConversations((state) => state.list.find((item) => item.id === conversationId))
  const participants = useParticipants((state) => state.byId)
  const mentionItems = useMemo(() => {
    const members = (conversation?.members ?? [])
      .map((id) => participants[id])
      .filter((participant) => participant && participant.id !== meId && !participant.departedAt)
      .map((participant) => ({
        id: participant.id,
        type: 'participant',
        label: participantDisplayName(participant),
        description: participantRoleZh(participant) ?? '会话成员',
      }))
    return members.length > 0
      ? [{ id: 'all', type: 'broadcast', label: '所有人', description: '通知会话中的全部成员' }, ...members]
      : members
  }, [conversation?.members, meId, participants])
  const mention = unstable_useMentionAdapter({
    items: mentionItems,
    includeModelContextTools: false,
    formatter: useMemo(() => mentionFormatter((conversation?.members ?? []).flatMap(id => participants[id] ? [participants[id]] : [])), [conversation?.members, participants]),
  })
  const commands = useMemo(() => [{
    id: 'poll',
    label: '投票',
    description: '发起一次投票，智能助教和成员都能参与',
    execute: onOpenPoll,
  }], [onOpenPoll])
  const slash = unstable_useSlashCommandAdapter({ commands, removeOnExecute: true })

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <div className="relative">
        {children}
        <ComposerPrimitive.Unstable_TriggerPopover
          char="@"
          adapter={mention.adapter}
          aria-label="提及成员"
          className="app-menu-surface absolute bottom-full left-0 z-30 mb-2 min-w-64 animate-rise"
        >
          <ComposerPrimitive.Unstable_TriggerPopover.Directive {...mention.directive} />
          <TriggerItems />
        </ComposerPrimitive.Unstable_TriggerPopover>
        <ComposerPrimitive.Unstable_TriggerPopover
          char="/"
          adapter={slash.adapter}
          aria-label="快捷命令"
          className="app-menu-surface absolute bottom-full left-0 z-30 mb-2 min-w-72 animate-rise"
        >
          <ComposerPrimitive.Unstable_TriggerPopover.Action {...slash.action} />
          <TriggerItems />
        </ComposerPrimitive.Unstable_TriggerPopover>
      </div>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  )
}
