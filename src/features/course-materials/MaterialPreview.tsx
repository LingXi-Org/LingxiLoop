import { lazy, Suspense, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, RotateCcw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { knowledgeApi } from '../knowledge/api'
import type { KnowledgeSource } from '../knowledge/contracts'
import { ConversationSourceToggle } from '../knowledge/components/ConversationSourceToggle'
import { userFacingError } from '@/lib/userFacingError'
import { type MaterialContext, fileKind, materialQueryKey, sourceStatusLabel } from './data'
import { materialsQueryClient } from './queries'

const OriginalFileViewer = lazy(() => import('./OriginalFileViewer'))
const MaterialSegments = lazy(() => import('./MaterialSegments'))

export function MaterialPreview({ source, context, onClose, onDownload, downloadBusy }: {
  source: KnowledgeSource; context: MaterialContext; onClose(): void; onDownload(source: KnowledgeSource): void; downloadBusy: boolean
}) {
  const [mode, setMode] = useState('original')
  const detail = useQuery({ queryKey: [...materialQueryKey(context), 'detail', source.id],
    queryFn: () => knowledgeApi.getProjectSource(context.projectId, source.id),
    refetchInterval: query => ['upload_pending', 'queued', 'processing'].includes(query.state.data?.status ?? '') ? 2000 : false,
  }, materialsQueryClient)
  const file = detail.data ?? source
  const stored = file.status === 'stored' || file.stage === 'stored_only'
  const indexed = file.status === 'ready' && (file.chunkCount ?? 0) > 0
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="max-h-[85dvh] gap-0 overflow-hidden p-0 sm:max-w-6xl">
      <DialogHeader className="border-b p-6 pe-14"><DialogTitle className="break-words leading-6">{file.title}</DialogTitle>
        <DialogDescription>{sourceStatusLabel(file)} · {file.visibilityScope === 'PROJECT' ? '课程成员可见' : '仅自己可见'}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-y-auto p-6">
        {detail.isPending ? <ResourceSkeleton variant="detail" label="正在加载资料预览" />
          : detail.isError ? <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">{userFacingError(detail.error, '资料预览暂时无法加载。')}<Button variant="outline" onClick={() => void detail.refetch()}><RotateCcw />重试</Button></AlertDescription></Alert>
            : <>
              {file.capabilities?.canDownload && <Button variant="outline" disabled={downloadBusy} onClick={() => onDownload(file)}><Download />{downloadBusy ? '正在下载…' : '下载原文件'}</Button>}
              {file.originalUrl && <Button asChild variant="outline"><a href={file.originalUrl} target="_blank" rel="noreferrer">打开原始网页</a></Button>}
              <Tabs value={mode === 'semantic' && !indexed ? 'original' : mode} onValueChange={setMode} className="mt-4 min-w-0">
                <TabsList aria-label="资料预览方式"><TabsTrigger value="original">原文件</TabsTrigger><TabsTrigger value="parsed">解析文本</TabsTrigger>{indexed && <TabsTrigger value="semantic">语义命中</TabsTrigger>}</TabsList>
                <TabsContent value="original" className="min-w-0">
                  {file.kind === 'file' && file.capabilities?.canDownload && !['archive', 'unknown'].includes(fileKind(file))
                    ? <Suspense fallback={<ResourceSkeleton variant="detail" label="正在加载原文件预览器" />}><OriginalFileViewer key={[...materialQueryKey(context), file.id].join('|')} source={file} context={context} /></Suspense>
                    : <p className="rounded-xl bg-muted/40 p-5 text-sm leading-7 text-muted-foreground">{file.kind !== 'file' ? '此资料没有原文件，可切换到解析文本查看。' : file.status === 'upload_pending' ? '原文件尚未上传完成。' : '此格式暂不支持预览，可下载原文件查看。'}</p>}
                </TabsContent>
                <TabsContent value="parsed">
                  {file.extractedText ? <pre className="whitespace-pre-wrap break-words rounded-xl bg-muted/40 p-5 font-sans text-sm leading-7">{file.extractedText}</pre>
                    : <p className="rounded-xl bg-muted/40 p-5 text-sm leading-7 text-muted-foreground">{stored ? '此资料仅保存原文件，暂无解析文本。'
                      : file.status === 'failed' ? '文本解析失败，仍可查看原文件。'
                        : file.status === 'ready' ? '此资料暂无解析文本。' : '资料正在解析，请稍后查看文本。'}</p>}
                  {file.isTruncated && <p className="mt-3 text-xs text-muted-foreground">解析文本不完整，可切换到原文件查看。</p>}
                </TabsContent>
                <TabsContent value="semantic">
                  {mode === 'semantic' && indexed && <Suspense fallback={<ResourceSkeleton variant="detail" label="正在加载知识片段" />}><MaterialSegments source={file} context={context} /></Suspense>}
                </TabsContent>
              </Tabs>
              {file.status === 'ready' && <ConversationSourceToggle projectId={context.projectId} sourceId={file.id} />}
            </>}
      </div>
    </DialogContent>
  </Dialog>
}
