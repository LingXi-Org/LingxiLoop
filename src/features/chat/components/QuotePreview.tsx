import { ComposerPrimitive, useAuiState } from '@assistant-ui/react'
import { X } from 'lucide-react'
import ReplyMessage from '@/components/vendor/react-chat-elements/ReplyMessage'
import { Button } from '@/components/ui/button'
import { useParticipants } from '@/features/agents/state'
import { useConversationUi } from '@/stores/conversationUi'
import type { LingxiMessageMetadata, LingxiQuoteMetadata } from '../runtime/model'
import { quotePreviewText } from '../runtime/quote-preview'

export function MessageQuotePreview({ quote }: { quote: LingxiQuoteMetadata }) {
  const jumpToMessage = useConversationUi(state => state.jumpToMessage)
  const authorName = useParticipants(state => state.byId[quote.authorId]?.name) ?? quote.authorName ?? '引用消息'
  return <ReplyMessage title={authorName} message={quote.text}
    label={`查看原消息：${authorName}，${quote.text || '原消息不可用'}`}
    onClick={() => jumpToMessage(quote.messageId)} />
}

export function ComposerQuotePreview({ onDismiss }: { onDismiss: () => void }) {
  const quote = useAuiState(state => state.composer.quote)
  const original = useAuiState(state => state.thread.messages.find(message => quote &&
    [message.id, message.metadata.custom.clientMessageId, message.metadata.custom.imMessageId].includes(quote.messageId)))
  const metadata = original?.metadata.custom as LingxiMessageMetadata | undefined
  const authorName = useParticipants(state => metadata ? state.byId[metadata.senderId]?.name : undefined) ?? metadata?.senderName ?? '引用消息'
  return <ComposerPrimitive.Quote data-composer-quote="" className="mx-1 mb-2 flex min-w-0 items-center gap-1" aria-label="正在回复">
    <ReplyMessage title={authorName} message={original ? quotePreviewText(original) : quote?.text} />
    <ComposerPrimitive.QuoteDismiss asChild>
      <Button type="button" variant="ghost" size="icon-sm" className="size-11 shrink-0" aria-label="取消回复" onClick={onDismiss}>
        <X aria-hidden="true" />
      </Button>
    </ComposerPrimitive.QuoteDismiss>
  </ComposerPrimitive.Quote>
}
