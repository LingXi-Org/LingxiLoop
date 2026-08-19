import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { api, type ApiSearchResults } from '@/api/client'
import { Avatar, AvatarStack } from '@/components/Avatar'
import { CompanySwitcher } from '@/components/CompanySwitcher'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { GroupCreator } from '@/components/GroupCreator'
import { ThemeToggle } from '@/components/ThemeToggle'
import { isElectron, isMac } from '@/lib/runtime'
import { cn } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { isMuted, useConversations } from '@/stores/conversations'
import { useMessages } from '@/stores/messages'
import { useParticipants } from '@/stores/participants'
import type { Conversation, Participant } from '@/types'

const SearchIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
)

const PlusIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const MoreIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
    <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
  </svg>
)

function ConversationAvatar({ conversation }: { conversation: Conversation }) {
  const byId = useParticipants((s) => s.byId)
  const meId = useAuth((s) => s.user?.id)
  const members = conversation.members
    .filter((id) => id !== meId)
    .map((id) => byId[id])
    .filter((p): p is Participant => Boolean(p))

  if (conversation.kind === 'group' || members.length > 1) {
    return (
      <div className="flex size-14 shrink-0 items-center justify-center">
        {members.length > 0
          ? <AvatarStack ps={members} size={34} max={3} />
          : <span className="grid size-12 place-items-center rounded-full bg-raised text-lg text-ink-secondary">群</span>}
      </div>
    )
  }
  const person = members[0]
  if (person) return <Avatar p={person} size={52} ringColor="var(--panel)" />
  return (
    <span className="grid size-[52px] shrink-0 place-items-center rounded-full bg-raised text-[17px] font-semibold text-ink">
      {conversation.kind === 'email' ? '邮' : conversation.title.charAt(0).toUpperCase()}
    </span>
  )
}

