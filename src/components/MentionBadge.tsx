import { Avatar } from '@/components/Avatar'
import type { Participant } from '@/types'
import { participantDisplayName } from '@/lib/participantDisplayName'

export function MentionBadge({ participant, id = participant.id }: { participant: Participant; id?: string }) {
  const name = participantDisplayName(participant)
  return <span data-mention-id={id} title={`@${name}`} aria-label={`提及 ${name}`}
    className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md bg-primary/12 px-1 py-px align-middle text-[0.95em] font-medium text-primary">
    <span aria-hidden="true" className="inline-flex shrink-0"><Avatar p={participant} size={18} ringColor="transparent" animated={false} /></span>
    <span className="min-w-0 break-all">@{name}</span>
  </span>
}
