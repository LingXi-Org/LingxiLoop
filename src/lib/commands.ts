export type CommandActionId = 'palette' | 'find-chat' | 'previous-conversation' | 'next-conversation' | 'conversation-index'

export interface CommandAction {
  id: string
  label: string
  keywords?: string
  shortcut?: string
  run(): void
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = typeof Element !== 'undefined' && target instanceof Element ? target : null
  if (!element) return false
  return Boolean(element.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
}

export function actionForKeyboardEvent(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'target'>): { id: CommandActionId; index?: number } | null {
  const mod = event.metaKey || event.ctrlKey
  const key = event.key.toLocaleLowerCase()
  if (mod && key === 'k') return { id: 'palette' }
  if (mod && key === 'f') return { id: 'find-chat' }
  if (isEditableTarget(event.target)) return null
  if (event.altKey && !mod && event.key === 'ArrowUp') return { id: 'previous-conversation' }
  if (event.altKey && !mod && event.key === 'ArrowDown') return { id: 'next-conversation' }
  if (mod && /^[1-9]$/.test(event.key)) return { id: 'conversation-index', index: Number(event.key) - 1 }
  return null
}
