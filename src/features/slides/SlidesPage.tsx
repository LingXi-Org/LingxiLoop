import { Add01Icon, Delete02Icon, Edit02Icon, GridViewIcon, LeftToRightListBulletIcon, MoreHorizontalIcon, Presentation01Icon, SearchIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useMemo, useState } from 'react'
import { ws } from '@/api/core/realtime'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { PageBody, PageHeader, PageLayout, PageToolbar } from '@/components/shell/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { SelectField } from '@/components/ui/select-field'
import { ToggleGroupLite } from '@/components/shell/ToggleGroupLite'
import type { ArtifactSummary } from '@/features/artifacts/contracts'
import { useWorkspace } from '@/features/knowledge/workspace'
import { SlidesWorkspace } from './SlidesWorkspace'
import { formatDeckUpdated, useSlides } from './store'

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

const deckMeta = (deck: ArtifactSummary) => `${formatDeckUpdated(deck.updatedAt)}${deck.conversationId ? ' · 来自对话' : ''}`

/** The project's Slides decks: a library home plus the vendored claude-slides editor. */
export function SlidesPage({ projectId }: { projectId: string }) {
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
  {cachedId && <div hidden={!showingWorkspace} inert={!showingWorkspace} className={showingWorkspace ? 'h-full min-h-0' : 'hidden'}>
    <SlidesWorkspace key={`${projectId}:${cachedId}`} artifactId={cachedId} title={current?.title ?? '演示文稿'} onClose={() => open(null)} />
  </div>}
  {!showingWorkspace && <PageLayout
    header={<PageHeader title="全部演示文稿" crumbs={workspaceName ? [{ label: workspaceName }] : undefined}
      actions={<Button onClick={create} className="max-md:size-11 max-md:p-0"><HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" /><span className="max-md:sr-only">新建演示文稿</span></Button>} />}
  >
    <PageBody>
      <div data-slides-page>
        {reopening && <p role="status" className="mb-3 text-sm text-muted-foreground">正在重新打开演示文稿…</p>}
        {error ? <Alert variant="destructive"><AlertDescription className="flex items-center justify-between gap-3">{error}<Button variant="outline" size="sm" onClick={() => void useSlides.getState().load(projectId)}>重试</Button></AlertDescription></Alert>
          : !decks ? <ResourceSkeleton variant="list" label="正在加载演示文稿" />
          : !decks.length ? <Empty className="border border-dashed">
              <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={Presentation01Icon} /></EmptyMedia>
                <EmptyTitle>还没有演示文稿</EmptyTitle><EmptyDescription>新建一份，或在对话中请助手为你制作。可在编辑器里演示，并导出 PDF、HTML 或 PowerPoint。</EmptyDescription></EmptyHeader>
              <EmptyContent><Button onClick={create}>新建演示文稿</Button></EmptyContent>
            </Empty>
          : <>
            <PageToolbar>
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
            {visible.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">没有找到匹配的演示文稿</p>
              : layout === 'grid' ? <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-4" aria-label="演示文稿">
                {visible.map((deck) => <li key={deck.id} className="group/deck flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/20">
                  <button type="button" disabled={reopening} onClick={() => open(deck.id)} data-artifact-open-trigger={deck.id} aria-label={`打开「${deck.title}」`}
                    className="relative flex aspect-video w-full items-end border-b border-border bg-muted/40 p-4 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                    <span aria-hidden="true" className="absolute start-4 top-4 h-1 w-8 rounded-full bg-primary/70" />
                    <span aria-hidden="true" className="line-clamp-2 font-heading text-lg font-semibold leading-snug text-foreground/80">{deck.title}</span>
                  </button>
                  <div className="flex min-w-0 items-center gap-2 py-2 ps-3 pe-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{deck.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{deckMeta(deck)}</p>
                    </div>
                    <DeckActions deck={deck} />
                  </div>
                </li>)}
              </ul>
              : <div className="overflow-hidden rounded-xl border border-border">
                <ul aria-label="演示文稿" className="divide-y divide-border">
                  {visible.map((deck) => <li key={deck.id} className="flex min-w-0 items-center gap-3 bg-card pe-2 hover:bg-muted/40">
                    <button type="button" disabled={reopening} onClick={() => open(deck.id)} data-artifact-open-trigger={deck.id}
                      className="flex min-h-14 min-w-0 flex-1 items-center gap-3 ps-4 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-muted/40 text-muted-foreground"><HugeiconsIcon icon={Presentation01Icon} strokeWidth={1.8} className="size-4" /></span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{deck.title}</span>
                      <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground @min-[36rem]/page:inline">{deckMeta(deck)}</span>
                    </button>
                    <DeckActions deck={deck} />
                  </li>)}
                </ul>
              </div>}
          </>}
      </div>
    </PageBody>
  </PageLayout>}
  </>
}
