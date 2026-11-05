import { Cancel01Icon, Delete02Icon, Notification01Icon, NotificationOff01Icon, PinIcon, PinOffIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type React from 'react'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { SidebarContent, SidebarHeader } from '@/components/ui/sidebar'
import { conversationsApi } from '@/features/conversations/api'
import { captureConversationScope, isMuted, useConversations } from '@/features/conversations/store'
import { useWorkspace } from '@/features/knowledge/workspace'
import { useIsMobile } from '@/hooks/use-mobile'
import { ConversationListItemContent, PinnedConversationContent, pinnedTint } from '@/im/ConversationList'
import { notifyAction, toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { cn } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { useUiCommand } from '@/stores/uiCommands'
import type { Conversation } from '@/types'
import type { ConversationSearchResults } from '../contracts'
import { ConversationMembersDialog } from './ConversationMembersDialog'
import { NewConversationDialog } from './NewConversationDialog'
import { PinnedConversations, type PinnedMode } from './PinnedConversations'

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
  onSelect: () => void
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'>>(
  ({ children, selected = false, onSelect, className, ...props }, ref) => (
    <Item
      ref={ref}
      role="button"
      tabIndex={0}
      size="sm"
      variant={selected ? 'muted' : 'default'}
      aria-current={selected ? 'page' : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect()
      }}
      className={cn(
        'mb-0.5 cursor-pointer flex-nowrap gap-2.5 rounded-[10px] border-0 px-2.5 py-2 text-left hover:bg-accent/70 focus-visible:ring-inset',
        selected && 'bg-accent',
        className,
      )}
      {...props}
    >
      {children}
    </Item>
  ),
)
ConversationListRow.displayName = 'ConversationListRow'

function ConversationListHeader({ context }: { context?: { header: React.ReactNode } }) {
  return context?.header ?? null
}

function ConversationMenuItems({ items }: { items: ConversationMenuItem[] }) {
  return items.map((item, index) => {
    const content = <>{item.icon}<span className="flex-1">{item.label}</span>{item.hint && <ContextMenuShortcut>{item.hint}</ContextMenuShortcut>}</>
    if (item.submenu?.length) return <ContextMenuSub key={`${item.label}:${index}`}><ContextMenuSubTrigger disabled={item.disabled}>{content}</ContextMenuSubTrigger><ContextMenuSubContent><ConversationMenuItems items={item.submenu} /></ContextMenuSubContent></ContextMenuSub>
    return <ContextMenuItem key={`${item.label}:${index}`} disabled={item.disabled} variant={item.destructive ? 'destructive' : 'default'} onClick={item.onSelect}>{content}</ContextMenuItem>
  })
}

function ConversationRow({ conversation, selected, items, onConversationSelected, pinnedMode }: {
  conversation: Conversation
  selected: boolean
  items: ConversationMenuItem[]
  onConversationSelected?: (conversationId: string) => void
  pinnedMode?: PinnedMode
}) {
  const select = useApp((s) => s.selectConversation)
  return (
    <ContextMenu>
    <ContextMenuTrigger asChild>
      {pinnedMode ? <button type="button" data-pinned-conversation={pinnedMode} aria-current={selected ? 'page' : undefined}
        aria-label={[conversation.title, conversation.unread ? `${conversation.unread} 条未读消息` : '', isMuted(conversation) ? '已静音' : ''].filter(Boolean).join('，')} onClick={() => { select(conversation.id); onConversationSelected?.(conversation.id) }}
        style={{ backgroundColor: pinnedTint(conversation).surface }}
        className={cn('pinned-conversation relative flex w-full min-w-0 overflow-hidden rounded-xl text-start text-foreground outline-offset-2 transition-[filter] hover:brightness-[.97] dark:hover:brightness-110',
          pinnedMode === 'tile' ? 'min-h-[68px] flex-col items-center gap-1 px-1 py-2' : pinnedMode === 'wide' ? 'h-[76px] flex-col justify-center gap-[3px] ps-3 pe-32' : pinnedMode === 'compact' ? 'h-[72px] flex-col justify-between py-2.5 ps-[11px] pe-[70px]' : 'h-[84px] flex-col justify-between py-2.5 ps-[11px] pe-[34px]',
          selected && 'ring-1 ring-inset ring-brand')}>
        <PinnedConversationContent conversation={conversation} mode={pinnedMode} />
      </button> : <ConversationListRow selected={selected} onSelect={() => { select(conversation.id); onConversationSelected?.(conversation.id) }}>
        <ConversationListItemContent conversation={conversation} selected={selected} />
      </ConversationListRow>}
    </ContextMenuTrigger>
    <ContextMenuContent aria-label="会话操作" className="min-w-[200px]"><ConversationMenuItems items={items} /></ContextMenuContent>
    </ContextMenu>
  )
}

