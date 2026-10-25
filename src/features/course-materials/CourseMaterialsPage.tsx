import { useQuery } from '@tanstack/react-query'
import { Download, Files, LoaderCircle, RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { knowledgeApi } from '../knowledge/api'
import type { KnowledgeSource } from '../knowledge/contracts'
import { useAuth } from '@/stores/auth'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { FileListView } from './file-list-view'
import { FileManagerToolbar } from './file-manager-toolbar'
import { filterAndSortFiles, type MaterialContext, type MaterialFormat, type MaterialSort, type MaterialSpace, materialQueryKey, sizeLabel } from './data'
import { materialsQueryClient } from './queries'
import { useMaterialUploads } from './uploads'
import { MaterialPreview } from './MaterialPreview'

export interface CourseMaterialsPageProps { projectId: string; projectName?: string; readOnly?: boolean }

export function CourseMaterialsPage(props: CourseMaterialsPageProps) {
  const userId = useAuth(state => state.user?.id)
  const companyId = useAuth(state => state.activeCompanyId)
  const authorizationEpoch = useAuth(state => state.authorizationEpoch)
  if (!userId || !companyId) return null
  return <CourseMaterialsSpaces key={`${companyId}:${userId}:${authorizationEpoch}:${props.projectId}`} {...props} userId={userId} companyId={companyId} />
}

function CourseMaterialsSpaces({ projectId, projectName, readOnly = false, userId, companyId }: CourseMaterialsPageProps & { userId: string; companyId: string }) {
  const [space, setSpace] = useState<MaterialSpace>('public')
  return <main data-course-materials className="h-full min-h-0 overflow-y-auto bg-background">
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <header><h1 className="text-2xl font-semibold tracking-tight">课程资料</h1>{projectName && <p className="mt-2 text-sm text-muted-foreground">{projectName}</p>}</header>
      <Tabs value={space} onValueChange={value => setSpace(value as MaterialSpace)} className="gap-6">
        <div className="border-b"><TabsList variant="line" aria-label="课程资料空间" className="h-12 gap-5 p-0">
          <TabsTrigger value="public" className="h-12 rounded-none px-1">公共资料</TabsTrigger>
          <TabsTrigger value="private" className="h-12 rounded-none px-1">我的资料</TabsTrigger>
        </TabsList></div>
        <TabsContent value={space} className="min-w-0">
          <MaterialsSpace key={space} context={{ projectId, companyId, userId, space }} readOnly={readOnly} />
        </TabsContent>
      </Tabs>
    </div>
  </main>
}

function MaterialsSpace({ context, readOnly }: { context: MaterialContext; readOnly: boolean }) {
  const { projectId, space } = context
  const [search, setSearch] = useState('')
  const [format, setFormat] = useState<MaterialFormat>('all')
  const [sort, setSort] = useState<MaterialSort>('modified-desc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [opened, setOpened] = useState<KnowledgeSource | null>(null)
  const [renaming, setRenaming] = useState<KnowledgeSource | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const queryKey = materialQueryKey(context)
  const query = useQuery({ queryKey,
    queryFn: ({ signal }) => knowledgeApi.listProjectMaterials(projectId, space, signal),
    refetchInterval: request => request.state.data?.sources.some(source => ['upload_pending', 'queued', 'processing'].includes(source.status)) ? 2000 : false,
  }, materialsQueryClient)
  const sources = query.data?.sources ?? []
  const visible = useMemo(() => filterAndSortFiles(sources, search, format, sort), [sources, search, format, sort])
  const canUpload = !readOnly && query.data?.capabilities.canUpload === true
  const uploadLabel = space === 'public' ? '上传到公共资料' : '上传到我的资料'
  const selectedSources = sources.filter(source => selected.has(source.id))
  const uploads = useMaterialUploads(state => state.items)
  const scopedUploads = uploads.filter(item => JSON.stringify(materialQueryKey(item.context)) === JSON.stringify(queryKey))
  const refresh = () => materialsQueryClient.invalidateQueries({ queryKey })
  const isCurrent = () => active.current && useAuth.getState().user?.id === context.userId && useAuth.getState().activeCompanyId === context.companyId
  const setBusy = (ids: string[], busy: boolean) => {
    if (!isCurrent()) return
    setBusyIds(previous => { const next = new Set(previous); for (const id of ids) { if (busy) next.add(id); else next.delete(id) } return next })
  }
  const run = async (rows: KnowledgeSource[], task: () => Promise<void>) => {
    const ids = rows.map(source => source.id)
    if (!isCurrent() || ids.some(id => busyIds.has(id))) return
    setError(''); setBusy(ids, true)
    try { await task() }
    catch (reason) { if (isCurrent()) setError(userFacingError(reason, '操作未完成，请重试。')) }
    finally { setBusy(ids, false) }
  }
  const download = async (source: KnowledgeSource) => {
    if (!isCurrent() || !source.capabilities?.canDownload) return
    const detail = await knowledgeApi.getProjectSource(projectId, source.id)
    if (!isCurrent()) return
    if (!detail.originalFileUrl) throw new Error('原文件暂时无法下载')
    const response = await fetch(detail.originalFileUrl, { credentials: 'include' })
    if (!response.ok) throw new Error(`文件下载失败 (${response.status})`)
    const blob = await response.blob()
    if (!isCurrent()) return
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = source.title; document.body.append(anchor); anchor.click(); anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const remove = async (rows: KnowledgeSource[]) => {
    const permitted = rows.filter(source => !readOnly && source.capabilities?.canDelete)
    if (!permitted.length || !await confirmSensitiveAction({ title: '删除资料？',
      description: permitted.length === 1 ? `“${permitted[0].title}”及其搜索内容将被永久删除。` : `选中的 ${permitted.length} 份资料及其搜索内容将被永久删除。`,
      confirmLabel: '删除资料', tone: 'destructive',
    }) || !isCurrent()) return
    await run(permitted, async () => {
      const failures: unknown[] = []
      for (const source of permitted) {
        if (!isCurrent()) break
        try {
          await knowledgeApi.deleteProjectSource(projectId, source.id)
          if (isCurrent()) { setSelected(previous => { const next = new Set(previous); next.delete(source.id); return next }); setOpened(previous => previous?.id === source.id ? null : previous) }
        } catch (reason) { failures.push(reason) }
      }
      await refresh()
      if (failures.length) throw failures[0]
    })
  }
  const onDownload = (source: KnowledgeSource) => void run([source], () => download(source))
  const resetFilters = () => { setSearch(''); setFormat('all'); setSelected(new Set()) }
  return <section aria-label={space === 'public' ? '公共资料' : '我的资料'} className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><p>{space === 'public' ? '教师上传 · 课程成员可见' : '仅自己可见'}</p>
      <Button variant="ghost" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()} aria-label="刷新课程资料"><RefreshCw className={query.isFetching ? 'animate-spin motion-reduce:animate-none' : ''} />刷新</Button>
    </div>
    <FileManagerToolbar search={search} format={format} sort={sort} uploadLabel={uploadLabel} onUpload={canUpload ? () => fileInput.current?.click() : undefined}
      onSearch={value => { setSearch(value); setSelected(new Set()) }} onFormat={value => { setFormat(value); setSelected(new Set()) }} onSort={setSort} />
    {canUpload && <input ref={fileInput} type="file" multiple className="hidden" aria-label="上传课程资料文件" accept=".pdf,.docx,.pptx,.xlsx,.md,.txt,.csv,.json,.jpg,.jpeg,.png,.zip" onChange={event => {
      const files = Array.from(event.target.files ?? [])
      if (files.length) useMaterialUploads.getState().add(files, { ...context })
      event.target.value = ''
    }} />}
    {scopedUploads.length > 0 && <ul aria-label="文件上传进度" className="space-y-2 rounded-xl border p-4">{scopedUploads.map(item => <li key={item.id} className="flex flex-wrap items-center gap-3 text-sm">
      <span className="min-w-0 flex-1 basis-48 truncate" title={item.file.name}>{item.file.name} <span className="text-xs text-muted-foreground">{sizeLabel(item.file.size)}</span></span>
      {item.status === 'uploading' ? <><progress aria-label={`${item.file.name} 上传进度`} className="h-2 w-28 accent-primary" value={item.progress} max={100} /><span role="status" className="text-xs tabular-nums text-muted-foreground">{item.progress === 100 ? '正在保存…' : `上传中 ${item.progress}%`}</span></>
        : item.status === 'failed' ? <><span role="alert" className="text-destructive">{item.error}</span>{canUpload && <Button size="sm" variant="outline" onClick={() => useMaterialUploads.getState().retry(item.id)}>重试上传</Button>}</>
          : <span role="status" className="text-primary">已保存</span>}
      {item.status !== 'uploading' && <Button size="icon-sm" variant="ghost" aria-label={`关闭上传记录：${item.file.name}`} onClick={() => useMaterialUploads.getState().dismiss(item.id)}><X /></Button>}
    </li>)}</ul>}
    {(query.isError || error) && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center justify-between gap-3">{error || userFacingError(query.error, '课程资料暂时无法加载，请重试。')}
      <Button variant="outline" size="sm" onClick={() => { setError(''); void query.refetch() }}>重新加载</Button>
    </AlertDescription></Alert>}
    {selectedSources.length > 0 && <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 px-4 py-2 text-sm">
      <span>已选择 {selectedSources.length} 份</span>
      {selectedSources.every(source => source.capabilities?.canDownload) && <Button size="sm" variant="outline" disabled={busyIds.size > 0} onClick={() => void run(selectedSources, async () => { for (const source of selectedSources) await download(source) })}><Download />下载选中资料</Button>}
      {!readOnly && selectedSources.every(source => source.capabilities?.canDelete) && <Button size="sm" variant="destructive" disabled={busyIds.size > 0} onClick={() => void remove(selectedSources)}><Trash2 />删除选中资料</Button>}
      <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>取消选择</Button>
    </div>}
    <div aria-busy={query.isFetching} className="overflow-hidden rounded-xl border">
      {query.isPending ? <div className="p-5"><ResourceSkeleton variant="list" label="正在加载课程资料" /></div>
        : visible.length ? <FileListView files={visible} publicSpace={space === 'public'} selected={selected} busyIds={busyIds} sort={sort} readOnly={readOnly} onSort={setSort}
          onSelect={(id, checked) => setSelected(previous => { const next = new Set(previous); if (checked) next.add(id); else next.delete(id); return next })}
          onSelectAll={checked => setSelected(checked ? new Set(visible.map(source => source.id)) : new Set())}
          onOpen={setOpened} onRename={setRenaming} onDownload={onDownload} onDelete={source => void remove([source])}
          onRetry={source => void run([source], async () => { await knowledgeApi.retryProjectSource(projectId, source.id); await refresh() })} />
          : !query.isError && <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center"><Files className="size-10 text-muted-foreground/60" />
            <h2 className="font-medium">{search || format !== 'all' ? '没有找到匹配的资料' : space === 'public' ? '暂无公共资料' : '还没有上传资料'}</h2>
            <p className="max-w-sm text-sm text-muted-foreground">{search || format !== 'all' ? '试试其他名称或文件格式。' : space === 'public' ? '教师上传后，课程成员可在这里查看。' : canUpload ? '上传课程文件，随时查看和下载。' : '这里显示你在本课程中保存的个人资料。'}</p>
            {search || format !== 'all' ? <Button variant="outline" onClick={resetFilters}>清除筛选</Button> : canUpload && <Button onClick={() => fileInput.current?.click()}>{uploadLabel}</Button>}
          </div>}
    </div>
    {!query.isPending && !query.isError && <p role="status" className="text-xs tabular-nums text-muted-foreground">共 {sources.length} 份资料{visible.length !== sources.length ? `，筛选后 ${visible.length} 份` : ''}</p>}
    {opened && <MaterialPreview key={opened.id} source={opened} context={context} onClose={() => setOpened(null)} onDownload={onDownload} downloadBusy={busyIds.has(opened.id)} />}
    {renaming && <RenameMaterial key={renaming.id} source={renaming} onClose={() => setRenaming(null)} onSave={async title => {
      if (!isCurrent() || readOnly || !renaming.capabilities?.canRename) return
      await knowledgeApi.renameProjectSource(projectId, renaming.id, title)
      if (isCurrent()) { setRenaming(null); setOpened(previous => previous?.id === renaming.id ? { ...previous, title } : previous) }
      await refresh()
    }} />}
  </section>
}

function RenameMaterial({ source, onClose, onSave }: { source: KnowledgeSource; onClose(): void; onSave(title: string): Promise<void> }) {
  const [title, setTitle] = useState(source.title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent><form className="space-y-5" onSubmit={event => {
    event.preventDefault()
    if (busy || !title.trim()) return
    setBusy(true); setError('')
    void onSave(title.trim()).catch(reason => setError(userFacingError(reason, '重命名失败，请重试。'))).finally(() => setBusy(false))
  }}>
    <DialogHeader><DialogTitle>重命名资料</DialogTitle><DialogDescription>修改资料名称，原文件内容保持完整。</DialogDescription></DialogHeader>
    <div className="space-y-2"><Label htmlFor="material-name">名称</Label><Input id="material-name" autoFocus value={title} maxLength={200} onChange={event => setTitle(event.target.value)} /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={busy || !title.trim()}>{busy && <LoaderCircle className="animate-spin motion-reduce:animate-none" />}{busy ? '保存中' : '保存'}</Button></DialogFooter>
  </form></DialogContent></Dialog>
}
