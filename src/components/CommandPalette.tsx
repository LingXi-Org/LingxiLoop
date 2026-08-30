import { useMemo } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import type { CommandAction } from '@/lib/commands'
import { useApp } from '@/stores/app'
import { useConversations } from '@/features/conversations/store'
import { useTheme } from '@/stores/theme'
import { useUiCommands } from '@/stores/uiCommands'

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const conversations = useConversations((state) => state.list)
  const { toggleTheme } = useTheme()
  const actions = useMemo<CommandAction[]>(() => {
    const dispatch = useUiCommands.getState().dispatch
    return [
      { id: 'conversation-search', label: '搜索会话和消息', keywords: 'search conversations', run: () => dispatch('focus-conversation-search') },
      { id: 'find-chat', label: '搜索当前对话', keywords: 'find chat', shortcut: '⌘ F', run: () => dispatch('find-chat') },
      { id: 'focus-composer', label: '聚焦消息输入框', keywords: 'focus composer input', run: () => dispatch('focus-composer') },
      { id: 'agents', label: '打开智能体', keywords: 'agents', run: () => useApp.getState().setView('agents') },
      { id: 'canvas', label: '打开 Canvas', keywords: 'canvas', run: () => useApp.getState().setView('canvas') },
      { id: 'library', label: '打开资料库', keywords: 'library documents', run: () => useApp.getState().setView('library') },
      { id: 'trust', label: '打开 Trust Board', keywords: 'trust evidence eval kpi', run: () => useApp.getState().openTrust() },
      { id: 'settings', label: '打开设置', keywords: 'settings preferences', run: () => useApp.getState().setView('me') },
      { id: 'theme', label: '切换浅色 / 深色模式', keywords: 'theme light dark', run: toggleTheme },
      ...conversations.slice(0, 8).map((conversation, index) => ({
        id: `conversation-${conversation.id}`,
        label: `转到：${conversation.title}`,
        keywords: `${conversation.title} ${conversation.preview ?? ''}`,
        shortcut: index < 9 ? `⌘ ${index + 1}` : undefined,
        run: () => useApp.getState().selectConversation(conversation.id),
      })),
    ]
  }, [conversations, toggleTheme])

  const run = (action: CommandAction) => {
    onClose()
    window.requestAnimationFrame(action.run)
  }

  return (
    <CommandDialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <CommandInput placeholder="输入命令或会话名称…" />
      <CommandList>
        <CommandEmpty>没有匹配的命令</CommandEmpty>
        {actions.map((action) => (
          <CommandItem key={action.id} value={`${action.label} ${action.keywords ?? ''}`} onSelect={() => run(action)}>
            <span>{action.label}</span>
            {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
          </CommandItem>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
