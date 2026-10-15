import { type ThreadMessage, useAuiState } from '@assistant-ui/react'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function questionPreview(message: ThreadMessage) {
  const text = message.content.flatMap(part => part.type === 'text' ? [part.text] : []).join(' ').replace(/\s+/g, ' ').trim()
  const attachments = [
    ...(message.role === 'user' ? message.attachments.map(attachment => attachment.name) : []),
    ...message.content.flatMap(part => part.type === 'image' ? [part.filename || '图片'] : part.type === 'file' ? [part.filename || '文件'] : []),
  ]
  const summary = text || (attachments.length ? `附件：${attachments.join('、')}` : '无文字提问')
  return summary.length > 100 ? `${summary.slice(0, 100)}…` : summary
}

export function ConversationQuestionIndex({ viewportRef, hasMoreOlder, isLoadingOlder, onLoadOlder, onNavigate }: {
  viewportRef: RefObject<HTMLDivElement | null>
  hasMoreOlder: boolean
  isLoadingOlder: boolean
  onLoadOlder: () => Promise<boolean>
  onNavigate: (id: string) => void
}) {
  // Streaming assistant tokens must not rebuild the question list. Use the same
  // canonical runtime messages as MessageByIndex, and stable IM client IDs.
  const questionKey = useAuiState(state => JSON.stringify(state.thread.messages
    .filter(message => message.role === 'user' && message.metadata.custom.schema === 'lingxiloop.thread-message.v2')
    .map(message => ({ id: String(message.metadata.custom.clientMessageId), preview: questionPreview(message) }))))
  const questions = useMemo(() => JSON.parse(questionKey) as { id: string; preview: string }[], [questionKey])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    let frame = 0
    const update = () => {
      frame = 0
      const readingLine = viewport.getBoundingClientRect().top + 24
      let current: string | null = questions[0]?.id ?? null
      for (const question of questions) {
        const element = viewport.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(question.id)}"]`)
        if (!element) continue
        if (element.getBoundingClientRect().top > readingLine) break
        current = question.id
      }
      if (viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 1) current = questions.at(-1)?.id ?? null
      setActiveId(current)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    const observer = new ResizeObserver(schedule)
    observer.observe(viewport)
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild)
    viewport.addEventListener('scroll', schedule, { passive: true })
    schedule()
    return () => { cancelAnimationFrame(frame); observer.disconnect(); viewport.removeEventListener('scroll', schedule) }
  }, [questions, viewportRef])

  useEffect(() => {
    const rail = railRef.current
    // Keep the current marker in view without moving the document, stealing
    // focus, or fighting someone who is browsing the rail with the keyboard.
    if (!rail || rail.contains(document.activeElement)) return
    const marker = rail.querySelector<HTMLElement>('[aria-current="location"]')
    if (!marker) return
    const bounds = marker.getBoundingClientRect(), container = rail.getBoundingClientRect()
    if (bounds.top < container.top) rail.scrollTop -= container.top - bounds.top
    else if (bounds.bottom > container.bottom) rail.scrollTop += bounds.bottom - container.bottom
  }, [activeId])

  if (!questions.length && !hasMoreOlder) return null
  return <nav aria-label="提问索引" className="chat-question-index" data-question-index>
    {hasMoreOlder && <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="chat-question-index-button shrink-0" aria-label={loadFailed ? '加载失败，重试更早的提问' : '加载更早的提问'}
          disabled={isLoadingOlder} aria-busy={isLoadingOlder} onClick={async () => { setLoadFailed(false); setLoadFailed(!await onLoadOlder()) }}>
          <span aria-hidden="true">{isLoadingOlder ? '·' : loadFailed ? '!' : '⋯'}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="motion-reduce:animate-none">{isLoadingOlder ? '正在加载…' : loadFailed ? '加载失败，请重试' : '加载更早的提问'}</TooltipContent>
    </Tooltip>}
    <div ref={railRef} className="chat-question-index-list" onKeyDown={event => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
      event.preventDefault()
      buttons[next]?.focus()
    }}>
      {questions.map((question, index) => <Tooltip key={question.id}>
        <TooltipTrigger asChild>
          <button type="button" className="chat-question-index-button" data-question-id={question.id}
            aria-label={`提问 ${index + 1}：${question.preview}`} aria-current={question.id === activeId ? 'location' : undefined}
            onClick={() => onNavigate(question.id)}>
            <span className="chat-question-index-dash" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} collisionPadding={12} className="max-w-[min(18rem,70vw)] break-words motion-reduce:animate-none">
          {question.preview}
        </TooltipContent>
      </Tooltip>)}
    </div>
    <span className="sr-only" role="status">{isLoadingOlder ? '正在加载更早的提问' : loadFailed ? '加载失败，请重试' : ''}</span>
  </nav>
}