export function ConversationsPane({ onConversationSelected }: { onConversationSelected?: (conversationId: string) => void } = {}) {
  const isMobile = useIsMobile()
  const companyId = useAuth((state) => state.activeCompanyId)
  const projectId = useWorkspace((state) => state.selectedId)
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
  const uiCommand = useUiCommand()

  useEffect(() => {
    if (uiCommand?.type === 'focus-conversation-search') {
      searchRef.current?.focus()
      searchRef.current?.select()
    }
  }, [uiCommand])

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
    return visible
  }, [list])
  const pinned = conversations.filter(conversation => conversation.pinned)

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

  const removeConversation = async (conversation: Conversation) => {
    const current = captureConversationScope(), key = `${conversation.id}:delete`
    if (pendingPreferences.has(key)) return
    setPendingPreferences(previous => new Set(previous).add(key))
    try {
      if (!await confirmSensitiveAction({
        title: '删除对话？',
        description: `将“${conversation.title}”从你的列表移除。消息和成员关系会保留，你可在设置的“数据与账号”中恢复。`,
        confirmLabel: '删除对话', tone: 'destructive',
      }) || !current()) return
      if (await useConversations.getState().remove(conversation.id) && current()) {
        notifyAction({ title: '对话已从你的列表删除', description: '可在设置的“数据与账号”中恢复。' })
      }
    } catch (reason) {
      if (current()) notifyAction({ title: '删除对话失败', description: userFacingError(reason, '操作未完成，请稍后重试。'), type: 'error' })
    } finally {
      setPendingPreferences(previous => { const next = new Set(previous); next.delete(key); return next })
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
      items.push({ label: '管理成员…', onSelect: () => setAddingMembers(conversation) })
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
    items.push({
      label: pendingPreferences.has(`${conversation.id}:delete`) ? '正在删除…' : '删除对话',
      icon: <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />,
      destructive: true,
      disabled: pendingPreferences.has(`${conversation.id}:delete`),
      onSelect: () => void removeConversation(conversation),
    })
    return items
  }

  return (
    <aside data-slot="sidebar" aria-label="对话列表" className={cn('im-conversations-sidebar relative flex h-full min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-hidden bg-background text-foreground', isMobile ? 'py-2' : 'px-2 py-2.5')}>
      <SidebarHeader className="desktop-window-toolbar select-none shrink-0 gap-0 p-0">
        {isMobile && <h1 className="h-12 shrink-0 truncate px-4 font-heading text-xl font-medium leading-[48px] text-foreground" data-mobile-workspace-title>{workspaceTitle ?? '会话'}</h1>}
        <div className={cn('flex min-w-0 shrink-0 items-center gap-1', isMobile ? 'h-12 px-3' : 'h-9 ps-0.5')}>
          <label className={cn('flex min-w-0 flex-1 items-center gap-2 rounded-[9px] px-2.5 text-muted-foreground focus-within:bg-accent/60', isMobile ? 'h-11' : 'h-9')}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }} placeholder="搜索会话" aria-label="搜索会话和消息"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none" />
            {query && <button type="button" className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setQuery('')} aria-label="清除搜索"><HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" /></button>}
          </label>
          {companyId && projectId && <NewConversationDialog key={`${companyId}:${projectId}`} companyId={companyId} projectId={projectId} isMobile={isMobile} onCreated={(id) => {
            setQuery(''); select(id); onConversationSelected?.(id)
          }} />}
        </div>
      </SidebarHeader>

      <SidebarContent className={cn('gap-0 py-0', isMobile ? 'px-3' : 'px-0')}>
        {query.trim() ? (
          <div className="h-full overflow-y-auto">
            {searching && <ResourceSkeleton variant="list" count={4} compact label="正在搜索会话" />}
            {!searching && resultRows.length === 0 && <div className="ui-enter px-3 py-5 text-sm text-muted-foreground"><p>没有找到匹配结果</p><Button variant="outline" size="sm" className="mt-3" onClick={() => setQuery('')}>清除搜索</Button></div>}
            <ItemGroup className="!gap-0">
              {resultRows.map((row) => (
                <ContextMenu key={row.id}><ContextMenuTrigger asChild><ConversationListRow selected={selected === row.id} onSelect={() => { select(row.id); onConversationSelected?.(row.id); setQuery('') }}>
                  <ItemContent className="min-w-0">
                    <ItemTitle className={cn('block w-full truncate text-sm font-medium', selected === row.id ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground')}>{row.title}</ItemTitle>
                    <ItemDescription className="line-clamp-1 text-xs text-muted-foreground">{row.preview}</ItemDescription>
                  </ItemContent>
                </ConversationListRow></ContextMenuTrigger><ContextMenuContent aria-label="会话操作" className="min-w-[200px]">
                  <ConversationMenuItems items={conversationMenuItems(list.find(item => item.id === row.id)!)} />
                </ContextMenuContent></ContextMenu>
              ))}
            </ItemGroup>
          </div>
        ) : (
          <div className="relative min-h-0 flex-1">
          {error && conversations.length > 0 && <div role="alert" className="absolute inset-x-2 top-2 z-10 flex items-center gap-2 rounded-xl border border-destructive/30 bg-background/95 px-3 py-2 text-xs text-destructive shadow-sm"><span className="min-w-0 flex-1 truncate">{userFacingError(error, '会话刷新失败，请稍后重试。')}</span><Button type="button" variant="ghost" size="sm" onClick={() => void useConversations.getState().reload()}>重试</Button></div>}
          <Virtuoso
            className="conversation-list-scroll h-full"
            data={conversations}
            context={{ header: <><PinnedConversations conversations={pinned} renderConversation={(conversation, mode) => <ConversationRow conversation={conversation} selected={selected === conversation.id} items={conversationMenuItems(conversation)} onConversationSelected={onConversationSelected} pinnedMode={mode} />} />{conversations.length > 0 && <p className="px-2.5 pb-1 pt-2.5 text-xs text-muted-foreground">最近</p>}</> }}
            computeItemKey={(_, conversation) => conversation.id}
            defaultItemHeight={60}
            increaseViewportBy={{ top: 500, bottom: 500 }}
            components={{ List: ConversationItemGroup, Header: ConversationListHeader, EmptyPlaceholder: () => error ? <div role="alert" className="px-4 py-10 text-center"><p className="text-sm font-medium text-foreground">会话加载失败</p><p className="mt-1 text-xs text-muted-foreground">{userFacingError(error, '请稍后重试。')}</p><Button type="button" size="sm" className="mt-3" onClick={() => void useConversations.getState().load()}>重试</Button></div> : loaded ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">还没有会话</p> : <ResourceSkeleton variant="list" count={6} compact label="正在加载会话" />, Footer: () => <div className="h-3" /> }}
            itemContent={(_, conversation) => <ConversationRow conversation={conversation} selected={selected === conversation.id} items={conversationMenuItems(conversation)} onConversationSelected={onConversationSelected} />}
          />
          </div>
        )}
      </SidebarContent>

      {addingMembers && <ConversationMembersDialog conversation={addingMembers} onClose={() => setAddingMembers(null)} />}
    </aside>
  )
}
