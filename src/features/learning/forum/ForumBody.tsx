import { usableDocument } from '@/features/content-editor/document'
import { ContentDocumentView, type ContentDocument } from '@/features/content-editor'
import { ProtectedFileLinks } from '@/components/retab/ui/protected-file-links'
import { MemoContent } from './memos/MemoContent'

export function ForumBody({ content, document, purpose = 'forum' }: { content: string; document?: ContentDocument | null; purpose?: 'forum' | 'homework' }) {
  return <div data-content-typography={purpose}><ProtectedFileLinks>{usableDocument(document, content) ? <ContentDocumentView document={document} /> : <MemoContent content={content} />}</ProtectedFileLinks></div>
}
