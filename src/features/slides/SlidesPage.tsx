import { Add01Icon, BubbleChatIcon, Delete02Icon, Edit02Icon, GridViewIcon, LeftToRightListBulletIcon, MoreHorizontalIcon, Presentation01Icon, SearchIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ws } from '@/api/core/realtime'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { PageBody, PageHeader, PageLayout, PageToolbar } from '@/components/shell/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { SelectField } from '@/components/ui/select-field'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useApp } from '@/stores/app'
import { ToggleGroupLite } from '@/components/shell/ToggleGroupLite'
import type { ArtifactSummary } from '@/features/artifacts/contracts'
import { prefetchEditor } from '@/features/artifacts/editor-preload'
import { useWorkspace } from '@/features/knowledge/workspace'
import { formatDeckUpdated, useSlides } from './store'

const loadSlidesWorkspace = () => import('./SlidesWorkspace')
const SlidesWorkspace = lazy(() => loadSlidesWorkspace().then(module => ({ default: module.SlidesWorkspace })))
// The library stays light; pointing at or focusing a deck starts its workspace
// and assistant code, so the click itself only waits for that deck's data.
// The deck's editor grant and editor assets start at the same intent.
const prefetchDeck = (target: EventTarget) => {
  const trigger = (target as Element).closest?.('[data-artifact-open-trigger]')
  if (!trigger) return
  void loadSlidesWorkspace().then(module => module.preloadSlidesAssistant?.()).catch(() => {})
  prefetchEditor()
}

