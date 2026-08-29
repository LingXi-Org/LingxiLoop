import { useConversationUi } from '@/stores/conversationUi'
import { useParticipants } from '@/features/agents/state'
import type { Message } from '@/types'
import { Button } from '@/components/ui/button'

export function QuoteCard({ message }: { message: Message }) {
  const byId = useParticipants((state) => state.byId)
  const jumpToMessage = useConversationUi((state) => state.jumpToMessage)
  if (!message.quotedMessageId) return null
  const jump = () => jumpToMessage(message.quotedMessageId!)
  if (!message.quoted) return <Button type="button" variant="ghost" onClick={jump} data-message-surface="inset" className="mb-1.5 h-auto max-w-full justify-start truncate px-3 py-2 text-left" style={{ width: 'min(580px, 62vw)' }}>
    <span className="text-[11.5px] italic text-muted-foreground">[消息已删除]</span>
  </Button>
  const summary = message.quoted
  const authorName = summary.authorName ?? byId[summary.authorId]?.name ?? summary.authorId
  const bodyPreview = summary.kind === 'tool' ? '[tool call]' : summary.body.slice(0, 140).replace(/\n/g, ' ')
  return <Button type="button" variant="ghost" onClick={jump} data-message-surface="inset" className="mb-1.5 h-auto max-w-full justify-start gap-1.5 px-3 py-2 text-left" style={{ width: 'min(580px, 62vw)' }} title="跳转至原文">
    <span className="shrink-0 truncate text-[11.5px] font-semibold text-primary">{authorName}</span><span className="shrink-0 text-[10px] text-muted-foreground" aria-hidden>·</span><span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">{bodyPreview}</span>
  </Button>
}
