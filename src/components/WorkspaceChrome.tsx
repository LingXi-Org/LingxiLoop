import { File01Icon, Loading03Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { IconArrowLeft, IconCheck, IconMinus } from '@tabler/icons-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from '@/components/ui/attachment'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import { knowledgeApi } from '@/features/knowledge/api'
import { KnowledgeSourceUploadDialog } from '@/features/knowledge/components/KnowledgeSourceUploadDialog'
import type { KnowledgeSource } from '@/features/knowledge/contracts'
import { useKnowledgeSources } from '@/features/knowledge/state'
import { useIsMobile } from '@/hooks/use-mobile'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { useApp } from '@/stores/app'

const statusLabel: Record<string, string> = {
  upload_pending: '等待上传', queued: '排队', processing: '处理中', parsing: '解析',
  chunking: '分块', indexing: '索引', ready: '就绪', failed: '失败',
}
const sourceKindLabel: Record<KnowledgeSource['kind'], string> = {
  file: '文件', url: '网页', text: '文本',
}

function SourceRow({ source, conversationId, flat = false }: { source: KnowledgeSource; conversationId: string | null; flat?: boolean }) {
  const open = useKnowledgeSources((state) => state.open)
  const retry = useKnowledgeSources((state) => state.retry)
  const selection = useKnowledgeSources((state) => state.conversationSelection)
  const setSourceEnabled = useKnowledgeSources((state) => state.setSourceEnabled)
  const selected = selection?.sources.find((item) => item.sourceId === source.id)
  const creator = useParticipants((state) => state.byId[source.createdBy]?.name ?? '一位成员')
  const state = source.status === 'failed' ? 'error' : source.status === 'ready' ? 'done' : source.status === 'upload_pending' ? 'uploading' : 'processing'
  return <Attachment
    state={state}
    size={flat ? 'sm' : 'default'}
    className={flat ? 'w-full flex-nowrap border-transparent bg-transparent' : 'w-full flex-nowrap'}
    aria-busy={state === 'uploading' || state === 'processing'}
  >
    <AttachmentMedia>
      {state === 'uploading' || state === 'processing'
        ? <HugeiconsIcon icon={Loading03Icon} className="animate-spin" strokeWidth={2} />
        : <HugeiconsIcon icon={File01Icon} strokeWidth={2} />}
    </AttachmentMedia>
    <AttachmentContent>
      <AttachmentTitle>{source.title}</AttachmentTitle>
      <AttachmentDescription>{sourceKindLabel[source.kind]} · {Math.max(1, Math.round(source.sizeBytes / 1024))} KB · {statusLabel[source.stage] ?? statusLabel[source.status] ?? '状态待同步'}{source.chunkCount ? ` · ${source.chunkCount} 片段` : ''} · {creator}</AttachmentDescription>
    </AttachmentContent>
    <AttachmentActions>
      {conversationId && source.status === 'ready' && selected ? <AttachmentAction type="button" aria-label={`${source.title} 在本对话中${selected.enabled ? '停用' : '启用'}`} aria-pressed={selected.enabled} title={selected.enabled ? '回答将使用此资料' : '此资料已停用'} onClick={() => void setSourceEnabled(conversationId, source.id, !selected.enabled)} className={selected.enabled ? 'text-primary' : 'text-muted-foreground'}>{selected.enabled ? <IconCheck /> : <IconMinus />}</AttachmentAction> : null}
      {source.status === 'failed' && <AttachmentAction type="button" size="xs" onClick={() => void retry(source.id)}>重试</AttachmentAction>}
    </AttachmentActions>
    <AttachmentTrigger type="button" onClick={() => void open(source.id)} aria-label={`打开 ${source.title}`} />
  </Attachment>
}

export function SourcePanel({ mobile = false, flat = false, toolbar }: { mobile?: boolean; flat?: boolean; toolbar?: ReactNode }) {
  const sources = useKnowledgeSources((state) => state.list)
  const loading = useKnowledgeSources((state) => state.loading)
  const load = useKnowledgeSources((state) => state.load)
  const addText = useKnowledgeSources((state) => state.addText)
  const addUrl = useKnowledgeSources((state) => state.addUrl)
  const loadConversationSelection = useKnowledgeSources((state) => state.loadConversationSelection)
  const conversationId = useApp((state) => state.selectedConversationId)
  const supportsSources = useConversations((state) => {
    const kind = state.list.find((conversation) => conversation.id === conversationId)?.kind
    return kind === 'group' || kind === 'direct'
  })
  const setView = useApp((state) => state.setView)
  const [initialLoading, setInitialLoading] = useState(supportsSources)
  const settledConversationId = useRef<string | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let active = true
    setInitialLoading(Boolean(conversationId && supportsSources))
    if (conversationId && supportsSources) {
      void load()
        .then(() => loadConversationSelection(conversationId))
        .catch(() => undefined)
        .finally(() => {
          if (!active) return
          settledConversationId.current = conversationId
          setInitialLoading(false)
        })
    }
    return () => { active = false }
  }, [conversationId, load, loadConversationSelection, supportsSources])
  const visibleSources = supportsSources ? sources : []
  const firstLoadPending = supportsSources && settledConversationId.current !== conversationId
  const uploadFiles = (files: File[]) => {
    if (!conversationId) return
    let revealed = false
    const revealPending = () => {
      if (revealed) return
      revealed = true
      void load().catch(() => undefined)
    }
    const uploads = Promise.all(files.map((file) => knowledgeApi.uploadKnowledgeFile(conversationId, file, revealPending)))
    void toastAction(uploads, {
      loading: '正在后台上传文件', success: '文件已上传，正在解析并建立索引', error: '文件上传失败',
    }).then(() => load()).catch(() => undefined)
  }

  return <section className={`knowledge-source-panel flex h-full min-h-0 flex-col ${flat ? 'bg-transparent' : 'bg-app'} ${mobile ? 'w-full' : ''}`} data-source-layout={flat ? 'flat' : 'standard'}>
    {flat ? <div className="flex h-10 shrink-0 items-center justify-between px-3">
      {toolbar}
      {supportsSources && <Button type="button" onClick={() => setAdding(true)} variant="ghost" size="sm" aria-label="添加资料"><HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />添加</Button>}
    </div> : <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-hairline px-3.5"><div><h2 className="text-sm font-semibold text-ink">知识库</h2><p className="text-[10px] text-ink-secondary">项目共享与我的私有资料</p></div><Button type="button" onClick={() => setAdding(true)} size="icon-sm" aria-label="添加资料"><HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} /></Button></header>}
    <div className={`min-h-0 flex-1 overflow-y-auto ${flat ? 'space-y-0.5 px-3 pb-3 pt-1' : 'space-y-2 p-3'}`}>
      {(firstLoadPending || initialLoading || loading) && visibleSources.length === 0 ? <ResourceSkeleton variant={flat ? 'list' : 'cards'} count={flat ? 5 : 3} compact={flat} label="正在加载知识资料" /> : visibleSources.length === 0 ? <Empty className={flat ? 'min-h-full px-6 py-8' : 'min-h-72 border'}>
        <EmptyHeader>
          <EmptyMedia variant="icon"><HugeiconsIcon icon={File01Icon} strokeWidth={2} /></EmptyMedia>
          <EmptyTitle className="text-base">这个对话还没有资料</EmptyTitle>
          <EmptyDescription>上传文件、网页或文本，让回答建立在当前对话可访问的资料之上。</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          {supportsSources && <Button type="button" onClick={() => setAdding(true)} size="sm"><HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />添加资料</Button>}
          <Button type="button" onClick={() => { setView('conversations'); window.dispatchEvent(new Event('lingxiloop:focus-composer')) }} variant="outline" size="sm"><IconArrowLeft />继续对话</Button>
        </EmptyContent>
      </Empty> : visibleSources.map((source) => <SourceRow key={source.id} source={source} conversationId={conversationId} flat={flat} />)}
    </div>

    <KnowledgeSourceUploadDialog open={adding} onOpenChange={setAdding} onFiles={uploadFiles} onUrl={addUrl} onText={addText} />

  </section>
}

