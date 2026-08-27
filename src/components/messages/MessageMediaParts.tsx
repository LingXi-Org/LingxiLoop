import { useMemo } from 'react'
import { CitationList } from '@/components/tool-ui/citation'
import { MessageDraft } from '@/components/tool-ui/message-draft'
import { useKnowledgeSources } from '@/stores/knowledgeSources'
import type { KnowledgeCitation, Message } from '@/types'
import { EmailCard } from './MessageBusinessParts'
import { AttachmentCard } from './MessageAttachmentCard'

export function CitationPart({ message }: { message: Message }) {
  const openCitation = useKnowledgeSources((state) => state.openCitation)
  const sourceByToolId = useMemo(() => new Map((message.citations ?? []).map((citation) => [`citation-${message.id}-${citation.chunkId}`, citation])), [message.citations, message.id])
  const citations = (message.citations ?? []).map((citation) => ({ id: `citation-${message.id}-${citation.chunkId}`, role: 'information' as const, href: citation.sourceUrl && /^https?:\/\//i.test(citation.sourceUrl) ? citation.sourceUrl : `https://lingxiloop.local/knowledge/${encodeURIComponent(citation.sourceId)}#${encodeURIComponent(citation.chunkId)}`, title: `[${citation.marker}] ${citation.sourceTitle}`, snippet: citation.excerpt, domain: citation.sourceUrl ? new URL(citation.sourceUrl, window.location.origin).hostname : 'Lingxi Knowledge', type: 'document' as const }))
  if (!citations.length) return null
  return <CitationList id={`citation-list-${message.id}`} citations={citations} variant="inline" maxVisible={5} className="mt-2 max-w-[620px]" onNavigate={(_href, item) => { const source = sourceByToolId.get(item.id); if (source) void openCitation(source as KnowledgeCitation) }} />
}

export function MediaPart({ message }: { message: Message }) {
  const attachment = message.attachment
  if (!attachment) throw new Error('Attachment message is missing its native attachment payload')
  return <AttachmentCard />
}

export function EmailPart({ message }: { message: Message }) {
  const email = message.email
  if (!email) throw new Error('Email message is missing its native email payload')
  if (email.direction === 'in') return <EmailCard />
  return <MessageDraft id={`message-draft-${message.id}`} role="state" channel="email" subject={email.subject || '（无主题）'} body={message.body || '（无正文）'} from={email.from} to={email.to.length ? email.to : ['unknown@invalid.local']} cc={email.cc} outcome={email.transportStatus === 'failed' ? 'cancelled' : 'sent'} className="mt-2 max-w-[620px]" />
}