type Layout = 'grid' | 'list'
type Sort = 'updated' | 'created' | 'title'
const LAYOUT_KEY = 'lingxiloop:slides:layout:v1'
const readLayout = (): Layout => { try { return window.localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' } }

function DeckActions({ deck }: { deck: ArtifactSummary }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`管理「${deck.title}」`} className="shrink-0 text-muted-foreground">
        <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onSelect={() => void useSlides.getState().rename(deck)}><HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />重命名</DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onSelect={() => void useSlides.getState().remove(deck)}><HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />删除</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}


/** The project's Slides decks: a library home plus the vendored claude-slides editor. */
export function SlidesPage({ projectId, active = true }: { projectId: string; active?: boolean }) {
  const decks = useSlides((state) => state.decks)
  const error = useSlides((state) => state.error)
  const openId = useSlides((state) => state.openId)
  const retainedId = useSlides((state) => state.retainedId)
  const reopening = useSlides((state) => state.reopening)
  const workspaceName = useWorkspace((state) => state.list.find((item) => item.id === projectId)?.name)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('updated')
  const [layout, setLayout] = useState<Layout>(readLayout)

  useEffect(() => {
    const controller = new AbortController()
    useSlides.getState().reset(projectId)
    void useSlides.getState().load(projectId, controller.signal)
    return () => controller.abort()
  }, [projectId])
  useEffect(() => ws.on((event) => {
    if (event.type === 'artifact.changed' && event.artifactKind === 'slides' && event.kind !== 'files.changed') void useSlides.getState().load(projectId)
  }), [projectId])

  const visible = useMemo(() => {
    const value = query.trim().toLocaleLowerCase()
    const list = (decks ?? []).filter((deck) => !value || deck.title.toLocaleLowerCase().includes(value))
    return [...list].sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN')
      : Date.parse(sort === 'created' ? b.createdAt : b.updatedAt) - Date.parse(sort === 'created' ? a.createdAt : a.updatedAt))
  }, [decks, query, sort])

  const changeLayout = (next: Layout) => { setLayout(next); try { window.localStorage.setItem(LAYOUT_KEY, next) } catch { /* storage may be unavailable */ } }
  const open = (id: string | null) => { void useSlides.getState().open(id) }
  const create = () => void useSlides.getState().create()

  const cachedId = retainedId && (!decks || decks.some((deck) => deck.id === retainedId)) ? retainedId : null
  const current = cachedId ? decks?.find((deck) => deck.id === cachedId) : undefined
  const showingWorkspace = Boolean(openId && openId === cachedId)

  return <>
  {cachedId && <div aria-hidden={!showingWorkspace} inert={!showingWorkspace} style={showingWorkspace ? undefined : { position: 'absolute', inset: 0, visibility: 'hidden', opacity: 0, pointerEvents: 'none' }} className="h-full min-h-0">
    <Suspense fallback={<ResourceSkeleton variant="media" label="正在打开演示文稿" />}>
      <SlidesWorkspace key={`${projectId}:${cachedId}`} artifactId={cachedId} title={current?.title ?? '演示文稿'} visible={active && showingWorkspace} onClose={() => open(null)} />
    </Suspense>
  </div>}
  {!showingWorkspace && <PageLayout
    header={<PageHeader title="全部演示文稿" crumbs={workspaceName ? [{ label: workspaceName }] : undefined}
      actions={<Button onClick={create} className="max-md:size-11 max-md:p-0"><HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" /><span className="max-md:sr-only">新建演示文稿</span></Button>} />}
  >
    <PageBody>
      <div data-slides-page className="space-y-8" onPointerOver={event => prefetchDeck(event.target)} onFocus={event => prefetchDeck(event.target)}>
        {reopening && <p role="status" className="text-sm text-muted-foreground">正在重新打开演示文稿…</p>}
        <section aria-labelledby="slides-start" className="space-y-3">
          <h2 id="slides-start" className="text-sm font-medium">开始</h2>
          <div className="grid gap-3 @min-[36rem]/page:grid-cols-2 @min-[56rem]/page:grid-cols-3">
            <button type="button" onClick={create} className="group/start flex items-center gap-4 rounded-xl border border-dashed border-border bg-card p-4 text-start transition-colors hover:border-foreground/25 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring">
              <span className="grid aspect-video w-24 shrink-0 place-items-center rounded-lg border border-border bg-muted/40 text-muted-foreground group-hover/start:text-foreground"><HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} className="size-5" /></span>
              <span className="min-w-0"><span className="block text-sm font-medium">空白演示文稿</span><span className="block text-xs text-muted-foreground">在编辑器中从第一页开始</span></span>
            </button>
            <button type="button" onClick={() => useApp.getState().setView('conversations')} className="group/start flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-start transition-colors hover:border-foreground/25 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring">
              <span className="grid aspect-video w-24 shrink-0 place-items-center rounded-lg border border-border bg-muted/40 text-muted-foreground group-hover/start:text-foreground"><HugeiconsIcon icon={BubbleChatIcon} strokeWidth={1.8} className="size-5" /></span>
              <span className="min-w-0"><span className="block text-sm font-medium">让助手制作</span><span className="block text-xs text-muted-foreground">在对话中说明主题和页数</span></span>
            </button>
          </div>
        </section>

        <section aria-labelledby="slides-library" className="space-y-3">
          <div className="flex items-baseline gap-2">
            <h2 id="slides-library" className="text-sm font-medium">演示文稿</h2>
            {decks?.length ? <span className="text-xs tabular-nums text-muted-foreground">{decks.length}</span> : null}
          </div>
        {error ? <Alert variant="destructive"><AlertDescription className="flex items-center justify-between gap-3">{error}<Button variant="outline" size="sm" onClick={() => void useSlides.getState().load(projectId)}>重试</Button></AlertDescription></Alert>
          : !decks ? <ResourceSkeleton variant="list" label="正在加载演示文稿" />
          : !decks.length ? <Empty className="border border-dashed">
              <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={Presentation01Icon} /></EmptyMedia>
                <EmptyTitle>还没有演示文稿</EmptyTitle><EmptyDescription>新建一份，或在对话中请助手为你制作。可在编辑器里演示，并导出 PDF、HTML 或 PowerPoint。</EmptyDescription></EmptyHeader>
              <EmptyContent><Button onClick={create}>新建演示文稿</Button></EmptyContent>
            </Empty>
          : <>
            <PageToolbar className="mb-3">
              <InputGroup className="h-9 min-w-0 flex-1 basis-60 sm:max-w-80">
                <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按名称搜索" aria-label="搜索演示文稿" />
                <InputGroupAddon><HugeiconsIcon icon={SearchIcon} strokeWidth={2} className="size-4" /></InputGroupAddon>
              </InputGroup>
              <div className="ms-auto flex items-center gap-2">
                <SelectField ariaLabel="排序方式" value={sort} onValueChange={(value) => setSort(value as Sort)} className="w-32"
                  options={[{ value: 'updated', label: '最近更新' }, { value: 'created', label: '最近创建' }, { value: 'title', label: '按名称' }]} />
                <ToggleGroupLite label="显示方式" value={layout} onValueChange={changeLayout}
                  items={[{ value: 'grid', label: '网格', icon: GridViewIcon }, { value: 'list', label: '列表', icon: LeftToRightListBulletIcon }]} />
              </div>
            </PageToolbar>
            {visible.length === 0 ? <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">没有找到匹配的演示文稿</p>
              : layout === 'grid' ? <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-4" aria-label="演示文稿">
                {visible.map((deck) => <li key={deck.id} className="group/deck flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/25">
                  <button type="button" disabled={reopening} onClick={() => open(deck.id)} data-artifact-open-trigger={deck.id} aria-label={`打开「${deck.title}」`}
                    className="block w-full border-b border-border bg-muted/50 p-4 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                    <span aria-hidden="true" className="flex aspect-video w-full flex-col justify-between rounded-md border border-border bg-background p-3 transition-transform duration-200 group-hover/deck:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover/deck:translate-y-0">
                      <span className="h-1 w-6 rounded-full bg-primary/70" />
                      <span className="line-clamp-2 font-heading text-sm font-semibold leading-snug text-foreground">{deck.title}</span>
                      <span className="flex flex-col gap-1"><span className="h-1 w-3/4 rounded-full bg-muted" /><span className="h-1 w-1/2 rounded-full bg-muted" /></span>
                    </span>
                  </button>
                  <div className="flex min-w-0 items-center gap-2 py-2.5 ps-3.5 pe-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{deck.title}</p>
                      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><span className="truncate tabular-nums">{formatDeckUpdated(deck.updatedAt)}</span>{deck.conversationId ? <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[11px] font-normal">对话</Badge> : null}</p>
                    </div>
                    <DeckActions deck={deck} />
                  </div>
                </li>)}
              </ul>
              : <div className="overflow-hidden rounded-xl border border-border">
                <Table aria-label="演示文稿">
                  <TableHeader className="bg-muted/40"><TableRow>
                    <TableHead className="ps-4">名称</TableHead>
                    <TableHead className="hidden w-28 @min-[40rem]/page:table-cell">来源</TableHead>
                    <TableHead className="hidden w-44 @min-[32rem]/page:table-cell">更新时间</TableHead>
                    <TableHead className="w-12 pe-2"><span className="sr-only">操作</span></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {visible.map((deck) => <TableRow key={deck.id}>
                      <TableCell className="max-w-0 ps-4">
                        <button type="button" disabled={reopening} onClick={() => open(deck.id)} data-artifact-open-trigger={deck.id}
                          className="flex w-full min-w-0 items-center gap-3 rounded-md text-start focus-visible:outline-2 focus-visible:outline-ring">
                          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-muted/40 text-muted-foreground"><HugeiconsIcon icon={Presentation01Icon} strokeWidth={1.8} className="size-4" /></span>
                          <span className="min-w-0 truncate font-medium hover:underline">{deck.title}</span>
                        </button>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground @min-[40rem]/page:table-cell">{deck.conversationId ? '对话' : '手动创建'}</TableCell>
                      <TableCell className="hidden tabular-nums text-muted-foreground @min-[32rem]/page:table-cell">{formatDeckUpdated(deck.updatedAt)}</TableCell>
                      <TableCell className="pe-2 text-end"><DeckActions deck={deck} /></TableCell>
                    </TableRow>)}
                  </TableBody>
                </Table>
              </div>}
          </>}
        </section>
      </div>
    </PageBody>
  </PageLayout>}
  </>
}
