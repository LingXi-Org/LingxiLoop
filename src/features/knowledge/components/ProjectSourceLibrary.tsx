import {
  Delete02Icon,
  Edit02Icon,
  File01Icon,
  FileTextIcon,
  Link01Icon,
  Loading03Icon,
  RefreshIcon,
  Upload04Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useParticipants } from '@/features/agents/state'
import { KnowledgeSourceUploadDialog } from '@/features/knowledge/components/KnowledgeSourceUploadDialog'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { useAuth } from '@/stores/auth'
import { knowledgeApi } from '../api'
import type { KnowledgeSource } from '../contracts'
import { ConversationSourceToggle } from './ConversationSourceToggle'

const statusLabel: Record<string, string> = {
  upload_pending: '等待上传', queued: '等待处理', processing: '处理中', parsing: '处理中',
  chunking: '处理中', indexing: '处理中', ready: '可查看', failed: '处理失败', retrying: '重新处理',
}
const kindLabel: Record<KnowledgeSource['kind'], string> = { file: '文件', url: '网页', text: '文本' }

function SourceIcon({ source, className }: { source: KnowledgeSource; className?: string }) {
  const icon = source.kind === 'url' ? Link01Icon : source.kind === 'text' ? FileTextIcon : File01Icon
  return <HugeiconsIcon icon={icon} strokeWidth={1.6} className={className} />
}

