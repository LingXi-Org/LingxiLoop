import { lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { FilePreviewContent } from '@/components/retab/ui/file-preview-dialog'
import { knowledgeApi } from '../knowledge/api'
import type { KnowledgeSource } from '../knowledge/contracts'
import { userFacingError } from '@/lib/userFacingError'
import { type MaterialContext, materialQueryKey } from './data'
import { materialsQueryClient } from './queries'

const OriginalFileViewer = lazy(() => import('./OriginalFileViewer'))

export function MaterialPreview({ source, context, onClose }: {
  source: KnowledgeSource; context: MaterialContext; onClose(): void
}) {
  const detail = useQuery({ queryKey: [...materialQueryKey(context), 'detail', source.id],
    queryFn: () => knowledgeApi.getProjectSource(context.projectId, source.id),
  }, materialsQueryClient)
  const file = detail.data ?? source
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="h-[85dvh] max-h-[85dvh] gap-0 overflow-hidden p-0 sm:max-w-6xl [&_[data-slot=viewer-controls]]:pe-14" aria-describedby={undefined}>
      <DialogTitle className="sr-only">{file.title}</DialogTitle>
      {detail.isPending ? <ResourceSkeleton variant="detail" label="正在加载资料预览" />
        : detail.isError ? <Alert variant="destructive"><AlertDescription>{userFacingError(detail.error, '资料预览暂时无法加载。')} <Button variant="outline" onClick={() => void detail.refetch()}>重试</Button></AlertDescription></Alert>
          : file.kind === 'file' ? <Suspense fallback={<ResourceSkeleton variant="detail" label="正在加载文件预览器" />}><OriginalFileViewer key={[...materialQueryKey(context), file.id].join('|')} source={file} context={context} /></Suspense>
            : file.extractedText ? <FilePreviewContent source={{ kind: 'text', text: file.extractedText, fileName: `${file.title}.txt` }} />
              : <p className="p-6">{file.originalUrl ? <a className="text-primary underline" href={file.originalUrl} target="_blank" rel="noreferrer">打开原始网页</a> : '资料内容暂不可用。'}</p>}
    </DialogContent>
  </Dialog>
}
