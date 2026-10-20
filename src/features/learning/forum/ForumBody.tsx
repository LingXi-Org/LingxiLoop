import { ContentDocumentView, type ContentDocument } from '@/features/content-editor'
import { MemoContent } from './memos/MemoContent'

export function ForumBody({ content, document }: { content: string; document?: ContentDocument | null }) {
  return document ? <ContentDocumentView document={document} /> : <MemoContent content={content} />
}
