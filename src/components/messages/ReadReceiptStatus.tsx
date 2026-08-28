import { useAuiState } from '@assistant-ui/react'
import { Avatar } from '@/components/Avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { LingxiImMessageCustom } from '@/im/assistantMessage'
import { useMe } from '@/stores/auth'
import { useConversations } from '@/features/conversations/store'
import { useMessages } from '@/features/chat/state/messages'
import { useParticipants } from '@/features/agents/state'
import type { ImReadReceiptAdvance } from '@/types'

const EMPTY_READ_RECEIPTS: readonly ImReadReceiptAdvance[] = []

function confirmationsForMessage(
  receipts: readonly ImReadReceiptAdvance[],
  sequence: number,
  meId: string | null,
  currentMembers: readonly string[],
): ImReadReceiptAdvance[] {
  const memberSet = new Set(currentMembers)
  const firstByReader = new Map<string, ImReadReceiptAdvance>()
  for (const receipt of receipts) {
    if (receipt.readerId === meId || !memberSet.has(receipt.readerId)) continue
    if (!(receipt.previousReadSeq < sequence && receipt.readThroughSeq >= sequence)) continue
    const current = firstByReader.get(receipt.readerId)
    if (!current || receipt.readAt < current.readAt) firstByReader.set(receipt.readerId, receipt)
  }
  return [...firstByReader.values()].sort((left, right) => left.readAt.localeCompare(right.readAt))
}

export function ReadReceiptStatus() {
  const { message } = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  const meId = useMe()
  const conversation = useConversations((state) => state.list.find((item) => item.id === message.conversationId))
  const receipts = useMessages(
    (state) => state.readReceipts[message.conversationId] ?? EMPTY_READ_RECEIPTS,
  )
  const participants = useParticipants((state) => state.byId)
  if (message.authorId !== meId) return null
  if (message.failed) return <span className="mt-1 text-[10px] font-medium text-coral-deep">失败</span>
  if (message.pending || !message.sequence) return <span className="mt-1 text-[10px] text-ink-300">发送中</span>

  const confirmations = confirmationsForMessage(receipts, message.sequence, meId, conversation?.members ?? [])
  if (conversation?.kind === 'direct') {
    return <span className="mt-1 text-[10px] text-ink-300">{confirmations.length ? '已读' : '已发送'}</span>
  }
  if (!confirmations.length) return <span className="mt-1 text-[10px] text-ink-300">已发送</span>

  return (
    <Popover>
      <PopoverTrigger
        render={(
          <button type="button" className="mt-1 text-[10px] text-ink-300 underline-offset-2 hover:text-skype-deep hover:underline" />
        )}
      >
        {confirmations.length} 人已读
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2" aria-label="已读成员">
        <p className="px-2 pb-1.5 text-[11px] font-semibold text-ink-500">实际确认时间</p>
        <ScrollArea style={{ height: Math.min(confirmations.length * 44, 256) }}>
          {confirmations.map((receipt) => {
            const participant = participants[receipt.readerId]
            if (!participant) return null
            return (
              <div key={`${receipt.readerId}:${receipt.readThroughSeq}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                <Avatar p={participant} size={24} showStatus={false} ringColor="var(--panel)" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-700">{participant.name}</span>
                <time className="shrink-0 text-[10px] tabular-nums text-ink-300" dateTime={receipt.readAt}>
                  {new Date(receipt.readAt).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>
            )
          })}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
