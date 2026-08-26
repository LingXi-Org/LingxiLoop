import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { type ApiSearchResults, api } from '@/api/client'
import { Avatar } from '@/components/Avatar'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { GroupCreator } from '@/components/GroupCreator'
import { IAgent, ICanvas, IDoc, IMail, IPlus, ISettings } from '@/components/icons'
import { ConversationListItemContent } from '@/im/ConversationList'
import { isMockImDevelopment } from '@/lib/devMode'
import { cn } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { isMuted, useConversations } from '@/stores/conversations'
import { useParticipants } from '@/stores/participants'
import type { Conversation, Participant } from '@/types'
import { SidebarFooter } from './SidebarFooter'

const SearchIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
)

function ConversationRow({ conversation, selected, onMenu }: {
  conversation: Conversation
  selected: boolean
  onMenu: (event: React.MouseEvent) => void
}) {
  const select = useApp((s) => s.selectConversation)
  return (
    <button
      type="button"
      onClick={() => select(conversation.id)}
      onContextMenu={onMenu}
      className={cn(
        'group flex w-full items-center gap-2 rounded-xl px-[9px] py-[9px] text-left transition-colors',
        selected ? 'bg-accent text-white' : 'text-ink hover:bg-raised/70',
      )}
    >
      <ConversationListItemContent conversation={conversation} variant="desktop" selected={selected} />
    </button>
  )
}

