import { Avatar } from '@/components/Avatar'
import type { Participant } from '@/types'

export function MentionBadge({ participant, id = participant.id }: { participant: Participant; id?: string }) {
  return <span data-mention-id={id} title={`@${participant.name}`} aria-label={`提及 ${participant.name}`}
    className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md bg-primary/12 px-1 py-px align-baseline text-[0.95em] font-medium text-primary">
    <span aria-hidden="true" className="inline-flex shrink-0"><Avatar p={participant} size={18} ringColor="transparent" animated={false} /></span>
    <span className="min-w-0 break-all">@{participant.name}</span>
  </span>
}
