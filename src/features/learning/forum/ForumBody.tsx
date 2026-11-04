import { nativeOperatorMismatch } from './learning-operators'
import { usableDocument } from '@/features/content-editor/document'
import { ContentDocumentView, type ContentDocument } from '@/features/content-editor'
import { ProtectedFileLinks } from '@/components/retab/ui/protected-file-links'
import { MemoContent } from './memos/MemoContent'

export function ForumBody({ content, document, evidence = false }: { content: string; evidence?: boolean; document?: ContentDocument | null }) {
  const mismatch=evidence&&usableDocument(document,content)&&nativeOperatorMismatch(document,content)
  return <ProtectedFileLinks>{mismatch&&<p role="status" className="text-xs text-muted-foreground">富文本与保存的运算符不一致，以下按保存文本显示，请核对作答原文。</p>}{usableDocument(document, content)&&!mismatch ? <ContentDocumentView document={document} /> : <MemoContent content={content} literalOperators={evidence} />}</ProtectedFileLinks>
}
