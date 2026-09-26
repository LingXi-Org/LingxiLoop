import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import type { KnowledgeSource } from '@/features/knowledge/contracts'
import { useKnowledgeSources } from '@/features/knowledge/state'
import { useIsMobile } from '@/hooks/use-mobile'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'

const statusLabel: Record<string, string> = {
  upload_pending: '等待上传', queued: '等待处理', processing: '处理中', parsing: '处理中',
  chunking: '处理中', indexing: '处理中', ready: '可查看', failed: '处理失败', retrying: '处理中',
}
const sourceKindLabel: Record<KnowledgeSource['kind'], string> = {
  file: '文件', url: '网页', text: '文本',
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
      title: '删除资料？',
      description: `“${selectedSource.title}”及其搜索内容将被永久删除，历史消息中的引用摘要仍会保留。`,
      confirmLabel: '删除资料',
      tone: 'destructive',
    })) return
    try {
      await toastAction(remove(selectedSource.id), { loading: '正在删除资料', success: '资料已删除', error: '删除资料失败' })
    } catch { /* toast owns the visible error state */ }
  }
  const open = Boolean(selectedSource)
  const closeDetail = () => {
    close()
    if (isMobile) window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-workspace-view="library"]')?.focus({ preventScroll: true }))
  }
  return <Drawer open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeDetail() }} direction="right">
    <DrawerContent
      className={isMobile ? 'data-[vaul-drawer-direction=right]:w-screen data-[vaul-drawer-direction=right]:max-w-none' : 'w-[min(92vw,48rem)] sm:[--drawer-content-width:min(92vw,48rem)]'}
      style={isMobile ? { top: 'env(safe-area-inset-top)', bottom: 'env(safe-area-inset-bottom)' } : undefined}
    >
      <DrawerHeader className="border-b border-hairline p-6">
        <div className="flex items-start justify-between gap-4"><div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">{selectedSource ? statusLabel[selectedSource.status] ?? '状态暂不可用' : '资料'}</div>
          <DrawerTitle className="mt-1 text-xl">{selectedSource?.title ?? '资料'}</DrawerTitle>
        </div><DrawerClose asChild><Button type="button" className="size-9 rounded-xl hover:bg-raised" aria-label="关闭资料">×</Button></DrawerClose></div>
      </DrawerHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {selectedSource && <><div className="mt-5 flex flex-wrap gap-2 text-[10px] text-ink-secondary"><span className="rounded-full bg-raised px-2.5 py-1">{sourceKindLabel[selectedSource.kind]}</span><span className="rounded-full bg-raised px-2.5 py-1">{Math.max(1, Math.round(selectedSource.sizeBytes / 1024))} KB</span>{selectedSource.isTruncated && <span className="rounded-full bg-chart-1/15 px-2.5 py-1 text-chart-1">预览内容不完整</span>}</div>{selectedSource.originalUrl && <a href={selectedSource.originalUrl} target="_blank" rel="noreferrer" className="mt-4 block truncate text-xs text-primary underline">打开原始网页</a>}{selectedSource.originalFileUrl && <a href={selectedSource.originalFileUrl} target="_blank" rel="noreferrer" className="mt-4 block truncate text-xs text-primary underline">打开原始文件</a>}</>}
        {detailLoading && !selectedSource
          ? <ResourceSkeleton variant="detail" label="正在加载资料" />
          : selectedSource
            ? <><pre className="mt-5 whitespace-pre-wrap rounded-2xl bg-muted/40 p-4 font-sans text-xs leading-6 text-foreground">{sourceText
              ? sourceText
              : selectedSource.error ? userFacingError(selectedSource.error, '资料处理失败，请重试。') : '资料处理中，完成后可预览内容。'}</pre><Button onClick={() => void removeSelectedSource()} className="mt-5 text-xs font-semibold text-destructive">删除资料</Button></>
            : null}
      </div>
    </DrawerContent>
  </Drawer>
}
