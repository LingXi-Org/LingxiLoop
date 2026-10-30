import { usableDocument } from '@/features/content-editor/document'
import { ContentDocumentView, type ContentDocument } from '@/features/content-editor'
import { ProtectedFileLinks } from '@/components/retab/ui/protected-file-links'
import { MemoContent } from './memos/MemoContent'

export function ForumBody({ content, document }: { content: string; document?: ContentDocument | null }) {
  return <ProtectedFileLinks>{usableDocument(document, content) ? <ContentDocumentView document={document} /> : <MemoContent content={content} />}</ProtectedFileLinks>
}