function ConversationRow({ conversation, selected, onMenu }: {
  conversation: Conversation
  selected: boolean
  onMenu: (event: React.MouseEvent) => void
}) {
  const select = useApp((s) => s.selectConversation)
  const typing = useMessages((s) => (s.typing[conversation.id] ?? []).length > 0)
  const muted = isMuted(conversation)
  return (
    <button
      type="button"
      onClick={() => select(conversation.id)}
      onContextMenu={onMenu}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
        selected ? 'bg-raised text-ink' : 'text-ink hover:bg-raised/55',
      )}
    >
      <ConversationAvatar conversation={conversation} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-[15px] font-semibold text-ink">
            {conversation.pinned && <span className="text-[11px] text-ink-secondary" aria-label="已置顶">◆</span>}
            <span className="truncate">{conversation.title}</span>
          </span>
          <span className="shrink-0 text-xs tabular-nums text-ink-secondary">{conversation.lastAt}</span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={cn('truncate text-[13px]', typing ? 'text-accent' : 'text-ink-secondary')}>
            {typing ? '正在输入…' : (conversation.preview || '还没有消息')}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {muted && <span className="text-[11px] text-ink-secondary" title="已静音">⌁</span>}
            {(conversation.unread ?? 0) > 0 && (
              <span className="grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-white">
                {conversation.unread! > 99 ? '99+' : conversation.unread}
              </span>
            )}
          </span>
        </span>
      </span>
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
  const list = useConversations((s) => s.list)
  const loaded = useConversations((s) => s.loaded)
  const selected = useApp((s) => s.selectedConversationId)
  const select = useApp((s) => s.selectConversation)
  const authUser = useAuth((s) => s.user)
  const me = useParticipants((s) => authUser?.id ? s.byId[authUser.id] : undefined)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ApiSearchResults | null>(null)
  const [searching, setSearching] = useState(false)
  const [plusOpen, setPlusOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [creating, setCreating] = useState<string[] | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const [addingMembers, setAddingMembers] = useState<Conversation | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); searchRef.current?.focus(); searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const value = query.trim()
    if (!value) { setResults(null); setSearching(false); return }
    const controller = new AbortController()
    setSearching(true)
    const timer = window.setTimeout(() => {
      api.search(value, controller.signal)
        .then((next) => setResults(next))
        .catch((error) => { if ((error as { name?: string }).name !== 'AbortError') console.warn('[search] failed', error) })
        .finally(() => setSearching(false))
    }, 150)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query])

  const conversations = useMemo(() => {
    const visible = list.filter((c) => c.kind !== 'whisper')
    return [...visible.filter((c) => c.pinned), ...visible.filter((c) => !c.pinned)]
  }, [list])

  const resultRows = useMemo(() => {
    if (!results) return [] as Array<{ id: string; title: string; preview: string }>
    const unique = new Map<string, { id: string; title: string; preview: string }>()
    for (const room of [...results.rooms, ...results.groups]) unique.set(room.id, { id: room.id, title: room.title, preview: room.projectName ?? '会话' })
    for (const message of results.messages) unique.set(message.conversationId, { id: message.conversationId, title: message.conversationTitle, preview: `${message.authorName ?? '成员'}：${message.snippet}` })
    return [...unique.values()]
  }, [results])

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

  const fallback: Participant = {
    id: authUser?.id ?? 'me', kind: 'human', name: authUser?.name ?? '我', initial: (authUser?.name ?? '我').charAt(0),
    avatarBg: 'linear-gradient(135deg,#1084fe,#7c5cff)', status: 'avail',
  }

  return (
    <aside className="relative flex h-full min-h-0 flex-col border-r border-hairline bg-panel text-ink">
      <div className="desktop-window-toolbar omb-drag flex h-12 shrink-0 items-center justify-between px-4 pt-1">
        {!isElectron ? (
          <div className="flex items-center gap-2"><span className="size-3 rounded-full bg-[#ff5f57]" /><span className="size-3 rounded-full bg-[#febc2e]" /><span className="size-3 rounded-full bg-[#28c840]" /></div>
        ) : isMac ? <div className="w-[72px]" /> : <div />}
        <div className="relative omb-no-drag">
          <button type="button" onClick={() => setPlusOpen((open) => !open)} className="rounded-md p-1.5 text-ink-secondary hover:bg-raised hover:text-ink" aria-label="新建"><PlusIcon className="size-5" /></button>
          {plusOpen && (
            <><button type="button" aria-label="关闭菜单" className="fixed inset-0 z-30 cursor-default" onClick={() => setPlusOpen(false)} /><div className="absolute right-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-xl border border-hairline bg-card py-1.5 shadow-2xl">
              <button type="button" onClick={() => { setPlusOpen(false); setCreating([]) }} className="w-full px-3.5 py-2 text-left text-[14px] text-ink hover:bg-raised">新建群聊</button>
              <button type="button" onClick={() => { setPlusOpen(false); useApp.getState().openComposeNew() }} className="w-full px-3.5 py-2 text-left text-[14px] text-ink hover:bg-raised">写邮件</button>
            </div></>
          )}
        </div>
      </div>

      <div className="px-3 pb-3 pt-2">
        <div className="flex items-center gap-2 rounded-lg bg-raised/70 px-3 py-2">
          <SearchIcon className="size-4 text-ink-secondary" />
          <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }} placeholder="搜索会话和消息" aria-label="搜索会话和消息" className="w-full min-w-0 bg-transparent text-[14px] text-ink placeholder:text-ink-secondary focus:outline-none" />
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

      <div className="relative shrink-0 px-3 pb-3 pt-2">
        <button type="button" onClick={() => setAccountOpen((open) => !open)} className="flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-raised/70">
          <Avatar p={me ?? fallback} size={30} ringColor="var(--panel)" />
          <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{authUser?.name ?? '我的账号'}</span>
          <MoreIcon />
        </button>
        {accountOpen && (
          <><button type="button" aria-label="关闭账号菜单" className="fixed inset-0 z-30 cursor-default" onClick={() => setAccountOpen(false)} /><div className="absolute bottom-full left-3 right-3 z-40 mb-2 rounded-xl border border-hairline bg-card p-2 shadow-2xl">
            <div className="mb-1 rounded-lg bg-inset p-2"><CompanySwitcher zh /></div>
            <button type="button" onClick={() => { useApp.getState().setView('me'); setAccountOpen(false) }} className="flex h-9 w-full items-center rounded-lg px-3 text-left text-[13px] text-ink hover:bg-raised">个人设置</button>
            <ThemeToggle showLabel className="h-9 w-full justify-start px-3 text-[13px] text-ink" onToggle={() => setAccountOpen(false)} />
            <button type="button" onClick={() => { window.dispatchEvent(new Event('lingxiloop:open-updater')); setAccountOpen(false) }} className="flex h-9 w-full items-center rounded-lg px-3 text-left text-[13px] text-ink hover:bg-raised">检查更新</button>
            <button type="button" onClick={async () => { try { await api.authLogout() } catch { /* best effort */ } useAuth.getState().clear(); location.reload() }} className="flex h-9 w-full items-center rounded-lg px-3 text-left text-[13px] text-red-400 hover:bg-raised">退出登录</button>
          </div></>
        )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {creating && <GroupCreator initialPicked={creating} onClose={() => setCreating(null)} />}
      {addingMembers && <AddMembersDialog conversation={addingMembers} onClose={() => setAddingMembers(null)} />}
    </aside>
  )
}
