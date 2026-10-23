import { ComposerPrimitive, MessagePrimitive, useAuiState } from '@assistant-ui/react'
import { QuoteIcon, XIcon } from 'lucide-react'
import { nativeText } from '@/lib/nativeMessage'
import { useParticipants } from '@/features/agents/state'
import { useConversationUi } from '@/stores/conversationUi'
import type { LingxiMessageMetadata, LingxiQuoteMetadata } from '../runtime/model'
import { quotePreviewText } from '../runtime/quote-preview'

// Official registry QuoteBlock / ComposerQuotePreview styles, integrated with
// Lingxi's author metadata, accessible jump, and empty/attachment fallbacks.
// These styled components are registry source, not @assistant-ui/react exports.
// Provenance and installed primitive versions: docs/evidence/issue-335/README.md.
const composerTextClass = 'text-muted-foreground line-clamp-2 min-w-0 flex-1 text-sm [overflow-wrap:anywhere]'
const focusClass = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function MessageQuotePreview({ quote }: { quote: LingxiQuoteMetadata }) {
  const jumpToMessage = useConversationUi(state => state.jumpToMessage)
  const authorName = useParticipants(state => state.byId[quote.authorId]?.name) ?? quote.authorName ?? '引用消息'
  return <MessagePrimitive.Quote>{({ text, messageId }) => (
    <button type="button" data-quote-preview="" data-slot="quote-block"
      className={`mb-2 flex w-full min-w-0 items-start gap-1.5 text-start ${focusClass}`}
      aria-label={`查看原消息：${authorName}，${text || '原消息不可用'}`}
      onClick={() => jumpToMessage(messageId)}>
      <QuoteIcon data-slot="quote-block-icon" aria-hidden="true" className="text-muted-foreground/60 mt-0.5 size-3 shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-muted-foreground">{authorName}</span>
        <p data-slot="quote-block-text" className="text-muted-foreground/80 line-clamp-2 min-w-0 text-sm italic [overflow-wrap:anywhere]">
          {text || '原消息不可用'}
        </p>
      </div>
    </button>
  )}</MessagePrimitive.Quote>
}

export function ComposerQuotePreview({ onDismiss }: { onDismiss: () => void }) {
  const quote = useAuiState(state => state.composer.quote)
  const original = useAuiState(state => state.thread.messages.find(message => quote &&
    [message.id, message.metadata.custom.clientMessageId, message.metadata.custom.imMessageId].includes(quote.messageId)))
  const metadata = original?.metadata.custom as LingxiMessageMetadata | undefined
  const authorName = useParticipants(state => metadata ? state.byId[metadata.senderId]?.name : undefined) ?? metadata?.senderName ?? '引用消息'
  // Reply actions sanitize citations. Even an intentionally empty body must not
  // be replaced with raw source text; derive only an attachment-only preview.
  const text = quote?.text ?? ''
  const preview = original && !text.trim() && !nativeText(original).trim() ? quotePreviewText(original) : text
  return <ComposerPrimitive.Quote data-composer-quote="" data-slot="composer-quote"
    className="bg-muted/60 mx-3 mt-2 flex min-w-0 items-start gap-2 rounded-lg px-3 py-2" aria-label="正在回复">
    <QuoteIcon data-slot="composer-quote-icon" aria-hidden="true" className="text-muted-foreground/70 mt-0.5 size-3.5 shrink-0" />
    <div className="min-w-0 flex-1">
      <span className="block truncate text-xs font-medium text-muted-foreground">{authorName}</span>
      {text ? <ComposerPrimitive.QuoteText data-slot="composer-quote-text" className={composerTextClass}>{preview}</ComposerPrimitive.QuoteText>
        // In 0.15.16 QuoteText returns null for empty quote.text, even with children.
        : <span data-slot="composer-quote-text" className={composerTextClass}>{preview || '原消息不可用'}</span>}
    </div>
    <ComposerPrimitive.QuoteDismiss data-slot="composer-quote-dismiss" aria-label="取消回复" onClick={onDismiss}
      className={`flex size-11 shrink-0 items-center justify-center rounded-sm p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground motion-reduce:transition-none ${focusClass}`}>
      <XIcon aria-hidden="true" className="size-3.5" />
    </ComposerPrimitive.QuoteDismiss>
  </ComposerPrimitive.Quote>
}