/** Mounted at the application shell for source-library details. */
export function SourceDetailOverlay() {
  const isMobile = useIsMobile()
  const selectedSource = useKnowledgeSources((state) => state.selectedSource)
  const detailLoading = useKnowledgeSources((state) => state.detailLoading)
  const close = useKnowledgeSources((state) => state.close)
  const remove = useKnowledgeSources((state) => state.remove)
  const sourceText = selectedSource?.extractedText ?? ''
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
  const open = Boolean(selectedSource)
  const closeDetail = () => {
    close()
    if (isMobile) window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-context-workspace-trigger]')?.focus({ preventScroll: true }))
  }
  return <Drawer open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeDetail() }} direction="right">
    <DrawerContent
      className={isMobile ? 'data-[vaul-drawer-direction=right]:w-screen data-[vaul-drawer-direction=right]:max-w-none' : 'w-[min(92vw,48rem)] sm:[--drawer-content-width:min(92vw,48rem)]'}
      style={isMobile ? { top: 'env(safe-area-inset-top)', bottom: 'env(safe-area-inset-bottom)' } : undefined}
    >
      <DrawerHeader className="border-b border-hairline p-6">
        <div className="flex items-start justify-between gap-4"><div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">{selectedSource ? statusLabel[selectedSource.status] ?? '状态待同步' : '资料'}</div>
          <DrawerTitle className="mt-1 text-xl">{selectedSource?.title ?? '资料'}</DrawerTitle>
          <DrawerDescription>资料详情</DrawerDescription>
        </div><DrawerClose asChild><Button type="button" className="size-9 rounded-xl hover:bg-raised" aria-label="关闭资料">×</Button></DrawerClose></div>
      </DrawerHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {selectedSource && <><div className="mt-5 flex flex-wrap gap-2 text-[10px] text-ink-secondary"><span className="rounded-full bg-raised px-2.5 py-1">{sourceKindLabel[selectedSource.kind]}</span><span className="rounded-full bg-raised px-2.5 py-1">{Math.max(1, Math.round(selectedSource.sizeBytes / 1024))} KB</span>{selectedSource.isTruncated && <span className="rounded-full bg-chart-1/15 px-2.5 py-1 text-chart-1">已截断</span>}</div>{selectedSource.originalUrl && <a href={selectedSource.originalUrl} target="_blank" rel="noreferrer" className="mt-4 block truncate text-xs text-primary underline">打开原始网页</a>}{selectedSource.originalFileUrl && <a href={selectedSource.originalFileUrl} target="_blank" rel="noreferrer" className="mt-4 block truncate text-xs text-primary underline">打开原始文件</a>}</>}
        {detailLoading && !selectedSource
          ? <ResourceSkeleton variant="detail" label="正在加载资料" />
          : selectedSource
            ? <><pre className="mt-5 whitespace-pre-wrap rounded-2xl bg-muted/40 p-4 font-sans text-xs leading-6 text-foreground">{sourceText
              ? sourceText
              : selectedSource.error ? userFacingError(selectedSource.error, '资料处理失败，请重试。') : '资料仍在处理中，完成后可查看抽取文本。'}</pre><Button onClick={() => void removeSelectedSource()} className="mt-5 text-xs font-semibold text-destructive">删除来源</Button></>
            : null}
      </div>
    </DrawerContent>
  </Drawer>
}
