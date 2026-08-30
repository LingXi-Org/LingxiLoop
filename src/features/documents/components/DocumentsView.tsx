import { File01Icon, Folder01Icon, Menu01Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { SidebarContent, SidebarHeader } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { useParticipants } from '@/features/agents/state'
import { toastAction } from '@/lib/actionToast'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { useDocuments } from '../state'
import { DocumentEditor } from './DocumentEditor'

export function DocumentsView() {
  const list = useDocuments((state) => state.list)
  const loaded = useDocuments((state) => state.loaded)
  const selectedId = useDocuments((state) => state.selectedId)
  const select = useDocuments((state) => state.select)
  const load = useDocuments((state) => state.load)
  const create = useDocuments((state) => state.create)
  const byId = useParticipants((state) => state.byId)
  const me = useAuth((state) => state.user)
  const [listOpen, setListOpen] = useState(false)

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (loaded && !selectedId && list.length > 0) select(list[0].id)
  }, [loaded, list, selectedId, select])

  const handleCreate = async () => {
    try {
      const document = await toastAction(create({ title: '无标题' }), {
        loading: '正在创建文档', success: '文档已创建', error: '创建文档失败',
      })
      select(document.id)
      setListOpen(false)
    } catch { /* toast owns the visible error state */ }
  }

  const documentItems = (
    <>
      {!loaded && <div className="space-y-2 p-2" role="status" aria-label="正在加载文档"><span className="sr-only">正在加载文档</span><Skeleton className="h-14 rounded-2xl" /><Skeleton className="h-14 rounded-2xl" /><Skeleton className="h-14 rounded-2xl" /></div>}
      {loaded && list.length === 0 && (
        <Empty className="border-0 px-4 py-8">
          <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={File01Icon} strokeWidth={2} /></EmptyMedia><EmptyTitle className="text-base">尚无文档</EmptyTitle><EmptyDescription>人类和智能体都可以实时协作编辑。</EmptyDescription></EmptyHeader>
        </Empty>
      )}
      <ItemGroup className="gap-0 p-2">{list.map((document) => {
        const author = byId[document.createdBy]
        const authorName = author?.name ?? (document.createdBy === me?.id ? 'You' : document.createdBy)
        const active = document.id === selectedId
        return (
          <Item
            key={document.id}
            role="button"
            tabIndex={0}
            size="xs"
            onClick={() => { select(document.id); setListOpen(false) }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              select(document.id)
              setListOpen(false)
            }}
            aria-current={active ? 'page' : undefined}
            className={cn('cursor-pointer border-0', active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent')}
          >
            <ItemContent className="min-w-0">
              <ItemTitle className="block w-full truncate">{document.title || 'Untitled'}</ItemTitle>
              <ItemDescription className="line-clamp-1 text-xs">{authorName} · {timeAgo(document.updatedAt)}</ItemDescription>
            </ItemContent>
          </Item>
        )
      })}</ItemGroup>
    </>
  )

  return (
    <div className="@container/library flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--im-divider-weak)] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="ghost" size="icon-sm" className="@min-[48rem]/library:hidden" aria-label="打开文档列表" onClick={() => setListOpen(true)}><HugeiconsIcon icon={Menu01Icon} strokeWidth={2} /></Button>
          <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
          <h1 className="truncate font-heading text-sm font-medium">资料库</h1>
        </div>
        <Button type="button" size="sm" onClick={() => void handleCreate()}><HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />新建文档</Button>
      </header>

      <div className="grid min-h-0 flex-1 @min-[48rem]/library:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-e border-[var(--im-divider)] bg-card @min-[48rem]/library:flex @min-[48rem]/library:flex-col">
          <SidebarHeader className="h-10 shrink-0 justify-center px-3 py-1"><p className="text-xs font-medium text-muted-foreground">所有文档 · {list.length}</p></SidebarHeader>
          <SidebarContent className="gap-0">{documentItems}</SidebarContent>
        </aside>
        <div className="min-h-0 overflow-hidden bg-card">
          {!loaded ? (
            <div className="grid h-full gap-4 p-6" role="status" aria-label="正在加载文档内容"><span className="sr-only">正在加载文档内容</span><Skeleton className="h-12 rounded-2xl" /><Skeleton className="h-full min-h-64 rounded-4xl" /></div>
          ) : selectedId ? (
            <DocumentEditor documentId={selectedId} />
          ) : (
            <Empty className="h-full border-0">
              <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={File01Icon} strokeWidth={2} /></EmptyMedia><EmptyTitle>{list.length === 0 ? '创建文档以开始协作' : '选择一个文档'}</EmptyTitle><EmptyDescription>{list.length === 0 ? '新文档支持多人和智能体实时编辑。' : '从文档列表中选择要打开的内容。'}</EmptyDescription></EmptyHeader>
            </Empty>
          )}
        </div>
      </div>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="left" className="w-[280px] p-0 sm:max-w-[280px]">
          <SheetHeader className="border-b border-[var(--im-divider-weak)] px-4 py-3 text-start"><SheetTitle>所有文档</SheetTitle><SheetDescription>{list.length} 个文档</SheetDescription></SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{documentItems}</div>
          <div className="border-t border-[var(--im-divider-weak)] p-3"><Button type="button" className="w-full" onClick={() => void handleCreate()}><HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />新建文档</Button></div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const ms = Date.now() - then
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}
