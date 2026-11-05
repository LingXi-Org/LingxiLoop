import { toast } from 'sonner'
import { create } from 'zustand'
import { artifactsApi } from '@/features/artifacts/api'
import { nativeTransport } from '@/features/artifacts/native/transport'
import type { ArtifactSummary } from '@/features/artifacts/contracts'
import { confirmSensitiveAction, promptSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'

const readDeck = () => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('deck')
function writeDeck(deckId: string | null) {
  const url = new URL(window.location.href)
  if (deckId) url.searchParams.set('deck', deckId)
  else url.searchParams.delete('deck')
  window.history.replaceState(window.history.state, '', url)
}

interface SlidesState {
  projectId: string | null
  decks: ArtifactSummary[] | null
  error: string
  openId: string | null
  /** Retain the workspace shell when briefly returning to the library. */
  retainedId: string | null
  reopening: boolean
  load(projectId: string, signal?: AbortSignal): Promise<void>
  reset(projectId: string): void
  open(deckId: string | null): Promise<void>
  create(): Promise<void>
  rename(deck: ArtifactSummary): Promise<void>
  remove(deck: ArtifactSummary): Promise<void>
}

let reopenRequest: AbortController | null = null
const renameDrafts = new Map<string, string>()

/** The project's Slides decks, shared by the nested sidebar and the Slides page. */
export const useSlides = create<SlidesState>((set, get) => ({
  projectId: null,
  decks: null,
  error: '',
  openId: readDeck(),
  retainedId: readDeck(),
  reopening: false,
  reset: (projectId) => {
    if (get().projectId === projectId) return
    reopenRequest?.abort()
    const deck = readDeck()
    set({ projectId, decks: null, error: '', openId: deck, retainedId: deck, reopening: false })
  },
  load: async (projectId, signal) => {
    try {
      const decks = await artifactsApi.listSlides(projectId, signal)
      if (get().projectId === projectId) set({ decks, error: '' })
    } catch (reason) {
      if (!signal?.aborted && get().projectId === projectId) set({ error: userFacingError(reason, '演示文稿列表暂时无法加载，请重试。') })
    }
  },
  open: async (deckId) => {
    reopenRequest?.abort()
    set({ reopening: false })
    const projectId = get().projectId
    if (deckId && get().retainedId === deckId && !get().openId) {
      // Recheck current membership before exposing a retained document.
      const controller = new AbortController()
      reopenRequest = controller
      set({ reopening: true })
      try { await artifactsApi.slideWorkspace(deckId, controller.signal) }
      catch (reason) {
        if (!controller.signal.aborted) {
          set({ retainedId: null, reopening: false })
          toast.error(userFacingError(reason, '演示文稿暂时无法重新打开，请重试。'))
          if (projectId) void get().load(projectId)
        }
        return
      }
      if (controller.signal.aborted || get().projectId !== projectId) return
      set({ reopening: false })
    }
    writeDeck(deckId)
    set(deckId ? { openId: deckId, retainedId: deckId } : { openId: null })
  },
  create: async () => {
    const projectId = get().projectId
    if (!projectId) return
    const title = await promptSensitiveAction({ title: '新建演示文稿', description: '演示文稿属于当前课程，课程成员都可以查看和编辑。',
      inputLabel: '名称', inputPlaceholder: '例如：第三章复习', inputRequired: true, confirmLabel: '创建' })
    if (!title) return
    try {
      const deck = await artifactsApi.createSlides(projectId, title)
      await get().load(projectId)
      await get().open(deck.id)
    } catch (reason) { toast.error(userFacingError(reason, '演示文稿没有创建成功，请重试。')) }
  },
  rename: async (deck) => {
    const projectId = get().projectId
    if (!projectId) return
    try {
      const { document } = await nativeTransport(deck.id).read()
      const draft = renameDrafts.get(deck.id)
      const title = await promptSensitiveAction({ title: '重命名演示文稿', description: draft ? `上次未保存的名称已保留。当前名称：${document.title}` : '新名称会对所有能查看它的成员显示。',
        inputLabel: '名称', inputDefaultValue: draft ?? document.title, inputRequired: true, confirmLabel: '保存' })
      if (!title || title === document.title) return
      renameDrafts.set(deck.id, title)
      await artifactsApi.rename(deck.id, title, document.versions['document/title'] ?? 0, crypto.randomUUID())
      renameDrafts.delete(deck.id)
      await get().load(projectId)
    }
    catch (reason) { toast.error(userFacingError(reason, '名称没有保存，请重试。'), { description: renameDrafts.has(deck.id) ? '未保存的名称已保留，再次选择重命名可继续。' : undefined }) }
  },
  remove: async (deck) => {
    const projectId = get().projectId
    const confirmed = await confirmSensitiveAction({ title: `删除「${deck.title}」？`, description: '幻灯片、上传的图片和评论会一起删除，且无法恢复。',
      confirmLabel: '删除', tone: 'destructive' })
    if (!confirmed || !projectId) return
    try {
      await artifactsApi.remove(deck.id)
      if (get().openId === deck.id) await get().open(null)
      await get().load(projectId)
    } catch (reason) { toast.error(userFacingError(reason, '演示文稿没有删除，请重试。')) }
  },
}))

export const formatDeckUpdated = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
