import { useEffect } from 'react'
import { useDocuments } from '@/stores/documents'
import { DocumentEditor } from '@/components/DocumentEditor'
import { useAuth } from '@/stores/auth'
import { useParticipants } from '@/features/agents/state'
import { cn } from '@/lib/utils'
import { IPlus } from '@/components/icons'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'

export function DocumentsView() {
  const list = useDocuments((s) => s.list)
  const loaded = useDocuments((s) => s.loaded)
  const selectedId = useDocuments((s) => s.selectedId)
  const select = useDocuments((s) => s.select)
  const load = useDocuments((s) => s.load)
  const create = useDocuments((s) => s.create)
  const byId = useParticipants((s) => s.byId)
  const me = useAuth((s) => s.user)

  useEffect(() => { void load() }, [load])

  // Auto-pick the most recently updated doc the first time the list loads.
  useEffect(() => {
    if (loaded && !selectedId && list.length > 0) {
      select(list[0].id)
    }
  }, [loaded, list, selectedId, select])

  const handleCreate = async () => {
    try {
      const d = await create({ title: "无标题" })
      select(d.id)
    } catch (e) {
      console.warn('[docs] create failed', e)
    }
  }

  return (
    <div className="grid h-full overflow-hidden" style={{ gridTemplateColumns: '280px 1fr' }}>
      <aside className="border-r border-ink-100 bg-white flex flex-col min-h-0">
        <header className="px-4 py-3 flex items-center justify-between border-b border-ink-100">
          <h2 className="font-display text-sm font-medium text-stone-800">文档</h2>
          <button
            type="button"
            onClick={handleCreate}
            className="w-7 h-7 rounded-lg grid place-items-center text-skype-deep hover:bg-skype/10 transition-colors"
            title="新文件"
            aria-label="新文件"
          >
            <IPlus className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto py-2">
          {!loaded && (
            <ResourceSkeleton variant="list" count={5} compact label="正在加载文档" />
          )}
          {loaded && list.length === 0 && (
            <div className="px-4 py-6 text-xs text-stone-400">
              尚无文档。创建一个——人类和智能体都可以实时编辑。
            </div>
          )}
          {list.map((d) => {
            const author = byId[d.createdBy]
            const authorName = author?.name ?? (d.createdBy === me?.id ? 'You' : d.createdBy)
            const active = d.id === selectedId
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => select(d.id)}
                className={cn(
                  'w-full text-left px-4 py-2.5 transition-colors block',
                  active
                    ? 'bg-skype/10 text-skype-deep'
                    : 'hover:bg-stone-50 text-stone-700',
                )}
              >
                <div className="text-sm font-medium truncate">{d.title || 'Untitled'}</div>
                <div className="text-[11px] text-stone-400 mt-0.5">
                  {authorName} · {timeAgo(d.updatedAt)}
                </div>
              </button>
            )
          })}
        </div>
      </aside>
      <main className="min-h-0 overflow-hidden bg-white">
        {!loaded ? (
          <ResourceSkeleton variant="detail" className="h-full" label="正在加载文档内容" />
        ) : selectedId ? (
          <DocumentEditor documentId={selectedId} />
        ) : (
          <div className="h-full grid place-items-center text-stone-400 text-sm">
            {list.length === 0
              ? "创建文档以开始协作。"
              : "从列表中选择一个文档。"}
          </div>
        )}
      </main>
    </div>
  )
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const ms = Date.now() - then
  if (ms < 60_000) return 'just now'
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}
