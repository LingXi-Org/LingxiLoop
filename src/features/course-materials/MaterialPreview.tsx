import { useQuery } from '@tanstack/react-query'
import { Download, RotateCcw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { knowledgeApi } from '../knowledge/api'
import type { KnowledgeSource } from '../knowledge/contracts'
import { ConversationSourceToggle } from '../knowledge/components/ConversationSourceToggle'
import { userFacingError } from '@/lib/userFacingError'
import { type MaterialContext, materialQueryKey, sourceStatusLabel } from './data'
import { materialsQueryClient } from './queries'

export function MaterialPreview({ source, context, onClose, onDownload, downloadBusy }: {
  source: KnowledgeSource; context: MaterialContext; onClose(): void; onDownload(source: KnowledgeSource): void; downloadBusy: boolean
}) {
  const detail = useQuery({ queryKey: [...materialQueryKey(context), 'detail', source.id],
    queryFn: () => knowledgeApi.getProjectSource(context.projectId, source.id),
    refetchInterval: query => ['upload_pending', 'queued', 'processing'].includes(query.state.data?.status ?? '') ? 2000 : false,
  }, materialsQueryClient)
  const file = detail.data ?? source
  const stored = file.status === 'stored' || file.stage === 'stored_only'
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="max-h-[85dvh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
      <DialogHeader className="border-b p-6 pe-14"><DialogTitle className="break-words leading-6">{file.title}</DialogTitle>
        <DialogDescription>{sourceStatusLabel(file)} · {file.visibilityScope === 'PROJECT' ? '课程成员可见' : '仅自己可见'}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-y-auto p-6">
        {detail.isPending ? <ResourceSkeleton variant="detail" label="正在加载资料预览" />
          : detail.isError ? <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">{userFacingError(detail.error, '资料预览暂时无法加载。')}<Button variant="outline" onClick={() => void detail.refetch()}><RotateCcw />重试</Button></AlertDescription></Alert>
            : <>
              {file.capabilities?.canDownload && <Button variant="outline" disabled={downloadBusy} onClick={() => onDownload(file)}><Download />{downloadBusy ? '正在下载…' : '下载原文件'}</Button>}
              {file.originalUrl && <Button asChild variant="outline"><a href={file.originalUrl} target="_blank" rel="noreferrer">打开原始网页</a></Button>}
              {file.extractedText ? <pre className="mt-5 whitespace-pre-wrap break-words rounded-xl bg-muted/40 p-5 font-sans text-sm leading-7">{file.extractedText}</pre>
                : <p className="mt-5 rounded-xl bg-muted/40 p-5 text-sm leading-7 text-muted-foreground">{stored ? '仅保存原文件，请下载查看。'
                  : file.status === 'failed' ? '内容解析失败。原文件已保存，可下载查看。'
                    : file.status === 'ready' ? '暂无文本预览，请下载原文件查看。' : '资料正在解析，完成后可查看文本。原文件可下载后会显示下载入口。'}</p>}
              {file.isTruncated && <p className="mt-3 text-xs text-muted-foreground">预览内容不完整，请下载原文件查看。</p>}
              {file.status === 'ready' && <ConversationSourceToggle projectId={context.projectId} sourceId={file.id} />}
            </>}
      </div>
    </DialogContent>
  </Dialog>
}
