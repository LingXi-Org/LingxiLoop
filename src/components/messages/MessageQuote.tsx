import { useConversationUi } from '@/stores/conversationUi'
import { useParticipants } from '@/stores/participants'
import type { Message } from '@/types'

export function QuoteCard({ message }: { message: Message }) {
  const byId = useParticipants((state) => state.byId)
  const jumpToMessage = useConversationUi((state) => state.jumpToMessage)
  if (!message.quotedMessageId) return null
  const jump = () => jumpToMessage(message.quotedMessageId!)
  if (!message.quoted) return <button onClick={jump} data-message-surface="inset" className="mb-1.5 block max-w-full truncate text-left" style={{ width: 'min(580px, 62vw)' }}>
    <span className="text-[11.5px] italic text-ink-400">[消息已删除]</span>
  </button>
  const summary = message.quoted
  const authorName = summary.authorName ?? byId[summary.authorId]?.name ?? summary.authorId
  const bodyPreview = summary.kind === 'tool' ? '[tool call]' : summary.body.slice(0, 140).replace(/\n/g, ' ')
  return <button onClick={jump} data-message-surface="inset" className="mb-1.5 flex max-w-full items-baseline gap-1.5 text-left" style={{ width: 'min(580px, 62vw)' }} title="跳转至原文">
    <span className="shrink-0 truncate text-[11.5px] font-semibold text-skype-deep">{authorName}</span><span className="shrink-0 text-[10px] text-ink-300" aria-hidden>·</span><span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-500">{bodyPreview}</span>
  </button>
}
