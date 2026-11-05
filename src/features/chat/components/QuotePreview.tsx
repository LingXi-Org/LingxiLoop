import { ComposerPrimitive, MessagePrimitive, useAuiState } from '@assistant-ui/react'
import { XIcon } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import { nativeText } from '@/lib/nativeMessage'
import { useParticipants } from '@/features/agents/state'
import { useConversationUi } from '@/stores/conversationUi'
import type { LingxiMessageMetadata, LingxiQuoteMetadata } from '../runtime/model'
import { quotePreviewText } from '../runtime/quote-preview'
import { displayMentionText } from '@/lib/mentions'
import { participantDisplayName } from '@/lib/participantDisplayName'
import { useConversations } from '@/features/conversations/store'

// Official registry QuoteBlock / ComposerQuotePreview styles, integrated with
// Lingxi's author metadata, accessible jump, and empty/attachment fallbacks.
// These styled components are registry source, not @assistant-ui/react exports.
// Provenance and installed primitive versions: docs/evidence/issue-335/README.md.
const composerTextClass = 'min-w-0 flex-1 truncate text-[12.5px] text-fg2'
const focusClass = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function MessageQuotePreview({ quote }: { quote: LingxiQuoteMetadata }) {
  const jumpToMessage = useConversationUi(state => state.jumpToMessage)
  const participants = useParticipants(state => state.byId)
  const conversationId = useAuiState(state => state.message.metadata.custom.conversationId)
  const members = useConversations(state => state.list.find(conversation => conversation.id === conversationId)?.members)
  const authorName = participants[quote.authorId] ? participantDisplayName(participants[quote.authorId]) : '引用消息'
  const roster = (members ?? []).flatMap(id => participants[id] ? [participants[id]] : [])
  return <MessagePrimitive.Quote>{({ text, messageId }) => (
    <button type="button" data-quote-preview="" data-slot="quote-block"
      className={`mb-1.5 flex max-w-full min-w-0 flex-col gap-px self-start rounded-lg bg-formula px-2.5 py-1.5 text-start hover:bg-accent ${focusClass}`}
      aria-label={`查看原消息：${authorName}，${displayMentionText(text,roster) || '原消息不可用'}`}
      onClick={() => jumpToMessage(messageId)}>
      <span className="flex min-w-0 items-center gap-[5px] text-xs text-muted-foreground">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-3 shrink-0"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v5" /></svg>
        {participants[quote.authorId] && <Avatar p={participants[quote.authorId]} size={12} animated={false} ringColor="transparent" />}
        <span className="truncate">{authorName}</span>
      </span>
      <span data-slot="quote-block-text" className="min-w-0 truncate text-[13px] text-fg2">
        {displayMentionText(text,roster) || '原消息不可用'}
      </span>
    </button>
  )}</MessagePrimitive.Quote>
}

export function ComposerQuotePreview({ onDismiss }: { onDismiss: () => void }) {
  const quote = useAuiState(state => state.composer.quote)
  const original = useAuiState(state => state.thread.messages.find(message => quote &&
    [message.id, message.metadata.custom.clientMessageId, message.metadata.custom.imMessageId].includes(quote.messageId)))
  const metadata = original?.metadata.custom as LingxiMessageMetadata | undefined
  const participants = useParticipants(state => state.byId)
  const members = useConversations(state => state.list.find(conversation => conversation.id === metadata?.conversationId)?.members)
  const author = metadata && participants[metadata.senderId]
  const authorName = author ? participantDisplayName(author) : '引用消息'
  // Reply actions sanitize citations. Even an intentionally empty body must not
  // be replaced with raw source text; derive only an attachment-only preview.
  const text = quote?.text ?? ''
  const preview = displayMentionText(original && !text.trim() && !nativeText(original).trim() ? quotePreviewText(original) : text,
    (members ?? []).flatMap(id => participants[id] ? [participants[id]] : []))
  return <ComposerPrimitive.Quote data-composer-quote="" data-slot="composer-quote"
    className="flex min-w-0 items-center gap-2 rounded-xl bg-formula px-2.5 py-1.5 text-muted-foreground" aria-label="正在回复">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-[13px] shrink-0"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v5" /></svg>
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <span className="shrink-0 text-xs text-muted-foreground">回复 {authorName}：</span>
      {text ? <ComposerPrimitive.QuoteText data-slot="composer-quote-text" className={composerTextClass}>{preview}</ComposerPrimitive.QuoteText>
        // In 0.15.16 QuoteText returns null for empty quote.text, even with children.
        : <span data-slot="composer-quote-text" className={composerTextClass}>{preview || '原消息不可用'}</span>}
    </div>
    <ComposerPrimitive.QuoteDismiss data-slot="composer-quote-dismiss" aria-label="取消回复" onClick={onDismiss}
      className={`-me-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground motion-reduce:transition-none max-md:size-11 ${focusClass}`}>
      <XIcon aria-hidden="true" className="size-[13px]" strokeWidth={2} />
    </ComposerPrimitive.QuoteDismiss>
  </ComposerPrimitive.Quote>
}
