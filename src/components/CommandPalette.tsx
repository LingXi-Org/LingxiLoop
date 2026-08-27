import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CommandAction } from '@/lib/commands'
import { useApp } from '@/stores/app'
import { useConversations } from '@/stores/conversations'
import { useTheme } from '@/stores/theme'
import { useUiCommands } from '@/stores/uiCommands'

function SearchGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const conversationList = useConversations((state) => state.list)
  const conversations = useMemo(() => conversationList.filter((item) => item.kind !== 'whisper'), [conversationList])
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const toggleTheme = useTheme((state) => state.toggleTheme)
  const actions = useMemo<CommandAction[]>(() => {
    const dispatch = useUiCommands.getState().dispatch
    return [
      { id: 'conversation-search', label: '搜索会话和消息', keywords: 'search conversations', run: () => dispatch('focus-conversation-search') },
      { id: 'find-chat', label: '搜索当前对话', keywords: 'find chat', shortcut: '⌘ F', run: () => dispatch('find-chat') },
      { id: 'focus-composer', label: '聚焦消息输入框', keywords: 'focus composer input', run: () => dispatch('focus-composer') },
      { id: 'new-group', label: '新建群聊', keywords: 'new group conversation', run: () => dispatch('new-group') },
      { id: 'agents', label: '打开智能体', keywords: 'agents', run: () => useApp.getState().setView('agents') },
      { id: 'canvas', label: '打开 Canvas', keywords: 'canvas', run: () => useApp.getState().setView('canvas') },
      { id: 'library', label: '打开资料库', keywords: 'library documents', run: () => useApp.getState().setView('library') },
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
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return needle ? actions.filter((action) => `${action.label} ${action.keywords ?? ''}`.toLocaleLowerCase().includes(needle)) : actions
  }, [actions, query])

  useEffect(() => {
    if (!open) return
    setQuery(''); setActiveIndex(0)
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow }
  }, [open])
  useEffect(() => setActiveIndex(0), [query])
  if (!open || typeof document === 'undefined') return null
  const run = (action: CommandAction | undefined) => {
    if (!action) return
    onClose(); window.requestAnimationFrame(action.run)
  }
  return createPortal(
    <div className="command-palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="命令面板">
        <div className="command-palette-search">
          <SearchGlyph />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入命令或会话名称…"
            aria-controls="lingxi-command-results" aria-activedescendant={visible[activeIndex] ? `lingxi-command-${visible[activeIndex].id}` : undefined}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
              if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => (index + 1) % Math.max(1, visible.length)); return }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => (index - 1 + visible.length) % Math.max(1, visible.length)); return }
              if (event.key === 'Home') { event.preventDefault(); setActiveIndex(0); return }
              if (event.key === 'End') { event.preventDefault(); setActiveIndex(Math.max(0, visible.length - 1)); return }
              if (event.key === 'Enter') { event.preventDefault(); run(visible[activeIndex]) }
            }} />
          <kbd>Esc</kbd>
        </div>
        <div id="lingxi-command-results" className="command-palette-results" role="listbox">
          {visible.length === 0 && <div className="command-palette-empty">没有匹配的命令</div>}
          {visible.map((action, index) => <button id={`lingxi-command-${action.id}`} key={action.id} type="button" role="option" aria-selected={index === activeIndex}
            className="command-palette-item" data-active={index === activeIndex ? 'true' : 'false'} onMouseEnter={() => setActiveIndex(index)} onClick={() => run(action)}>
            <span>{action.label}</span>{action.shortcut && <kbd>{action.shortcut}</kbd>}
          </button>)}
        </div>
        <footer><span>↑↓ 导航</span><span>Enter 打开</span><span>⌘K 随时返回</span></footer>
      </section>
    </div>, document.body,
  )
}
