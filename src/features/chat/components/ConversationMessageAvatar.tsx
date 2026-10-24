import { memo } from 'react'
import { useAuiState, type ThreadMessage } from '@assistant-ui/react'
import { Avatar } from '@/components/Avatar'
import { cn } from '@/lib/utils'
import type { Participant } from '@/types'
import type { LingxiMessageMetadata } from '../runtime/model'

/** Read the existing visual group without changing grouping or looking through
 * unrelated history. A later live reply may share an older row's avatar. */
export function isMessageAvatarActive(messages: readonly ThreadMessage[], index: number): boolean {
  const anchor = messages[index]?.metadata.custom as LingxiMessageMetadata | undefined
  if (anchor?.schema !== 'lingxiloop.thread-message.v2' || anchor.senderKind !== 'agent') return false
  for (let cursor = index; cursor < messages.length; cursor++) {
    const message = messages[cursor]!
    const metadata = message.metadata.custom as LingxiMessageMetadata
    if (metadata.schema !== anchor.schema || metadata.senderId !== anchor.senderId
      || metadata.conversationId !== anchor.conversationId || cursor > index && metadata.groupStart) break
    if (message.status?.type === 'running' && metadata.runId && metadata.harness?.runId === metadata.runId
      && metadata.harness.lifecycle === 'leased' && !metadata.runConnection) return true
    if (metadata.groupEnd) break
  }
  return false
}

export const ConversationMessageAvatar = memo(function ConversationMessageAvatar({
  participant, isMobile, isMine, groupStart, groupEnd,
}: {
  participant: Participant | undefined
  isMobile: boolean
  isMine: boolean
  groupStart: boolean
  groupEnd: boolean
}) {
  const showAvatar = Boolean((isMine ? groupEnd : groupStart) && participant)
  const animated = useAuiState(state => showAvatar && participant?.kind === 'agent'
    && isMessageAvatarActive(state.thread.messages, state.message.index))
  return <div data-message-avatar className={cn(
    'row-start-2 flex',
    participant?.kind === 'agent' ? 'self-start' : 'self-center',
    isMobile ? 'w-8' : 'w-10',
    isMine ? 'col-start-2' : 'col-start-1',
    groupStart && participant?.kind === 'agent' && 'chat-message-avatar',
    groupStart && animated && participant?.status === 'thinking' && 'bloub-activity-thinking',
    groupStart && animated && participant?.status === 'working' && 'bloub-activity-working',
  )}>
    {showAvatar && participant && <Avatar p={participant} size={isMobile ? 32 : 38} ringColor="var(--background)"
      animated={Boolean(animated)} mode="chat" className="transition-[width,height] duration-200" />}
  </div>
})
