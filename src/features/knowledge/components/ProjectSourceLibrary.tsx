import { Delete02Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { SourceLibraryBrowser, sourceStatusLabel as statusLabel } from './SourceLibraryBrowser'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

const kindLabel: Record<KnowledgeSource['kind'], string> = { file: '文件', url: '网页', text: '文本' }

export function ProjectSourceLibrary({
  projectId,
  canManage,
  visibilityScope,
  ownerUserId,
  readOnly = false,
  uploadVisibility = 'PRIVATE',
}: {
  projectId: string
  canManage: boolean
  visibilityScope?: KnowledgeSource['visibilityScope']
  ownerUserId?: string
  readOnly?: boolean
  uploadVisibility?: KnowledgeSource['visibilityScope']
}) {
  const uploadedFiles = useRef(new WeakSet<File>())
  const requests = useRef({ list: 0, detail: 0 })
  useEffect(() => () => { requests.current.list++; requests.current.detail++ }, [])
  const [loaded, setLoaded] = useState(false)
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

  const load = useCallback(async () => {
    const epoch = ++requests.current.list
    setLoading(true)
    setError('')
    try {
      const rows = await knowledgeApi.listProjectSources(projectId)
      if (epoch !== requests.current.list) return
      setSources(rows); setLoaded(true)
    }
    catch (reason) { if (epoch === requests.current.list) setError(userFacingError(reason, '资料库暂时无法加载，请稍后重试。')) }
    finally { if (epoch === requests.current.list) setLoading(false) }
  }, [projectId])

  useEffect(() => {
    setSources([]); setLoaded(false)
    setSelected(null)
    void load()
  }, [load])

  useEffect(() => {
    if (!sources.some((source) => source.status === 'upload_pending' || source.status === 'queued' || source.status === 'processing')) return
    const timer = window.setTimeout(() => void load(), 2_000)
    return () => window.clearTimeout(timer)
  }, [load, sources])

  const uploadFiles = async (files: File[]) => {
    const results = await Promise.allSettled(files.filter(file => !uploadedFiles.current.has(file)).map(async file => {
      await knowledgeApi.uploadProjectSource(projectId, file)
      uploadedFiles.current.add(file)
    }))
    await load()
    const failed = results.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  }
  const addUrl = async (url: string, title?: string) => { await knowledgeApi.addProjectUrlSource(projectId, { url, title }); await load() }
  const addText = async (title: string, text: string) => { await knowledgeApi.addProjectTextSource(projectId, { title, text }); await load() }
  const visibleSources = useMemo(() => sources.filter((source) =>
    (!visibilityScope || source.visibilityScope === visibilityScope)
      && (!ownerUserId || source.ownerUserId === ownerUserId)), [ownerUserId, sources, visibilityScope])
  const editable = (source: KnowledgeSource) => !readOnly && (canManage || source.createdBy === me?.id)

  const open = async (source: KnowledgeSource) => {
    const epoch = ++requests.current.detail
    setSelected(source)
    setDetailLoading(true)
    setDetailError('')
    try {
      const detail = await knowledgeApi.getProjectSource(projectId, source.id)
      if (epoch === requests.current.detail) setSelected(detail)
    }
    catch (reason) { if (epoch === requests.current.detail) setDetailError(userFacingError(reason, '资料预览暂时无法加载。')) }
    finally { if (epoch === requests.current.detail) setDetailLoading(false) }
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

  return <div className="min-w-0">
    <SourceLibraryBrowser sources={visibleSources} loading={loading} loaded={loaded} error={error} readOnly={readOnly}
      creatorName={source => byId[source.createdBy]?.name ?? source.ownerName ?? (source.createdBy === me?.id ? '你' : '课程成员')}
      editable={editable} onUpload={() => setAdding(true)} onOpen={source => void open(source)} onRename={setRenaming}
      onRetry={source => void retry(source)} onRemove={source => void remove(source)} onReload={() => void load()} />
    {!readOnly && <KnowledgeSourceUploadDialog open={adding} onOpenChange={setAdding} onFiles={uploadFiles} onUrl={addUrl} onText={addText} visibilityScope={uploadVisibility} />}
    <RenameSourceDialog source={renaming} onOpenChange={(open) => { if (!open) setRenaming(null) }} onSave={async (source, title) => {
      await toastAction(knowledgeApi.renameProjectSource(projectId, source.id, title), { loading: '正在重命名资料', success: '资料已重命名', error: '重命名资料失败' })
      setRenaming(null)
      if (selected?.id === source.id) setSelected({ ...selected, title })
      await load()
    }} />

    <Dialog open={selected !== null} onOpenChange={(nextOpen) => { if (!nextOpen) { requests.current.detail++; setSelected(null); setDetailError('') } }}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border/60 p-6 pe-14"><DialogTitle>{selected?.title ?? '资料预览'}</DialogTitle><DialogDescription>{selected ? `${kindLabel[selected.kind]} · ${statusLabel[selected.stage] ?? statusLabel[selected.status] ?? '状态暂不可用'} · ${selected.visibilityScope === 'PROJECT' ? '课程成员可见' : '仅自己可见'}` : '资料'}</DialogDescription></DialogHeader>
        <div className="min-h-0 overflow-y-auto p-6">
          {selected && !detailError && <ConversationSourceToggle key={`${projectId}:${selected.id}`} projectId={projectId} sourceId={selected.id} />}
          {detailLoading ? <ResourceSkeleton variant="detail" label="正在加载资料预览" />
            : detailError ? <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">{detailError}<Button size="sm" variant="outline" onClick={() => { if (selected) void open(selected) }}>重试</Button></AlertDescription></Alert>
              : selected ? <><div className="flex flex-wrap gap-2">{selected.originalUrl ? <Button asChild variant="outline" size="sm"><a href={selected.originalUrl} target="_blank" rel="noreferrer">打开原始网页</a></Button> : null}{selected.originalFileUrl ? <Button asChild variant="outline" size="sm"><a href={selected.originalFileUrl} target="_blank" rel="noreferrer">打开原始文件</a></Button> : null}</div><pre className="mt-4 min-h-48 whitespace-pre-wrap rounded-2xl bg-muted p-5 font-sans text-sm leading-6">{selected.extractedText || (selected.error ? userFacingError(selected.error, '资料处理失败，请重试。') : '资料仍在处理中，完成后可预览提取内容。')}</pre>{editable(selected) ? <div className="mt-5 flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setRenaming(selected)}><HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />重命名</Button><Button type="button" variant="destructive" onClick={() => void remove(selected)}><HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />删除来源</Button></div> : null}</> : null}
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