function AddMembersDialog({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const all = useParticipants((s) => Object.values(s.byId))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const candidates = all.filter((p) => !conversation.members.includes(p.id) && !p.departedAt)
  const add = async (participant: Participant) => {
    setBusy(participant.id); setError(null)
    try {
      await api.addMember(conversation.id, participant.id)
      await useConversations.getState().reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="flex max-h-[70vh] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border border-hairline bg-card shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-hairline px-5 py-4">
          <h2 className="text-[16px] font-semibold text-ink">添加群成员</h2>
          <p className="mt-1 text-[12px] text-ink-secondary">选择要加入“{conversation.title}”的成员。</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {candidates.length === 0 && <p className="px-3 py-8 text-center text-[13px] text-ink-secondary">所有成员都已在群聊中</p>}
          {candidates.map((p) => (
            <button key={p.id} type="button" disabled={busy !== null} onClick={() => void add(p)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-raised disabled:opacity-50">
              <Avatar p={p} size={34} ringColor="var(--card)" showStatus={false} />
              <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{p.name}</span>
              <span className="text-[12px] text-accent">{busy === p.id ? '添加中…' : '添加'}</span>
            </button>
          ))}
          {error && <p className="m-3 rounded-lg bg-red-500/10 px-3 py-2 text-[12px] text-red-400">{error}</p>}
        </div>
        <div className="border-t border-hairline p-3 text-right"><button type="button" onClick={onClose} className="rounded-full bg-raised px-4 py-2 text-[13px] text-ink hover:bg-raised-hover">完成</button></div>
      </div>
    </div>
  )
}

export function ConversationsPane() {
  const mockMode = isMockImDevelopment()
  const list = useConversations((s) => s.list)
  const loaded = useConversations((s) => s.loaded)
  const selected = useApp((s) => s.selectedConversationId)
  const select = useApp((s) => s.selectConversation)
  const authUser = useAuth((s) => s.user)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ApiSearchResults | null>(null)
  const [searching, setSearching] = useState(false)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [creating, setCreating] = useState<string[] | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const [addingMembers, setAddingMembers] = useState<Conversation | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const focusSearch = () => { searchRef.current?.focus(); searchRef.current?.select() }
    const createGroup = () => setCreating([])
    window.addEventListener('lingxiloop:focus-conversation-search', focusSearch)
    window.addEventListener('lingxiloop:new-group', createGroup)
    return () => {
      window.removeEventListener('lingxiloop:focus-conversation-search', focusSearch)
      window.removeEventListener('lingxiloop:new-group', createGroup)
    }
  }, [])

  useEffect(() => {
    const value = query.trim()
    if (!value) { setResults(null); setSearching(false); return }
    if (mockMode) { setResults(null); setSearching(false); return }
    const controller = new AbortController()
    setSearching(true)
    const timer = window.setTimeout(() => {
      api.search(value, controller.signal)
        .then((next) => setResults(next))
        .catch((error) => { if ((error as { name?: string }).name !== 'AbortError') console.warn('[search] failed', error) })
        .finally(() => setSearching(false))
    }, 150)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, mockMode])

  const conversations = useMemo(() => {
    const visible = list
    return [...visible.filter((c) => c.pinned), ...visible.filter((c) => !c.pinned)]
  }, [list])

  const resultRows = useMemo(() => {
    if (mockMode) {
      const value = query.trim().toLocaleLowerCase()
      if (!value) return [] as Array<{ id: string; title: string; preview: string }>
      return list
        .filter((conversation) => `${conversation.title} ${conversation.preview ?? ''}`.toLocaleLowerCase().includes(value))
        .map((conversation) => ({ id: conversation.id, title: conversation.title, preview: conversation.preview ?? '会话' }))
    }
    if (!results) return [] as Array<{ id: string; title: string; preview: string }>
    const unique = new Map<string, { id: string; title: string; preview: string }>()
    for (const room of [...results.rooms, ...results.groups]) unique.set(room.id, { id: room.id, title: room.title, preview: room.projectName ?? '会话' })
    for (const message of results.messages) unique.set(message.conversationId, { id: message.conversationId, title: message.conversationTitle, preview: `${message.authorName ?? '成员'}：${message.snippet}` })
    return [...unique.values()]
  }, [list, mockMode, query, results])

  const openContextMenu = (conversation: Conversation, event: React.MouseEvent) => {
    event.preventDefault()
    const items: ContextMenuItem[] = [
      { label: conversation.pinned ? '取消置顶' : '置顶会话', onSelect: () => void api.togglePin(conversation.id, !conversation.pinned).then(() => useConversations.getState().reload()) },
      { label: isMuted(conversation) ? '取消静音' : '静音会话', onSelect: () => void api.setMute(conversation.id, !isMuted(conversation), null).then(() => useConversations.getState().reload()) },
    ]
    if (conversation.kind === 'group') {
      items.push({ label: '添加成员…', onSelect: () => setAddingMembers(conversation) })
      items.push({ label: '退出群聊', destructive: true, onSelect: () => void api.leaveConversation(conversation.id).then(async () => { await useConversations.getState().reload(); if (selected === conversation.id) select(null) }) })
    } else {
      const other = conversation.members.find((id) => id !== authUser?.id)
      if (other) items.push({ label: '创建包含此成员的群聊…', onSelect: () => setCreating([other]) })
    }
    setMenu({ x: event.clientX, y: event.clientY, items })
  }

  return (
    <aside className="im-conversations-sidebar relative flex h-full min-h-0 flex-col border-r border-hairline bg-panel text-ink">
      <div className="desktop-window-toolbar omb-drag flex h-16 shrink-0 items-center gap-2.5 px-[13px] py-2">
        <div className="relative omb-no-drag">
          <button type="button" aria-expanded={launcherOpen} aria-haspopup="menu" onClick={() => setLauncherOpen((open) => !open)} className="grok-top-menu-trigger" aria-label="打开主菜单">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          {launcherOpen && (
            <>
              <button type="button" aria-label="关闭主菜单" className="fixed inset-0 z-30 cursor-default" onClick={() => setLauncherOpen(false)} />
              <div className="app-menu-surface grok-top-menu absolute left-0 top-full z-40 mt-1 min-w-[216px] overflow-hidden p-1" role="menu" aria-label="LingxiLoop">
                <div className="grok-top-menu-label">LingxiLoop</div>
                <button type="button" onClick={() => { setLauncherOpen(false); setCreating([]) }} className="app-menu-item"><span className="app-menu-icon"><IPlus /></span>新建群聊</button>
                <button type="button" onClick={() => { setLauncherOpen(false); useApp.getState().openComposeNew() }} className="app-menu-item"><span className="app-menu-icon"><IMail /></span>写邮件</button>
                <div className="my-1 h-px bg-hairline" />
                {([
                  ['learning', '学习', IDoc],
                  ['agents', '智能体', IAgent],
                  ['canvas', 'Canvas', ICanvas],
                  ['library', '资料库', IDoc],
                ] as const).map(([key, label, Icon]) => (
                  <button key={key} type="button" onClick={() => { useApp.getState().setView(key); setLauncherOpen(false) }} className="app-menu-item">
                    <span className="app-menu-icon"><Icon /></span>{label}
                  </button>
                ))}
                <div className="my-1 h-px bg-hairline" />
                <button type="button" onClick={() => { useApp.getState().setView('me'); setLauncherOpen(false) }} className="app-menu-item"><span className="app-menu-icon"><ISettings /></span>设置</button>
              </div>
            </>
          )}
        </div>
        <div className="omb-no-drag flex h-11 min-w-0 flex-1 items-center rounded-[22px] border-2 border-raised bg-raised pe-[3px] transition-colors focus-within:border-accent focus-within:bg-panel">
          <span className="ms-3 grid size-6 shrink-0 place-items-center"><SearchIcon className="size-6 text-ink-secondary" /></span>
          <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }} placeholder="搜索" aria-label="搜索会话和消息" className="h-10 w-full min-w-0 bg-transparent px-3 text-[15px] text-ink placeholder:text-ink-secondary focus:outline-none" />
          {query && <button type="button" onClick={() => setQuery('')} className="text-xs text-ink-secondary hover:text-ink" aria-label="清除搜索">×</button>}
        </div>
      </div>

      <div className="min-h-0 flex-1 px-2">
        {query.trim() ? (
          <div className="h-full overflow-y-auto">
            {searching && <p className="px-3 py-5 text-[13px] text-ink-secondary">正在搜索…</p>}
            {!searching && resultRows.length === 0 && <p className="px-3 py-5 text-[13px] text-ink-secondary">没有找到匹配结果</p>}
            {resultRows.map((row) => <button key={row.id} type="button" onClick={() => { select(row.id); setQuery('') }} className="w-full rounded-xl px-3 py-3 text-left hover:bg-raised"><span className="block truncate text-[14px] font-semibold text-ink">{row.title}</span><span className="mt-0.5 block truncate text-[12px] text-ink-secondary">{row.preview}</span></button>)}
          </div>
        ) : (
          <Virtuoso
            className="h-full"
            data={conversations}
            computeItemKey={(_, conversation) => conversation.id}
            defaultItemHeight={72}
            increaseViewportBy={{ top: 500, bottom: 500 }}
            components={{ EmptyPlaceholder: () => <p className="px-3 py-8 text-center text-[13px] text-ink-secondary">{loaded ? '还没有会话' : '正在加载会话…'}</p>, Footer: () => <div className="h-3" /> }}
            itemContent={(_, conversation) => <ConversationRow conversation={conversation} selected={selected === conversation.id} onMenu={(event) => openContextMenu(conversation, event)} />}
          />
        )}
      </div>

      <SidebarFooter />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {creating && <GroupCreator initialPicked={creating} onClose={() => setCreating(null)} />}
      {addingMembers && <AddMembersDialog conversation={addingMembers} onClose={() => setAddingMembers(null)} />}
    </aside>
  )
}
