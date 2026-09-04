import { useEffect, useMemo, useState } from 'react'
import { IPlus, ISearch } from '@/components/icons'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useWorkspace } from '@/features/knowledge/workspace'
import { useAuth } from '@/stores/auth'

function relativeTime(raw: string | null): string {
  if (!raw) return '尚未访问'
  const hours = Math.max(0, Math.floor((Date.now() - new Date(raw).getTime()) / 3_600_000))
  if (hours < 1) return '刚刚访问'
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

export function WorkspacePicker() {
  const list = useWorkspace((state) => state.list)
  const loaded = useWorkspace((state) => state.loaded)
  const loading = useWorkspace((state) => state.loading)
  const error = useWorkspace((state) => state.error)
  const load = useWorkspace((state) => state.load)
  const select = useWorkspace((state) => state.select)
  const createBlank = useWorkspace((state) => state.createBlank)
  const companies = useAuth((state) => state.companies)
  const activeCompanyId = useAuth((state) => state.activeCompanyId)
  const setActiveCompany = useAuth((state) => state.setActiveCompany)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => { void load() }, [activeCompanyId, load])
  const visible = useMemo(() => list.filter((workspace) =>
    (showArchived ? workspace.status === 'ARCHIVED' : workspace.status !== 'ARCHIVED' && workspace.status !== 'DELETED') &&
    `${workspace.name} ${workspace.description}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [list, query, showArchived])

  const submit = async () => {
    if (!name.trim()) return
    await createBlank(name.trim(), '')
    setCreating(false); setName('')
  }

  return (
    <main className="min-h-screen overflow-auto bg-app px-5 py-8 text-ink sm:px-10 lg:px-16">
      <div className="mx-auto max-w-[1180px]">
        <header className="flex flex-col gap-6 border-b border-hairline pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-hairline bg-panel px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-primary">
              基于资料的知识工作区
            </div>
            <h1 className="font-display text-[clamp(28px,4vw,48px)] font-semibold tracking-[-0.04em] text-ink">选择你的知识工作区</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">围绕上传资料组织对话、文档、看板与画布，也可以从一个空白学习区开始。</p>
          </div>
          {companies.length > 1 && (
            <div className="text-xs font-semibold text-ink-secondary">组织
              <Select value={activeCompanyId ?? ''} onValueChange={setActiveCompany}>
                <SelectTrigger className="mt-1 min-w-52"><SelectValue placeholder="选择组织" /></SelectTrigger>
                <SelectContent>{companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </header>

        <div className="my-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <ISearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-secondary" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索工作区" className="h-11 w-full rounded-xl border border-hairline bg-panel pl-10 pr-4 text-sm outline-none focus:border-ring" />
          </label>
          <Button type="button" onClick={() => setCreating(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105"><IPlus className="size-4" />新建空白工作区</Button>
        </div>

        <div className="mb-4 flex items-center gap-5 text-xs font-semibold">
          <Button onClick={() => setShowArchived(false)} className={!showArchived ? 'text-primary' : 'text-ink-secondary'}>活跃工作区</Button>
          <Button onClick={() => setShowArchived(true)} className={showArchived ? 'text-primary' : 'text-ink-secondary'}>已归档</Button>
        </div>

        {!loaded || loading ? <ResourceSkeleton variant="cards" count={6} className="min-h-64" label="正在加载工作区" />
          : error ? <div className="rounded-2xl border border-coral/30 bg-coral-soft/30 p-5 text-sm text-coral-deep">{error}</div>
            : visible.length === 0 ? <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-hairline bg-panel/40 text-sm text-ink-secondary">没有符合条件的工作区</div>
              : <ItemGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((workspace) => (
                  <Item key={workspace.id} role="button" tabIndex={0} onClick={() => void select(workspace.id)} onKeyDown={(event) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); void select(workspace.id) }} className="group min-h-52 cursor-pointer content-start rounded-2xl border-hairline bg-panel p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid size-11 place-items-center rounded-xl text-lg font-bold text-primary-foreground" style={{ background: workspace.color ?? 'var(--primary)' }}>{workspace.name.slice(0, 1).toUpperCase()}</span>
                      {workspace.isDefault && <span className="rounded-full bg-raised px-2 py-1 text-[10px] font-semibold text-ink-secondary">默认</span>}
                      {workspace.status === 'ARCHIVED' && <span className="rounded-full bg-raised px-2 py-1 text-[10px] font-semibold text-ink-secondary">已归档</span>}
                    </div>
                    <ItemContent className="basis-full gap-1"><ItemTitle className="mt-5 block w-full truncate text-lg font-semibold text-ink group-hover:text-primary">{workspace.name}</ItemTitle>
                    <ItemDescription className="line-clamp-2 min-h-10 text-xs leading-5 text-ink-secondary">{workspace.description || '空白工作区，等待你的第一份资料或第一次对话。'}</ItemDescription></ItemContent>
                    <div className="mt-5 flex items-center gap-3 border-t border-hairline pt-4 text-[11px] text-ink-secondary"><span>{workspace.sourceCount} 来源</span><span>{workspace.conversationCount} 对话</span><span>{workspace.documentCount + workspace.calendarEventCount + workspace.canvasCount} 工件</span><span className="ml-auto">{relativeTime(workspace.lastVisitedAt ?? workspace.updatedAt)}</span></div>
                  </Item>
                ))}
              </ItemGroup>}
      </div>

      {creating && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/30 p-5 backdrop-blur-sm" onMouseDown={() => setCreating(false)}>
        <form onSubmit={(event) => { event.preventDefault(); void submit() }} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl border border-hairline bg-panel p-6 shadow-2xl">
          <h2 className="text-xl font-semibold">新建空白工作区</h2>
          <p className="mt-1 text-xs text-ink-secondary">不会自动创建资料、群聊或智能助教会话。</p>
          <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="工作区名称" className="mt-5 h-11 w-full rounded-xl border border-hairline bg-app px-3 text-sm outline-none focus:border-ring" />
          <div className="mt-5 flex justify-end gap-2"><Button type="button" onClick={() => setCreating(false)} className="h-10 rounded-xl px-4 text-sm text-ink-secondary hover:bg-raised">取消</Button><Button type="submit" disabled={!name.trim()} className="h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40">创建并进入</Button></div>
        </form>
      </div>}
    </main>
  )
}