export function ProjectSourceLibrary({
  projectId,
  canManage,
  visibilityScope,
  ownerUserId,
  readOnly = false,
  reviewMode = false,
}: {
  projectId: string
  canManage: boolean
  visibilityScope?: KnowledgeSource['visibilityScope']
  ownerUserId?: string
  readOnly?: boolean
  reviewMode?: boolean
}) {
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<KnowledgeSource | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<KnowledgeSource | null>(null)
  const byId = useParticipants((state) => state.byId)
  const me = useAuth((state) => state.user)

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    setError('')
    try {
      setSources(await (reviewMode
        ? knowledgeApi.listCourseReviewSources(projectId)
        : knowledgeApi.listProjectSources(projectId)))
    }
    catch (reason) { setError(userFacingError(reason, '资料库暂时无法加载，请稍后重试。')) }
    finally { if (initial) setLoading(false) }
  }, [projectId, reviewMode])

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

  const uploadFiles = (files: File[]) => {
    let revealed = false
    const revealPending = () => {
      if (revealed) return
      revealed = true
      void load()
    }
    const uploads = Promise.all(files.map((file) => knowledgeApi.uploadProjectSource(projectId, file, revealPending)))
    void toastAction(uploads, {
      loading: '正在上传文件', success: '文件已上传，正在准备内容', error: '文件上传失败',
    }).then(() => load()).catch(() => undefined)
  }
  const addUrl = async (url: string, title?: string) => { await knowledgeApi.addProjectUrlSource(projectId, { url, title }); await load() }
  const addText = async (title: string, text: string) => { await knowledgeApi.addProjectTextSource(projectId, { title, text }); await load() }
  const visibleSources = useMemo(() => sources.filter((source) =>
    (!visibilityScope || source.visibilityScope === visibilityScope)
      && (!ownerUserId || source.ownerUserId === ownerUserId)), [ownerUserId, sources, visibilityScope])
  const editable = (source: KnowledgeSource) => !readOnly && (canManage || source.createdBy === me?.id)

  const open = async (source: KnowledgeSource) => {
    setSelected(source)
    setDetailLoading(true)
    setDetailError('')
    try {
      setSelected(await (reviewMode
        ? knowledgeApi.getCourseReviewSource(projectId, source.id)
        : knowledgeApi.getProjectSource(projectId, source.id)))
    }
    catch (reason) { setDetailError(userFacingError(reason, '资料预览暂时无法加载。')) }
    finally { setDetailLoading(false) }
  }

  const retry = async (source: KnowledgeSource) => {
    try {
      await toastAction(knowledgeApi.retryProjectSource(projectId, source.id), {
        loading: '正在重新处理资料', success: '资料已开始重新处理', error: '无法重新处理资料，请稍后重试',
      })
      await load()
    } catch { /* Toast owns the visible error state. */ }
  }

  const remove = async (source: KnowledgeSource) => {
    if (!await confirmSensitiveAction({
      title: '删除资料？',
      description: `“${source.title}”及其搜索内容将被永久删除。`,
      confirmLabel: '删除资料',
      tone: 'destructive',
    })) return
    try {
      await toastAction(knowledgeApi.deleteProjectSource(projectId, source.id), {
        loading: '正在删除资料', success: '资料已删除', error: '删除资料失败',
      })
      if (selected?.id === source.id) setSelected(null)
      await load()
    } catch { /* Toast owns the visible error state. */ }
  }

  return <div className="space-y-5">
    {!readOnly ? <div className="flex justify-end"><Button type="button" onClick={() => setAdding(true)}><HugeiconsIcon icon={Upload04Icon} strokeWidth={2} />添加资料</Button></div> : null}
    <div>
      {loading && visibleSources.length === 0 ? <ResourceSkeleton variant="cards" count={6} label="正在加载资料库" />
        : error && visibleSources.length === 0 ? <Alert variant="destructive"><AlertDescription className="flex items-center justify-between gap-3">{error}<Button type="button" variant="outline" size="sm" onClick={() => void load(true)}>重新加载</Button></AlertDescription></Alert>
          : visibleSources.length === 0 ? <Empty className="min-h-96 border border-dashed"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={File01Icon} strokeWidth={2} /></EmptyMedia><EmptyTitle>还没有资料</EmptyTitle><EmptyDescription>{readOnly ? '这里还没有可查看的资料。' : '添加文件、网页或文本，之后可在资料库中查看和搜索。'}</EmptyDescription></EmptyHeader>{!readOnly ? <EmptyContent><Button type="button" onClick={() => setAdding(true)}><HugeiconsIcon icon={Upload04Icon} strokeWidth={2} />添加资料</Button></EmptyContent> : null}</Empty>
            : <><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visibleSources.map((source) => {
              const creator = byId[source.createdBy]?.name ?? source.ownerName ?? (source.createdBy === me?.id ? '你' : '一位成员')
              const busy = source.status === 'upload_pending' || source.status === 'queued' || source.status === 'processing'
              const canEdit = editable(source)
              return <ContextMenu key={source.id}>
                <ContextMenuTrigger asChild>
                  <Card size="sm" className="relative min-h-64 overflow-visible transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-ring">
                    <button type="button" className="flex h-full w-full flex-col items-start gap-4 px-5 py-5 text-start outline-none" onClick={() => void open(source)}>
                      <span className={source.status === 'failed' ? 'grid size-16 place-items-center rounded-4xl bg-destructive/10 text-destructive' : 'grid size-16 place-items-center rounded-4xl bg-primary/10 text-primary'}>
                        {busy ? <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.8} className="size-8 animate-spin" /> : <SourceIcon source={source} className="size-9" />}
                      </span>
                      <span className="min-w-0 space-y-1">
                        <span className="block line-clamp-2 font-heading text-base font-medium">{source.title}</span>
                        <span className="block text-sm text-muted-foreground">{kindLabel[source.kind]} · {Math.max(1, Math.round(source.sizeBytes / 1024))} KB</span>
                      </span>
                      <span className="mt-auto flex w-full flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={source.status === 'failed' ? 'destructive' : source.status === 'ready' ? 'secondary' : 'outline'}>{statusLabel[source.stage] ?? statusLabel[source.status] ?? '状态暂不可用'}</Badge>
                        <span className="ms-auto truncate">{creator}</span>
                      </span>
                    </button>
                  </Card>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => void open(source)}><SourceIcon source={source} />打开资料</ContextMenuItem>
                  {canEdit ? <ContextMenuItem onSelect={() => setRenaming(source)}><HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />重命名</ContextMenuItem> : null}
                  {source.status === 'failed' && canEdit ? <ContextMenuItem onSelect={() => void retry(source)}><HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />重新处理</ContextMenuItem> : null}
                  {canEdit ? <><ContextMenuSeparator /><ContextMenuItem variant="destructive" onSelect={() => void remove(source)}><HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />删除资料</ContextMenuItem></> : null}
                </ContextMenuContent>
              </ContextMenu>
            })}</div>{error ? <Alert variant="destructive" className="mt-5"><AlertDescription>{error}</AlertDescription></Alert> : null}</>}
    </div>

    {!readOnly ? <KnowledgeSourceUploadDialog open={adding} onOpenChange={setAdding} onFiles={uploadFiles} onUrl={addUrl} onText={addText} /> : null}
    <RenameSourceDialog source={renaming} onOpenChange={(open) => { if (!open) setRenaming(null) }} onSave={async (source, title) => {
      await toastAction(knowledgeApi.renameProjectSource(projectId, source.id, title), { loading: '正在重命名资料', success: '资料已重命名', error: '重命名资料失败' })
      setRenaming(null)
      if (selected?.id === source.id) setSelected({ ...selected, title })
      await load()
    }} />

    <Dialog open={selected !== null} onOpenChange={(nextOpen) => { if (!nextOpen) { setSelected(null); setDetailError('') } }}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border/60 p-6 pe-14"><DialogTitle>{selected?.title ?? '资料预览'}</DialogTitle><DialogDescription>{selected ? `${kindLabel[selected.kind]} · ${statusLabel[selected.stage] ?? statusLabel[selected.status] ?? '状态暂不可用'} · ${selected.visibilityScope === 'PROJECT' ? '项目成员可见' : '仅自己可见'}` : '资料'}</DialogDescription></DialogHeader>
        <div className="min-h-0 overflow-y-auto p-6">
          {selected && !detailError && <ConversationSourceToggle key={`${projectId}:${selected.id}`} projectId={projectId} sourceId={selected.id} />}
          {detailLoading ? <ResourceSkeleton variant="detail" label="正在加载资料预览" />
            : detailError ? <Alert variant="destructive"><AlertDescription>{detailError}</AlertDescription></Alert>
              : selected ? <><div className="flex flex-wrap gap-2">{selected.originalUrl ? <Button asChild variant="outline" size="sm"><a href={selected.originalUrl} target="_blank" rel="noreferrer">打开原始网页</a></Button> : null}{selected.originalFileUrl ? <Button asChild variant="outline" size="sm"><a href={selected.originalFileUrl} target="_blank" rel="noreferrer">打开原始文件</a></Button> : null}</div><pre className="mt-4 min-h-48 whitespace-pre-wrap rounded-3xl bg-muted p-5 font-sans text-sm leading-6">{selected.extractedText || (selected.error ? userFacingError(selected.error, '资料处理失败，请重试。') : '资料仍在处理中，完成后可预览提取内容。')}</pre>{editable(selected) ? <div className="mt-5 flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setRenaming(selected)}><HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />重命名</Button><Button type="button" variant="destructive" onClick={() => void remove(selected)}><HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />删除来源</Button></div> : null}</> : null}
        </div>
      </DialogContent>
    </Dialog>
  </div>
}

function RenameSourceDialog({ source, onOpenChange, onSave }: {
  source: KnowledgeSource | null
  onOpenChange(open: boolean): void
  onSave(source: KnowledgeSource, title: string): Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => setTitle(source?.title ?? ''), [source])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalized = title.trim()
    if (!source || !normalized || busy) return
    setBusy(true)
    try { await onSave(source, normalized) }
    catch { /* Toast owns the visible error state. */ }
    finally { setBusy(false) }
  }
  return <Dialog open={source !== null} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit} className="space-y-6"><DialogHeader><DialogTitle>重命名资料</DialogTitle><DialogDescription>仅修改资料库中的显示名称，不改变原文件内容。</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="source-title">名称</Label><Input id="source-title" value={title} maxLength={200} autoFocus onChange={(event) => setTitle(event.target.value)} /></div><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={busy || !title.trim()}>{busy ? '保存中' : '保存'}</Button></DialogFooter></form></DialogContent></Dialog>
}
