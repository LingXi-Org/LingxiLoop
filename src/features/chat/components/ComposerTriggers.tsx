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
import { isChineseAgentName, participantDisplayName } from '@/lib/participantDisplayName'

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
    return <span aria-hidden="true" className="grid size-[30px] shrink-0 place-items-center"><Avatar p={participant} size={28} ringColor="transparent" animated={false} mode="chat" /></span>
  }
  const Icon = item.type === 'broadcast' ? UsersRoundIcon : BarChart3Icon
  return (
    <span aria-hidden="true" className="grid size-[30px] shrink-0 place-items-center rounded-lg border border-border bg-background text-fg2">
      <Icon className="size-4" strokeWidth={1.6} />
    </span>
  )
}

function TriggerItems({ heading, hint }: { heading: string; hint?: (item: Unstable_TriggerItem) => string }) {
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverItems className="flex max-h-72 flex-col gap-px overflow-y-auto">
      {(items) => [<div key="heading" aria-hidden="true" className="px-2.5 pb-1 pt-1.5 text-xs text-muted-foreground">{heading}</div>, ...items.map((item, index) => (
        <ComposerPrimitive.Unstable_TriggerPopoverItem
          key={`${item.type}:${item.id}`}
          item={item}
          index={index}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-foreground outline-none hover:bg-accent data-[highlighted]:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <TriggerIcon item={item} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{item.label}</span>
            {item.description ? <span className="truncate text-[12.5px] text-muted-foreground">{item.description}</span> : null}
          </span>
          {hint && <span className="shrink-0 text-xs text-muted-foreground">{hint(item)}</span>}
        </ComposerPrimitive.Unstable_TriggerPopoverItem>
      ))]}
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
    {participant || directiveId === 'all' ? <MentionBadge participant={participant ?? EVERYONE_BLOUB_PARTICIPANT} id={directiveId} /> : <span>@{isChineseAgentName(label) ? label : '未识别成员'}</span>}
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
          className="composer-trigger-menu absolute bottom-full left-0 z-30 mb-2 w-[340px] max-w-full animate-rise"
        >
          <ComposerPrimitive.Unstable_TriggerPopover.Directive {...mention.directive} />
          <TriggerItems heading="提及" />
        </ComposerPrimitive.Unstable_TriggerPopover>
        <ComposerPrimitive.Unstable_TriggerPopover
          char="/"
          adapter={slash.adapter}
          aria-label="快捷命令"
          className="composer-trigger-menu absolute bottom-full left-0 z-30 mb-2 w-[340px] max-w-full animate-rise"
        >
          <ComposerPrimitive.Unstable_TriggerPopover.Action {...slash.action} />
          <TriggerItems heading="命令" hint={item => `/${item.label}`} />
        </ComposerPrimitive.Unstable_TriggerPopover>
      </div>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  )
}
