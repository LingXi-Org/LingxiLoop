import { Cancel01Icon, Notification01Icon, NotificationOff01Icon, PinIcon, PinOffIcon, SearchIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type React from 'react'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { Avatar } from '@/components/Avatar'
import { NavUser } from '@/components/nav-user'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar'
import { useParticipants } from '@/features/agents/state'
import { conversationsApi } from '@/features/conversations/api'
import { isMuted, useConversations } from '@/features/conversations/store'
import { useWorkspace } from '@/features/knowledge/workspace'
import { useIsMobile } from '@/hooks/use-mobile'
import { ConversationListItemContent } from '@/im/ConversationList'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { cn } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import type { Conversation, Participant } from '@/types'
import type { ConversationSearchResults } from '../contracts'

interface ConversationMenuItem {
  label: string
  onSelect?: () => void
  icon?: React.ReactNode
  destructive?: boolean
  hint?: string
  disabled?: boolean
  submenu?: ConversationMenuItem[]
}

const ConversationItemGroup = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <ItemGroup ref={ref} className={cn('!gap-0', className)} {...props} />,
)
ConversationItemGroup.displayName = 'ConversationItemGroup'

const ConversationListRow = forwardRef<HTMLDivElement, {
  children: React.ReactNode
  selected?: boolean
  mobile?: boolean
  onSelect: () => void
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'>>(
  ({ children, selected = false, mobile = false, onSelect, className, ...props }, ref) => (
    <Item
      ref={ref}
      role="button"
      tabIndex={0}
      size="xs"
      aria-current={selected ? 'page' : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect()
      }}
      className={cn(
        'group cursor-pointer flex-nowrap gap-2.5 overflow-hidden rounded-xl border-0 text-left shadow-none',
        mobile ? 'h-17 min-h-17 max-h-17 px-3 py-2' : 'h-15 min-h-15 max-h-15 px-2 py-1.5',
        selected
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </Item>
  ),
)
ConversationListRow.displayName = 'ConversationListRow'

function ConversationMenuItems({ items }: { items: ConversationMenuItem[] }) {
  return items.map((item, index) => {
    const content = <>{item.icon}<span className="flex-1">{item.label}</span>{item.hint && <ContextMenuShortcut>{item.hint}</ContextMenuShortcut>}</>
    if (item.submenu?.length) return <ContextMenuSub key={`${item.label}:${index}`}><ContextMenuSubTrigger disabled={item.disabled}>{content}</ContextMenuSubTrigger><ContextMenuSubContent><ConversationMenuItems items={item.submenu} /></ContextMenuSubContent></ContextMenuSub>
    return <ContextMenuItem key={`${item.label}:${index}`} disabled={item.disabled} variant={item.destructive ? 'destructive' : 'default'} onClick={item.onSelect}>{content}</ContextMenuItem>
  })
}

function ConversationRow({ conversation, selected, items, onConversationSelected }: {
  conversation: Conversation
  selected: boolean
  items: ConversationMenuItem[]
  onConversationSelected?: (conversationId: string) => void
}) {
  const isMobile = useIsMobile()
  const select = useApp((s) => s.selectConversation)
  return (
    <ContextMenu>
    <ContextMenuTrigger asChild>
      <ConversationListRow mobile={isMobile} selected={selected} onSelect={() => { select(conversation.id); onConversationSelected?.(conversation.id) }}>
        <ConversationListItemContent conversation={conversation} selected={selected} variant={isMobile ? 'mobile' : 'desktop'} />
      </ConversationListRow>
    </ContextMenuTrigger>
    <ContextMenuContent aria-label="会话操作" className="min-w-[200px]"><ConversationMenuItems items={items} /></ContextMenuContent>
    </ContextMenu>
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
      await conversationsApi.addMember(conversation.id, participant.id)
      await useConversations.getState().reload()
    } catch (reason) {
      setError(userFacingError(reason, '暂时无法搜索对话，请稍后重试。'))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="flex max-h-[70vh] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">添加群成员</h2>
          <p className="mt-1 text-xs text-muted-foreground">选择要加入“{conversation.title}”的成员。</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {candidates.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">所有成员都已在群聊中</p>}
          <ItemGroup className="gap-1">{candidates.map((p) => (
            <Item key={p.id} role="button" tabIndex={busy === null ? 0 : undefined} size="sm" aria-disabled={busy !== null || undefined} onClick={() => { if (busy === null) void add(p) }} onKeyDown={(event) => { if (busy !== null || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); void add(p) }} className="cursor-pointer flex-nowrap rounded-xl hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-50">
              <Avatar p={p} size={34} ringColor="var(--card)" />
              <ItemContent className="min-w-0"><ItemTitle className="block w-full truncate text-sm text-foreground">{p.name}</ItemTitle></ItemContent>
              <span className="text-xs text-primary">{busy === p.id ? '添加中…' : '添加'}</span>
            </Item>
          ))}</ItemGroup>
          {error && <p className="m-3 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{userFacingError(error, '搜索失败，请稍后重试。')}</p>}
        </div>
        <div className="border-t border-border p-3 text-right"><Button type="button" onClick={onClose} size="sm">完成</Button></div>
      </div>
    </div>
  )
}

export function SidebarUserFooter() {
  const authUser = useAuth((s) => s.user)
  const authParticipant = useParticipants((s) => authUser ? s.byId[authUser.id] : undefined)
  if (!authUser) return null
  return <SidebarFooter className="shrink-0 border-t border-[var(--im-divider-weak)] bg-sidebar p-2"><NavUser user={{ name: authUser.name, email: authUser.email, avatar: authParticipant?.avatarUrl }} /></SidebarFooter>
}

export function ConversationsPane({ onConversationSelected }: { onConversationSelected?: (conversationId: string) => void } = {}) {
  const isMobile = useIsMobile()
  const workspaceTitle = useWorkspace((state) => state.list.find((workspace) => workspace.id === state.selectedId)?.name)
  const list = useConversations((s) => s.list)
  const loaded = useConversations((s) => s.loaded)
  const error = useConversations((s) => s.error)
  const selected = useApp((s) => s.selectedConversationId)
  const select = useApp((s) => s.selectConversation)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ConversationSearchResults | null>(null)
  const [searching, setSearching] = useState(false)
  const [addingMembers, setAddingMembers] = useState<Conversation | null>(null)
  const [pendingPreferences, setPendingPreferences] = useState<Set<string>>(() => new Set())
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const focusSearch = () => { searchRef.current?.focus(); searchRef.current?.select() }
    window.addEventListener('lingxiloop:focus-conversation-search', focusSearch)
    return () => {
      window.removeEventListener('lingxiloop:focus-conversation-search', focusSearch)
    }
  }, [])

  useEffect(() => {
    const value = query.trim()
    if (!value) { setResults(null); setSearching(false); return }
    const controller = new AbortController()
    setSearching(true)
    const timer = window.setTimeout(() => {
      conversationsApi.search(value, controller.signal)
        .then((next) => setResults(next))
        .catch((error) => { if ((error as { name?: string }).name !== 'AbortError') console.warn('[search] failed', error) })
        .finally(() => setSearching(false))
    }, 150)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query])

  const conversations = useMemo(() => {
    const visible = list.filter((conversation) => conversation.kind !== 'email')
    return [...visible.filter((c) => c.pinned), ...visible.filter((c) => !c.pinned)]
  }, [list])

  const resultRows = useMemo(() => {
    if (!results) return [] as Array<{ id: string; title: string; preview: string }>
    const visibleIds = new Set(list.filter((conversation) => conversation.kind !== 'email').map((conversation) => conversation.id))
    const unique = new Map<string, { id: string; title: string; preview: string }>()
    for (const room of results.rooms) if (visibleIds.has(room.id)) unique.set(room.id, { id: room.id, title: room.title, preview: room.projectName ?? '私信' })
    for (const group of results.groups) if (visibleIds.has(group.id)) unique.set(group.id, { id: group.id, title: group.title, preview: group.projectName ?? '群聊' })
    for (const message of results.messages) if (visibleIds.has(message.conversationId)) unique.set(message.conversationId, { id: message.conversationId, title: message.conversationTitle, preview: `${message.authorName ?? '成员'}：${message.snippet}` })
    return [...unique.values()]
  }, [list, results])

  const updatePreference = async (conversation: Conversation, preference: 'pin' | 'mute') => {
    const key = `${conversation.id}:${preference}`
    setPendingPreferences((current) => new Set(current).add(key))
    const nextPinned = !conversation.pinned
    const nextMuted = !isMuted(conversation)
    try {
      const mutation = preference === 'pin'
        ? conversationsApi.togglePin(conversation.id, nextPinned)
        : conversationsApi.setMute(conversation.id, nextMuted, null)
      await toastAction(mutation.then(async (result) => {
        await useConversations.getState().reload()
        return result
      }), {
        loading: preference === 'pin' ? '正在更新置顶状态' : '正在更新静音状态',
        success: preference === 'pin'
          ? (nextPinned ? '会话已置顶' : '已取消置顶')
          : (nextMuted ? '会话已静音' : '已取消静音'),
        error: preference === 'pin' ? '置顶状态更新失败' : '静音状态更新失败',
        description: conversation.title,
      })
    } catch { /* toast owns the visible error state */ }
    finally {
      setPendingPreferences((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  const conversationMenuItems = (conversation: Conversation): ConversationMenuItem[] => {
    const pinned = Boolean(conversation.pinned)
    const muted = isMuted(conversation)
    const items: ConversationMenuItem[] = [
      {
        label: pinned ? '取消置顶' : '置顶会话',
        icon: <HugeiconsIcon icon={pinned ? PinOffIcon : PinIcon} strokeWidth={2} />,
        disabled: pendingPreferences.has(`${conversation.id}:pin`),
        onSelect: () => void updatePreference(conversation, 'pin'),
      },
      {
        label: muted ? '取消静音' : '静音会话',
        icon: <HugeiconsIcon icon={muted ? Notification01Icon : NotificationOff01Icon} strokeWidth={2} />,
        disabled: pendingPreferences.has(`${conversation.id}:mute`),
        onSelect: () => void updatePreference(conversation, 'mute'),
      },
    ]
    if (conversation.kind === 'group' && conversation.tag !== 'teacher') {
      items.push({ label: '添加成员…', onSelect: () => setAddingMembers(conversation) })
      items.push({
        label: '退出群聊',
        destructive: true,
        onSelect: async () => {
          if (!await confirmSensitiveAction({
            title: '退出群聊？',
            description: `退出“${conversation.title}”后，其他成员仍可继续对话。`,
            confirmLabel: '退出群聊',
            tone: 'destructive',
          })) return
          try {
            await toastAction(conversationsApi.leaveConversation(conversation.id), { loading: '正在退出群聊', success: '已退出群聊', error: '退出群聊失败' })
            await useConversations.getState().reload()
            if (selected === conversation.id) select(null)
          } catch { /* toast owns the visible error state */ }
        },
      })
    }
    return items
  }

  return (
    <aside data-slot="sidebar" className="im-conversations-sidebar relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
      <SidebarHeader className={cn('desktop-window-toolbar omb-drag shrink-0', isMobile ? 'gap-2 px-3 pb-2 pt-3' : 'h-12 p-2')}>
        {isMobile && <h1 className="truncate px-1 font-heading text-xl font-medium text-foreground" data-mobile-workspace-title>{workspaceTitle ?? '会话'}</h1>}
        <InputGroup className={cn('omb-no-drag rounded-xl border-transparent bg-input/50 shadow-none', isMobile ? 'h-10' : 'h-8')}>
          <InputGroupInput ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }} placeholder="搜索会话" aria-label="搜索会话和消息" className={cn('px-2 text-sm', isMobile ? 'h-10' : 'h-8')} />
          <InputGroupAddon><HugeiconsIcon icon={SearchIcon} strokeWidth={2} className="size-4 opacity-50" /></InputGroupAddon>
          {query && <InputGroupAddon align="inline-end"><Button type="button" variant="ghost" size="icon-xs" className={isMobile ? 'size-8' : undefined} onClick={() => setQuery('')} aria-label="清除搜索"><HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} /></Button></InputGroupAddon>}
        </InputGroup>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-2 pb-2 pt-0.5">
        {query.trim() ? (
          <div className="h-full overflow-y-auto">
            {searching && <ResourceSkeleton variant="list" count={4} compact label="正在搜索会话" />}
            {!searching && resultRows.length === 0 && <p className="px-3 py-5 text-sm text-muted-foreground">没有找到匹配结果</p>}
            <ItemGroup className="!gap-0">
              {resultRows.map((row) => (
                <ConversationListRow key={row.id} mobile={isMobile} selected={selected === row.id} onSelect={() => { select(row.id); onConversationSelected?.(row.id); setQuery('') }}>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="block w-full truncate text-sm font-medium text-sidebar-foreground">{row.title}</ItemTitle>
                    <ItemDescription className="line-clamp-1 text-xs text-muted-foreground">{row.preview}</ItemDescription>
                  </ItemContent>
                </ConversationListRow>
              ))}
            </ItemGroup>
          </div>
        ) : (
          <div className="relative min-h-0 flex-1">
          {error && conversations.length > 0 && <div role="alert" className="absolute inset-x-2 top-2 z-10 flex items-center gap-2 rounded-xl border border-destructive/30 bg-background/95 px-3 py-2 text-xs text-destructive shadow-sm"><span className="min-w-0 flex-1 truncate">{userFacingError(error, '会话刷新失败，请稍后重试。')}</span><Button type="button" variant="ghost" size="sm" onClick={() => void useConversations.getState().reload()}>重试</Button></div>}
          <Virtuoso
            className="h-full"
            data={conversations}
            computeItemKey={(_, conversation) => conversation.id}
            defaultItemHeight={isMobile ? 68 : 60}
            increaseViewportBy={{ top: 500, bottom: 500 }}
            components={{ List: ConversationItemGroup, EmptyPlaceholder: () => error ? <div role="alert" className="px-4 py-10 text-center"><p className="text-sm font-medium text-foreground">会话加载失败</p><p className="mt-1 text-xs text-muted-foreground">{userFacingError(error, '请稍后重试。')}</p><Button type="button" size="sm" className="mt-3" onClick={() => void useConversations.getState().load()}>重试</Button></div> : loaded ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">还没有会话</p> : <ResourceSkeleton variant="list" count={6} compact label="正在加载会话" />, Footer: () => <div className="h-3" /> }}
            itemContent={(_, conversation) => <ConversationRow conversation={conversation} selected={selected === conversation.id} items={conversationMenuItems(conversation)} onConversationSelected={onConversationSelected} />}
          />
          </div>
        )}
      </SidebarContent>

      {addingMembers && <AddMembersDialog conversation={addingMembers} onClose={() => setAddingMembers(null)} />}
    </aside>
  )
}
