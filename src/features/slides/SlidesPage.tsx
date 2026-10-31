import { Add01Icon, Delete02Icon, Edit02Icon, Presentation01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ws } from '@/api/core/realtime'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { artifactsApi } from '@/features/artifacts/api'
import { SlidesWorkspace } from './SlidesWorkspace'
import type { ArtifactSummary } from '@/features/artifacts/contracts'
import { confirmSensitiveAction, promptSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'

const readDeck = () => new URLSearchParams(window.location.search).get('deck')
function writeDeck(deckId: string | null) {
  const url = new URL(window.location.href)
  if (deckId) url.searchParams.set('deck', deckId)
  else url.searchParams.delete('deck')
  window.history.replaceState(window.history.state, '', url)
}
const updated = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

/** The project's Slides decks: the main sidebar entry for the vendored claude-slides editor. */
export function SlidesPage({ projectId }: { projectId: string }) {
  const [decks, setDecks] = useState<ArtifactSummary[] | null>(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(readDeck)
  // One retained workspace avoids rebuilding its opaque iframe on a quick
  // return from the list. Switching decks/projects still releases the old one.
  const [retained, setRetained] = useState(() => ({ projectId, id: readDeck() }))
  const [reopening, setReopening] = useState(false)
  const reopeningRequest = useRef<AbortController | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await artifactsApi.listSlides(projectId, signal)
      setDecks(next)
      setError('')
    } catch (reason) {
      if (!signal?.aborted) setError(userFacingError(reason, '演示文稿列表暂时无法加载，请重试。'))
    }
  }, [projectId])

  useEffect(() => {
    const controller = new AbortController()
    setDecks(null)
    setReopening(false)
    void load(controller.signal)
    return () => { controller.abort(); reopeningRequest.current?.abort() }
  }, [load])
  useEffect(() => ws.on((event) => {
    if (event.type === 'artifact.changed' && event.artifactKind === 'slides' && event.kind !== 'files.changed') void load()
  }), [load])

  const open = async (deckId: string | null) => {
    reopeningRequest.current?.abort()
    setReopening(false)
    if (deckId && retained.projectId === projectId && retained.id === deckId && !openId) {
      // Recheck current membership before exposing a retained document.
      const controller = new AbortController()
      reopeningRequest.current = controller
      setReopening(true)
      try { await artifactsApi.slideWorkspace(deckId, controller.signal) }
      catch (reason) {
        if (!controller.signal.aborted) {
          setRetained({ projectId, id: null })
          toast.error(userFacingError(reason, '演示文稿暂时无法重新打开，请重试。'))
          void load()
        }
        return
      } finally { if (!controller.signal.aborted) setReopening(false) }
      if (controller.signal.aborted) return
    }
    if (deckId) setRetained({ projectId, id: deckId })
    writeDeck(deckId); setOpenId(deckId)
  }
  const create = async () => {
    const title = await promptSensitiveAction({ title: '新建演示文稿', description: '演示文稿属于当前课程，课程成员都可以查看和编辑。',
      inputLabel: '名称', inputPlaceholder: '例如：第三章复习', inputRequired: true, confirmLabel: '创建' })
    if (!title) return
    try {
      const deck = await artifactsApi.createSlides(projectId, title)
      await load()
      open(deck.id)
    } catch (reason) { toast.error(userFacingError(reason, '演示文稿没有创建成功，请重试。')) }
  }
  const rename = async (deck: ArtifactSummary) => {
    const title = await promptSensitiveAction({ title: '重命名演示文稿', description: '新名称会对所有能查看它的成员显示。',
      inputLabel: '名称', inputDefaultValue: deck.title, inputRequired: true, confirmLabel: '保存' })
    if (!title || title === deck.title) return
    try { await artifactsApi.rename(deck.id, title); await load() }
    catch (reason) { toast.error(userFacingError(reason, '名称没有保存，请重试。')) }
  }
  const remove = async (deck: ArtifactSummary) => {
    const confirmed = await confirmSensitiveAction({ title: `删除「${deck.title}」？`, description: '幻灯片、上传的图片和评论会一起删除，且无法恢复。',
      confirmLabel: '删除', tone: 'destructive' })
    if (!confirmed) return
    try {
      await artifactsApi.remove(deck.id)
      if (openId === deck.id) open(null)
      await load()
    } catch (reason) { toast.error(userFacingError(reason, '演示文稿没有删除，请重试。')) }
  }

  const cachedId = retained.projectId === projectId && (!decks || decks.some(deck => deck.id === retained.id)) ? retained.id : null
  const current = cachedId ? decks?.find(deck => deck.id === cachedId) : undefined
  const showingWorkspace = Boolean(openId && openId === cachedId)

  return <>
    {cachedId && <div hidden={!showingWorkspace} inert={!showingWorkspace} className={showingWorkspace ? 'h-full min-h-0' : 'hidden'}>
      <SlidesWorkspace key={`${projectId}:${cachedId}`} artifactId={cachedId} title={current?.title ?? '演示文稿'} onClose={() => { void open(null) }} />
    </div>}
    <div hidden={showingWorkspace} className={showingWorkspace ? 'hidden' : 'flex h-full min-h-0 flex-col'} data-slides-page>
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold">演示文稿</h1>
        <p className="text-sm text-muted-foreground">在编辑器中演示、修改并导出 PDF、HTML 或 PowerPoint。也可以在对话里让助手制作。</p>
      </div>
      <Button className="min-h-11 shrink-0" onClick={() => void create()}>
        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />新建
      </Button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      {reopening && <p role="status" className="mb-3 text-sm text-muted-foreground">正在重新打开演示文稿…</p>}
      {error ? <Alert variant="destructive"><AlertDescription className="flex items-center justify-between gap-3">{error}<Button variant="outline" size="sm" onClick={() => void load()}>重试</Button></AlertDescription></Alert>
        : !decks ? <ResourceSkeleton variant="list" label="正在加载演示文稿" />
        : !decks.length ? <Empty><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={Presentation01Icon} /></EmptyMedia>
            <EmptyTitle>还没有演示文稿</EmptyTitle><EmptyDescription>新建一份，或在对话中请助手为你制作。</EmptyDescription></EmptyHeader>
            <Button variant="outline" className="min-h-11" onClick={() => void create()}>新建演示文稿</Button></Empty>
        : <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="演示文稿">
          {decks.map((deck) => <li key={deck.id} className="flex flex-col rounded-xl border border-border bg-card">
            <button type="button" disabled={reopening} onClick={() => { void open(deck.id) }} data-artifact-open-trigger={deck.id}
              className="flex min-h-24 flex-1 flex-col items-start gap-1 rounded-t-xl p-4 text-start hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
              <span className="line-clamp-2 font-medium">{deck.title}</span>
              <span className="text-xs text-muted-foreground">{Math.max(0, deck.fileCount - 1)} 个文件 · 更新于 {updated(deck.updatedAt)}{deck.conversationId ? ' · 来自对话' : ''}</span>
            </button>
            <div className="flex justify-end gap-1 border-t border-border p-1">
              <Button variant="ghost" size="icon" className="size-10" aria-label={`重命名「${deck.title}」`} onClick={() => void rename(deck)}>
                <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="size-10" aria-label={`删除「${deck.title}」`} onClick={() => void remove(deck)}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
              </Button>
            </div>
          </li>)}
        </ul>}
    </div>
  </div></>
}
