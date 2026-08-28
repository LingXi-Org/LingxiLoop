import { IconArrowLeft, IconCheck, IconMinus, IconPlus } from '@tabler/icons-react'
import { type ChangeEvent, type DragEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { IFile, IPlus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useApp } from '@/stores/app'
import { useKnowledgeSources } from '@/features/knowledge/state'
import { useParticipants } from '@/features/agents/state'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import type { KnowledgeSource } from '@/features/knowledge/contracts'

const ACCEPT = '.pdf,.docx,.txt,.md,.csv,.json'
const statusLabel: Record<string, string> = {
  upload_pending: '等待上传', queued: '排队', processing: '处理中', parsing: '解析',
  chunking: '分块', indexing: '索引', ready: '就绪', failed: '失败',
}

function SourceRow({ source, conversationId, flat = false }: { source: KnowledgeSource; conversationId: string | null; flat?: boolean }) {
  const open = useKnowledgeSources((state) => state.open)
  const retry = useKnowledgeSources((state) => state.retry)
  const selection = useKnowledgeSources((state) => state.conversationSelection)
  const setSourceEnabled = useKnowledgeSources((state) => state.setSourceEnabled)
  const selected = selection?.sources.find((item) => item.sourceId === source.id)
  const creator = useParticipants((state) => state.byId[source.createdBy]?.name ?? source.createdBy)
  if (flat) return <article className="group flex items-center gap-2 rounded-xl px-2.5 py-2 transition-colors hover:bg-muted/70">
    <button type="button" onClick={() => void open(source.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
      <IFile className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-foreground">{source.title}</span><span className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-muted-foreground"><span className={`size-1.5 shrink-0 rounded-full ${source.status === 'ready' ? 'bg-emerald-500' : source.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`} />{statusLabel[source.stage] ?? statusLabel[source.status] ?? source.stage}{source.chunkCount ? ` · ${source.chunkCount} 片段` : ''} · {creator}</span></span>
    </button>
    {conversationId && source.status === 'ready' && selected ? <Button type="button" variant="ghost" size="icon-xs" aria-label={`${source.title} 在本对话中${selected.enabled ? '停用' : '启用'}`} aria-pressed={selected.enabled} title={selected.enabled ? '回答将使用此资料' : '此资料已停用'} onClick={() => void setSourceEnabled(conversationId, source.id, !selected.enabled)} className={selected.enabled ? 'text-emerald-600' : 'text-muted-foreground'}>{selected.enabled ? <IconCheck /> : <IconMinus />}</Button> : null}
    {source.status === 'failed' && <Button type="button" onClick={() => void retry(source.id)} variant="ghost" size="xs">重试</Button>}
  </article>

  return <article className="rounded-xl border border-hairline bg-panel p-3 shadow-sm">
    <button type="button" onClick={() => void open(source.id)} className="flex w-full items-start gap-2.5 text-left">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-raised text-accent"><IFile className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-ink">{source.title}</span><span className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-secondary"><span className={`size-1.5 rounded-full ${source.status === 'ready' ? 'bg-emerald-500' : source.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`} />{statusLabel[source.stage] ?? statusLabel[source.status] ?? source.stage}{source.chunkCount ? ` · ${source.chunkCount} 片段` : ''}</span></span>
    </button>
    <p className="mt-2 truncate text-[9px] text-ink-secondary">{source.kind.toUpperCase()} · {Math.max(1, Math.round(source.sizeBytes / 1024))} KB · {creator}</p>
    <div className="mt-2 flex items-center justify-between">
      {conversationId && source.status === 'ready' && selected ? <label className="flex items-center gap-1.5 text-[10px] text-ink-secondary"><input type="checkbox" checked={selected.enabled} onChange={(event) => void setSourceEnabled(conversationId, source.id, event.target.checked)} />本对话使用</label> : <span />}
      {source.status === 'failed' && <button type="button" onClick={() => void retry(source.id)} className="text-[10px] font-semibold text-accent">重试</button>}
    </div>
  </article>
}

export function SourcePanel({ mobile = false, flat = false, toolbar }: { mobile?: boolean; flat?: boolean; toolbar?: ReactNode }) {
  const sources = useKnowledgeSources((state) => state.list)
  const loading = useKnowledgeSources((state) => state.loading)
  const load = useKnowledgeSources((state) => state.load)
  const addText = useKnowledgeSources((state) => state.addText)
  const addUrl = useKnowledgeSources((state) => state.addUrl)
  const addFiles = useKnowledgeSources((state) => state.addFiles)
  const loadConversationSelection = useKnowledgeSources((state) => state.loadConversationSelection)
  const conversationId = useApp((state) => state.selectedConversationId)
  const setView = useApp((state) => state.setView)
  const [adding, setAdding] = useState(false)
  const [mode, setMode] = useState<'file' | 'url' | 'text'>('file')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (conversationId) void load() }, [conversationId, load])
  useEffect(() => {
    if (conversationId) void loadConversationSelection(conversationId)
  }, [conversationId, loadConversationSelection, sources.length])
  const filesChosen = async (files: File[]) => {
    const allowed = files.filter((file) => file.size <= 25 * 1024 * 1024)
    if (allowed.length) await addFiles(allowed)
    setAdding(false); setDragging(false)
  }
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => void filesChosen([...event.target.files ?? []])
  const onDrop = (event: DragEvent) => { event.preventDefault(); void filesChosen([...event.dataTransfer.files]) }
  const submit = async () => {
    if (mode === 'url' && url.trim()) await addUrl(url.trim(), title.trim() || undefined)
    if (mode === 'text' && text.trim()) await addText(title.trim() || '粘贴文本', text.trim())
    setAdding(false); setUrl(''); setTitle(''); setText('')
  }

  return <section className={`knowledge-source-panel flex h-full min-h-0 flex-col ${flat ? 'bg-transparent' : 'bg-app'} ${mobile ? 'w-full' : ''}`} data-source-layout={flat ? 'flat' : 'standard'}>
    {flat ? <div className="flex h-10 shrink-0 items-center justify-between px-3">
      {toolbar}
      <Button type="button" onClick={() => setAdding(true)} variant="ghost" size="sm" aria-label="添加资料"><IPlus />添加</Button>
    </div> : <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-hairline px-3.5"><div><h2 className="text-sm font-semibold text-ink">知识库</h2><p className="text-[10px] text-ink-secondary">此群共享 · 回答优先使用</p></div><button type="button" onClick={() => setAdding(true)} className="grid size-8 place-items-center rounded-lg bg-accent text-white" aria-label="添加资料"><IPlus className="size-4" /></button></header>}
    <div className={`min-h-0 flex-1 overflow-y-auto ${flat ? 'space-y-0.5 px-3 pb-3 pt-1' : 'space-y-2 p-3'}`}>
      {loading && sources.length === 0 ? <ResourceSkeleton variant={flat ? 'list' : 'cards'} count={flat ? 5 : 3} compact={flat} label="正在加载知识资料" /> : sources.length === 0 ? <div className={flat ? 'grid min-h-full place-items-center px-8 pb-12 text-center' : 'rounded-2xl border border-dashed border-hairline p-5 text-center'}><div><IFile className={flat ? 'mx-auto size-8 text-muted-foreground' : 'mx-auto size-5 text-accent'} /><p className={`${flat ? 'mt-4 text-sm font-medium text-foreground' : 'mt-3 text-xs font-semibold'}`}>这个群还没有资料</p><p className={`${flat ? 'mt-1 text-xs leading-5 text-muted-foreground' : 'mt-1 text-[10px] leading-4 text-ink-secondary'}`}>上传文件、网页或文本，让回答建立在群聊资料之上。</p><div className="mt-4 flex flex-wrap justify-center gap-2"><Button onClick={() => setAdding(true)} className="context-empty-action" size="sm"><IconPlus />添加资料</Button><Button onClick={() => { setView('conversations'); window.dispatchEvent(new Event('lingxiloop:focus-composer')) }} className="context-empty-action" variant="secondary" size="sm"><IconArrowLeft />继续对话</Button></div></div></div> : sources.map((source) => <SourceRow key={source.id} source={source} conversationId={conversationId} flat={flat} />)}
    </div>

    {adding && <div className="fixed inset-0 z-[110] grid place-items-center bg-black/35 p-4 backdrop-blur-sm" onMouseDown={() => setAdding(false)}><div className="w-full max-w-xl rounded-2xl border border-hairline bg-panel p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">添加资料</h2><p className="text-[11px] text-ink-secondary">PDF、DOCX、TXT、MD、CSV、JSON，单文件不超过 25 MB</p></div><button onClick={() => setAdding(false)} className="size-8 rounded-lg hover:bg-raised">×</button></div>
      <div className="mt-4 flex gap-1 rounded-xl bg-raised p-1">{(['file','url','text'] as const).map((item) => <button key={item} onClick={() => setMode(item)} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${mode === item ? 'bg-panel text-accent shadow-sm' : 'text-ink-secondary'}`}>{item === 'file' ? '文件' : item === 'url' ? '网页 URL' : '粘贴文本'}</button>)}</div>
      {mode === 'file' ? <div onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={`mt-4 grid min-h-44 place-items-center rounded-2xl border-2 border-dashed p-6 text-center ${dragging ? 'border-accent bg-accent/5' : 'border-hairline'}`}><div><IFile className="mx-auto size-8 text-accent" /><p className="mt-3 text-sm font-semibold">拖放多个文件到这里</p><button onClick={() => fileRef.current?.click()} className="mt-2 text-xs font-semibold text-accent">或浏览文件</button><Input ref={fileRef} hidden multiple accept={ACCEPT} type="file" onChange={onFileChange} /></div></div>
        : <div className="mt-4 space-y-3"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="标题（可选）" className="h-10 w-full rounded-xl border border-hairline bg-app px-3 text-sm outline-none focus:border-accent" />{mode === 'url' ? <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" className="h-11 w-full rounded-xl border border-hairline bg-app px-3 text-sm outline-none focus:border-accent" /> : <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="粘贴需要作为依据的内容…" className="h-44 w-full resize-none rounded-xl border border-hairline bg-app p-3 text-sm outline-none focus:border-accent" />}<div className="flex justify-end"><button onClick={() => void submit()} className="h-10 rounded-xl bg-accent px-5 text-sm font-semibold text-white">添加并处理</button></div></div>}
    </div></div>}

  </section>
}

/** Mounted at the application shell so citations and sources always open in
 * the shared page-level Drawer instead of creating another sidebar. */
export function SourceDetailOverlay() {
  const selectedSource = useKnowledgeSources((state) => state.selectedSource)
  const selectedCitation = useKnowledgeSources((state) => state.selectedCitation)
  const close = useKnowledgeSources((state) => state.close)
  const remove = useKnowledgeSources((state) => state.remove)
  const removeSelectedSource = async () => {
    if (!selectedSource) return
    if (!await confirmSensitiveAction({
      title: '删除知识来源？',
      description: `“${selectedSource.title}”及其索引内容将被永久删除，历史消息中的引用摘要仍会保留。`,
      confirmLabel: '删除来源',
      tone: 'destructive',
    })) return
    try {
      await toastAction(remove(selectedSource.id), { loading: '正在删除知识来源', success: '知识来源已删除', error: '删除知识来源失败' })
    } catch { /* toast owns the visible error state */ }
  }
  const open = Boolean(selectedSource || selectedCitation)
  return <Drawer open={open} onOpenChange={(nextOpen) => { if (!nextOpen) close() }} direction="right">
    <DrawerContent className="w-[min(92vw,48rem)] sm:[--drawer-content-width:min(92vw,48rem)]">
      <DrawerHeader className="border-b border-hairline p-6">
        <div className="flex items-start justify-between gap-4"><div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">{selectedSource ? statusLabel[selectedSource.status] : '历史引用'}</div>
          <DrawerTitle className="mt-1 text-xl">{selectedSource?.title ?? selectedCitation?.sourceTitle ?? '资料'}</DrawerTitle>
          <DrawerDescription>资料详情与引用依据</DrawerDescription>
        </div><DrawerClose asChild><button type="button" className="size-9 rounded-xl hover:bg-raised" aria-label="关闭资料">×</button></DrawerClose></div>
      </DrawerHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
      {selectedSource && <><div className="mt-5 flex flex-wrap gap-2 text-[10px] text-ink-secondary"><span className="rounded-full bg-raised px-2.5 py-1">{selectedSource.kind}</span><span className="rounded-full bg-raised px-2.5 py-1">{Math.max(1, Math.round(selectedSource.sizeBytes / 1024))} KB</span>{selectedSource.isTruncated && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">已截断</span>}</div>{selectedSource.originalUrl && <a href={selectedSource.originalUrl} target="_blank" rel="noreferrer" className="mt-4 block truncate text-xs text-accent underline">打开原始网页</a>}{selectedSource.originalFileUrl && <a href={selectedSource.originalFileUrl} target="_blank" rel="noreferrer" className="mt-4 block truncate text-xs text-accent underline">打开原始文件</a>}</>}
      {selectedCitation && <section className="mt-5 rounded-2xl border border-accent/25 bg-accent/5 p-4"><div className="text-[10px] font-bold text-accent">[{selectedCitation.marker}] 命中片段 · 位置 {selectedCitation.position + 1}</div><p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-ink">{selectedCitation.excerpt}</p></section>}
      {selectedSource ? <><pre className="mt-5 whitespace-pre-wrap rounded-2xl bg-app p-4 font-sans text-xs leading-6 text-ink">{selectedSource.extractedText || selectedSource.error || '资料仍在处理中，完成后可查看抽取文本。'}</pre><button onClick={() => void removeSelectedSource()} className="mt-5 text-xs font-semibold text-red-600">删除来源</button></> : <p className="mt-5 text-xs leading-6 text-ink-secondary">原来源已不可用；以上引用摘要随历史消息保留。</p>}
      </div>
    </DrawerContent>
  </Drawer>
}
