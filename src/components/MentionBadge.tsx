import { Avatar } from '@/components/Avatar'
import type { Participant } from '@/types'
import { participantDisplayName } from '@/lib/participantDisplayName'

export function MentionBadge({ participant, id = participant.id }: { participant: Participant; id?: string }) {
  const name = participantDisplayName(participant)
  return <span data-mention-id={id} title={`@${name}`} aria-label={`提及 ${name}`}
    data-mention-kind={participant.kind}
    className={`mx-0.5 inline-flex h-[22px] max-w-full items-center gap-1 rounded-md pe-1.5 ps-1 align-[1px] text-[13.5px] font-medium leading-none ${participant.kind === 'agent' ? 'bg-brand-surface text-brand' : 'bg-accent text-foreground'}`}>
    <span aria-hidden="true" className="inline-flex shrink-0"><Avatar p={participant} size={14} ringColor="transparent" animated={false} /></span>
    <span className="min-w-0 truncate">@{name}</span>
  </span>
}
