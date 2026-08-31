import { IconRefresh, IconTrash, IconUpload } from '@tabler/icons-react'
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { IFile } from '@/components/icons'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { useParticipants } from '@/features/agents/state'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { useAuth } from '@/stores/auth'
import { knowledgeApi } from '../api'
import type { KnowledgeSource } from '../contracts'

const ACCEPT = '.pdf,.docx,.txt,.md,.csv,.json'
const statusLabel: Record<string, string> = {
  upload_pending: '等待上传', queued: '排队', processing: '处理中', parsing: '解析',
  chunking: '分块', indexing: '索引', ready: '就绪', failed: '失败',
}
const kindLabel: Record<KnowledgeSource['kind'], string> = { file: '文件', url: '网页', text: '文本' }

export function ProjectSourceLibrary({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<KnowledgeSource | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const byId = useParticipants((state) => state.byId)
  const me = useAuth((state) => state.user)

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    setError('')
    try { setSources(await knowledgeApi.listProjectSources(projectId)) }
    catch (reason) { setError(userFacingError(reason, '资料库暂时无法加载，请稍后重试。')) }
    finally { if (initial) setLoading(false) }
  }, [projectId])

  useEffect(() => {
    setSources([])
    setSelected(null)
    void load(true)
  }, [load])

  useEffect(() => {
    if (!sources.some((source) => source.status === 'upload_pending' || source.status === 'queued' || source.status === 'processing')) return
    const timer = window.setTimeout(() => void load(), 2_000)
    return () => window.clearTimeout(timer)
  }, [load, sources])

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...event.target.files ?? []]
    event.target.value = ''
    if (files.length === 0) return
    setUploading(true)
    try {
      await toastAction(Promise.all(files.map((file) => knowledgeApi.uploadProjectSource(projectId, file))), {
        loading: '正在上传资料', success: '资料已提交处理', error: '资料上传失败',
      })
      await load()
    } catch { /* Toast owns the visible error state. */ }
    finally { setUploading(false) }
  }

  const open = async (source: KnowledgeSource) => {
    setSelected(source)
    setDetailLoading(true)
    setDetailError('')
    try { setSelected(await knowledgeApi.getProjectSource(projectId, source.id)) }
    catch (reason) { setDetailError(userFacingError(reason, '资料预览暂时无法加载。')) }
    finally { setDetailLoading(false) }
  }

  const retry = async (source: KnowledgeSource) => {
    try {
      await toastAction(knowledgeApi.retryProjectSource(projectId, source.id), {
        loading: '正在重新处理资料', success: '资料已重新进入处理队列', error: '资料重试失败',
      })
      await load()
    } catch { /* Toast owns the visible error state. */ }
  }

  const remove = async () => {
    if (!selected || !await confirmSensitiveAction({
      title: '删除知识来源？',
      description: `“${selected.title}”及其索引内容将被永久删除。`,
      confirmLabel: '删除来源',
      tone: 'destructive',
    })) return
    try {
      await toastAction(knowledgeApi.deleteProjectSource(projectId, selected.id), {
        loading: '正在删除知识来源', success: '知识来源已删除', error: '删除知识来源失败',
      })
      setSelected(null)
      await load()
    } catch { /* Toast owns the visible error state. */ }
  }

  return <div className="@container/project-sources flex h-full min-h-0 flex-col bg-card text-card-foreground">
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--im-divider-weak)] px-4 @min-[48rem]/project-sources:px-6">
      <div className="min-w-0"><h1 className="truncate font-heading text-sm font-medium">资料库</h1><p className="sr-only">当前学习区可访问的 Notebook 资料</p></div>
      <Button type="button" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}><IconUpload />{uploading ? '上传中' : '上传资料'}</Button>
      <Input ref={fileRef} hidden multiple type="file" accept={ACCEPT} onChange={(event) => void upload(event)} />
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-4 @min-[48rem]/project-sources:p-6">
      {loading && sources.length === 0 ? <ResourceSkeleton variant="cards" count={6} label="正在加载资料库" />
        : error && sources.length === 0 ? <Alert variant="destructive"><AlertDescription className="flex items-center justify-between gap-3">{error}<Button type="button" variant="outline" size="sm" onClick={() => void load(true)}>重新加载</Button></AlertDescription></Alert>
          : sources.length === 0 ? <Empty className="min-h-80 border border-dashed"><EmptyHeader><EmptyMedia variant="icon"><IFile /></EmptyMedia><EmptyTitle>还没有资料</EmptyTitle><EmptyDescription>上传文件后，系统会自动提取内容并建立可检索索引。</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" onClick={() => fileRef.current?.click()}><IconUpload />上传资料</Button></EmptyContent></Empty>
            : <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{sources.map((source) => {
              const creator = byId[source.createdBy]?.name ?? (source.createdBy === me?.id ? '你' : '一位成员')
              return <Card key={source.id} size="sm" className="shadow-sm">
                <CardHeader><Button type="button" variant="ghost" className="h-auto min-w-0 justify-start gap-3 p-0 text-start" onClick={() => void open(source)}><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><IFile className="size-4" /></span><span className="min-w-0"><CardTitle className="truncate text-sm">{source.title}</CardTitle><span className="mt-1 block text-xs text-muted-foreground">{kindLabel[source.kind]} · {Math.max(1, Math.round(source.sizeBytes / 1024))} KB</span></span></Button></CardHeader>
                <CardContent className="flex flex-wrap gap-2"><Badge variant={source.status === 'failed' ? 'destructive' : 'secondary'}>{statusLabel[source.stage] ?? statusLabel[source.status] ?? '状态待同步'}</Badge><Badge variant="outline">{source.visibilityScope === 'PROJECT' ? '项目共享' : '仅自己'}</Badge>{source.chunkCount ? <Badge variant="outline">{source.chunkCount} 个片段</Badge> : null}</CardContent>
                <CardFooter className="justify-between gap-3 text-xs text-muted-foreground"><span className="truncate">{creator}</span>{source.status === 'failed' && (canManage || source.createdBy === me?.id) ? <Button type="button" variant="ghost" size="xs" onClick={() => void retry(source)}><IconRefresh />重试</Button> : null}</CardFooter>
              </Card>
            })}</div>{error ? <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert> : null}</>}
    </div>

    <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) { setSelected(null); setDetailError('') } }}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-[var(--im-divider-weak)] p-6 pe-14"><DialogTitle>{selected?.title ?? '资料预览'}</DialogTitle><DialogDescription>{selected ? `${kindLabel[selected.kind]} · ${statusLabel[selected.stage] ?? statusLabel[selected.status] ?? '状态待同步'} · ${selected.visibilityScope === 'PROJECT' ? '项目共享' : '仅自己'}` : '资料详情'}</DialogDescription></DialogHeader>
        <div className="min-h-0 overflow-y-auto p-6">
          {detailLoading ? <ResourceSkeleton variant="detail" label="正在加载资料预览" />
            : detailError ? <Alert variant="destructive"><AlertDescription>{detailError}</AlertDescription></Alert>
              : selected ? <><div className="flex flex-wrap gap-2">{selected.originalUrl ? <Button asChild variant="outline" size="sm"><a href={selected.originalUrl} target="_blank" rel="noreferrer">打开原始网页</a></Button> : null}{selected.originalFileUrl ? <Button asChild variant="outline" size="sm"><a href={selected.originalFileUrl} target="_blank" rel="noreferrer">打开原始文件</a></Button> : null}</div><pre className="mt-4 min-h-48 whitespace-pre-wrap rounded-2xl bg-muted p-4 font-sans text-sm leading-6">{selected.extractedText || (selected.error ? userFacingError(selected.error, '资料处理失败，请重试。') : '资料仍在处理中，完成后可预览提取内容。')}</pre>{canManage || selected.createdBy === me?.id ? <div className="mt-5 flex justify-end"><Button type="button" variant="destructive" onClick={() => void remove()}><IconTrash />删除来源</Button></div> : null}</> : null}
        </div>
      </DialogContent>
    </Dialog>
  </div>
}
