import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpRight, Check, FileText, Files, FolderOpen, Globe, LayoutGrid, List, LoaderCircle, LockKeyhole, MoreHorizontal, Search, StickyNote, UploadCloud, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { KnowledgeSource } from '../contracts'
import { SourceCardsSkeleton } from './SourceSkeletons'

export const sourceStatusLabel: Record<string, string> = {
  upload_pending: '等待上传', queued: '等待处理', processing: '处理中', parsing: '处理中',
  chunking: '处理中', indexing: '处理中', ready: '可查看', failed: '处理失败', retrying: '重新处理',
}
const categories = [
  { kind: 'file', label: '文件', description: '课件、文档与数据', icon: FileText, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  { kind: 'url', label: '网页', description: '收藏的阅读链接', icon: Globe, color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  { kind: 'text', label: '文本', description: '笔记与摘录', icon: StickyNote, color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
] as const
const sizeLabel = (bytes: number) => bytes === 0 ? '—' : bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
const dateLabel = (date: string) => new Date(date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })

export function SourceLibraryBrowser({ sources, loading, loaded, error, readOnly, uploadVisibility, creatorName, editable, onUpload, onOpen, onRename, onRetry, onRemove, onReload }: {
  sources: KnowledgeSource[]; loading: boolean; loaded: boolean; error: string; readOnly: boolean
  uploadVisibility: 'PRIVATE' | 'PROJECT'
  creatorName(source: KnowledgeSource): string
  editable(source: KnowledgeSource): boolean
  onUpload(): void; onOpen(source: KnowledgeSource): void; onRename(source: KnowledgeSource): void
  onRetry(source: KnowledgeSource): void; onRemove(source: KnowledgeSource): void; onReload(): void
}) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [scope, setScope] = useState('all')
  const [sort, setSort] = useState('newest')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const filtered = useMemo(() => sources.filter(source => (kind === 'all' || source.kind === kind)
    && (scope === 'all' || source.visibilityScope === scope)
    && `${source.title} ${source.ownerName ?? ''} ${source.originalUrl ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title, 'zh-CN') : sort === 'oldest' ? Date.parse(a.createdAt) - Date.parse(b.createdAt) : Date.parse(b.createdAt) - Date.parse(a.createdAt)), [sources, kind, scope, query, sort])
  const hasFilters = Boolean(query || kind !== 'all' || scope !== 'all')
  const clear = () => { setQuery(''); setKind('all'); setScope('all') }

  return <section aria-label="课程资料库" className="@container/library min-w-0 space-y-6 pb-4">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><FolderOpen className="size-4" aria-hidden="true" />学习论坛 / 资料</p><h2 className="text-2xl font-semibold tracking-tight">课程资料库</h2><p className="mt-2 text-sm text-muted-foreground">让课件、阅读与灵感，都有一个好找的位置。</p></div>
      {!readOnly && <Button onClick={onUpload} className="h-10 gap-2 px-4"><UploadCloud className="size-4" />上传资料</Button>}
    </header>
    <div className="grid grid-cols-3 gap-2 @min-[32rem]/library:gap-3" aria-label="按资料类型浏览">
      {categories.map(({ kind: value, label, description, icon: Icon, color }) => <button key={value} type="button" aria-label={label} aria-pressed={kind === value} onClick={() => setKind(kind === value ? 'all' : value)} className={cn('flex min-w-0 flex-col items-start gap-2 rounded-xl border bg-card p-3 @min-[32rem]/library:flex-row @min-[32rem]/library:items-center @min-[32rem]/library:gap-3 @min-[32rem]/library:p-4 text-start transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', kind === value && 'border-primary bg-primary/5')}>
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', color)}><Icon className="size-5" aria-hidden="true" /></span>
        <span className="w-full min-w-0 flex-1"><span className="flex items-baseline justify-between gap-2 text-sm font-medium">{label}<span className="text-lg font-semibold tabular-nums">{loaded ? sources.filter(source => source.kind === value).length : '—'}</span></span><span className="mt-1 hidden text-xs text-muted-foreground @min-[32rem]/library:block">{description}</span></span>
      </button>)}
    </div>
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2"><Button variant={kind === 'all' ? 'secondary' : 'ghost'} size="sm" onClick={() => setKind('all')}>全部资料</Button><span className="text-xs tabular-nums text-muted-foreground" role="status">{loaded ? `${filtered.length} 项` : '加载中'}</span></div>
        <div className="flex items-center gap-1" role="group" aria-label="资料显示方式"><Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon-sm" aria-label="列表视图" aria-pressed={view === 'list'} onClick={() => setView('list')}><List /></Button><Button variant={view === 'grid' ? 'secondary' : 'ghost'} size="icon-sm" aria-label="网格视图" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid /></Button></div>
      </div>
      <div className="flex flex-wrap gap-2 p-4">
        <div className="relative min-w-0 flex-1 basis-48"><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label="搜索资料" type="search" placeholder="搜索资料名称、链接…" className="bg-background" style={{ paddingInlineStart: '2.25rem' }} value={query} onChange={event => setQuery(event.target.value)} /></div>
        <SelectField ariaLabel="资料可见范围" className="w-32" value={scope} onValueChange={setScope} options={[{ value: 'all', label: '全部范围' }, { value: 'PROJECT', label: '课程共享' }, { value: 'PRIVATE', label: '仅自己可见' }]} />
        <SelectField ariaLabel="资料排序" className="w-32" value={sort} onValueChange={setSort} options={[{ value: 'newest', label: '最近添加' }, { value: 'oldest', label: '最早添加' }, { value: 'name', label: '名称 A–Z' }]} />
      </div>
      {error && <div role="alert" className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}<Button variant="outline" size="sm" disabled={loading} onClick={onReload}>重新加载</Button></div>}
      <div aria-busy={loading}>
        {loading && !loaded ? <div className="px-4 pb-4"><SourceCardsSkeleton /></div> : !error && filtered.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center px-5 py-10 text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><Files className="size-7" /></div><h3 className="font-medium">{hasFilters ? '没有找到匹配的资料' : '把第一份资料放进来'}</h3><p className="mt-2 max-w-sm text-sm text-muted-foreground">{hasFilters ? '试试其他关键词，或清除筛选查看全部资料。' : readOnly ? '课程资料将在这里集中展示。' : '上传课件、添加阅读链接，或保存一段值得留住的文字。'}</p>
          {hasFilters ? <Button variant="outline" className="mt-5" onClick={clear}><X />清除筛选</Button> : !readOnly && <Button variant="outline" className="mt-5" onClick={onUpload}>添加第一份资料<ArrowUpRight /></Button>}
        </div> : <>
          {view === 'list' && filtered.length > 0 && <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_6rem_6rem_2rem] gap-3 border-y bg-muted/30 px-5 py-2 text-xs text-muted-foreground @min-[36rem]/library:grid"><span>资料名称</span><span>可见范围</span><span>添加时间</span><span /></div>}
          <ul aria-label="资料列表" className={view === 'grid' ? 'grid gap-3 p-4 @min-[32rem]/library:grid-cols-2 @min-[56rem]/library:grid-cols-3' : 'divide-y'}>
            {filtered.map(source => {
              const category = categories.find(item => item.kind === source.kind)!
              const Icon = category.icon
              const busy = ['upload_pending', 'queued', 'processing'].includes(source.status)
              return <li key={source.id} className={cn('group min-w-0', view === 'grid' ? 'relative rounded-xl border p-4 transition-colors hover:bg-muted/20' : 'grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 @min-[36rem]/library:grid-cols-[minmax(0,1fr)_6rem_6rem_2rem] @min-[36rem]/library:px-5')}>
                <button type="button" aria-label={`打开资料：${source.title}`} onClick={() => onOpen(source)} className={cn('min-w-0 rounded-md text-start focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring', view === 'grid' ? 'block w-full' : 'flex items-center gap-3')}>
                  <span className={cn('grid shrink-0 place-items-center rounded-lg', category.color, view === 'grid' ? 'mb-5 size-12' : 'size-10')}><Icon className="size-5" aria-hidden="true" /></span>
                  <span className="block min-w-0"><span className="block truncate text-sm font-medium" title={source.title}>{source.title}</span><span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><span className="truncate">{category.label} · {sizeLabel(source.sizeBytes)} · {creatorName(source)}</span></span>
                    <span className={cn('mt-1.5 inline-flex items-center gap-1 text-[11px]', source.status === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>{busy ? <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" /> : source.status === 'ready' ? <Check className="size-3 text-emerald-600 dark:text-emerald-400" /> : null}{sourceStatusLabel[source.stage] ?? sourceStatusLabel[source.status] ?? '状态暂不可用'}</span>
                  </span>
                </button>
                <span className={cn('items-center gap-1 text-xs text-muted-foreground', view === 'grid' ? 'mt-4 inline-flex' : 'hidden @min-[36rem]/library:flex')}>{source.visibilityScope === 'PROJECT' ? <Users className="size-3.5" /> : <LockKeyhole className="size-3.5" />}{source.visibilityScope === 'PROJECT' ? '课程共享' : '仅自己'}</span>
                <time dateTime={source.createdAt} className={cn('text-xs text-muted-foreground', view === 'grid' ? 'mt-4 float-end' : 'hidden @min-[36rem]/library:block')}>{dateLabel(source.createdAt)}</time>
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className={view === 'grid' ? 'absolute end-3 top-3' : ''} aria-label={`资料操作：${source.title}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onOpen(source)}><ArrowUpRight />查看资料</DropdownMenuItem>
                  {source.originalUrl && <DropdownMenuItem asChild><a href={source.originalUrl} target="_blank" rel="noreferrer"><Globe />打开原始网页</a></DropdownMenuItem>}
                  {source.kind === 'file' && <DropdownMenuItem onSelect={() => onOpen(source)}><ArrowDownToLine />查看原始文件</DropdownMenuItem>}
                  {editable(source) && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onRename(source)}>重命名</DropdownMenuItem>{source.status === 'failed' && <DropdownMenuItem onSelect={() => onRetry(source)}>重新处理</DropdownMenuItem>}<DropdownMenuItem variant="destructive" onSelect={() => onRemove(source)}>删除资料</DropdownMenuItem></>}
                </DropdownMenuContent></DropdownMenu>
              </li>
            })}
          </ul>
        </>}
      </div>
    </div>
    {!readOnly && <button type="button" onClick={onUpload} className="flex w-full items-center gap-4 rounded-xl border border-dashed bg-muted/15 p-4 text-start transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground"><UploadCloud className="size-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">为学习积累更多资料</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">支持文件、网页与文本 · {uploadVisibility === 'PROJECT' ? '上传后课程成员可见' : '上传后仅自己可见'}</span></span><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" /></button>}
  </section>
}
