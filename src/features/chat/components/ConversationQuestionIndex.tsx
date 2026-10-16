import { type ThreadMessage, useAuiState } from '@assistant-ui/react'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/use-mobile'
import { ConversationMap } from '@/components/vendor/assistant-ui/elements/conversation-map'

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
  const isMobile = useIsMobile()
  // Streaming assistant tokens must not rebuild the question list. Use the same
  // canonical runtime messages as MessageByIndex, and stable IM client IDs.
  const questionKey = useAuiState(state => JSON.stringify(state.thread.messages
    .filter(message => message.role === 'user' && message.metadata.custom.schema === 'lingxiloop.thread-message.v2')
    .map(message => ({ id: String(message.metadata.custom.clientMessageId), preview: questionPreview(message) }))))
  const questions = useMemo(() => JSON.parse(questionKey) as { id: string; preview: string }[], [questionKey])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [visibleIds, setVisibleIds] = useState<string[]>([])
  const mapViewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || isMobile) return
    let frame = 0
    const update = () => {
      frame = 0
      const bounds = viewport.getBoundingClientRect()
      const readingLine = bounds.top + 24
      const visible: string[] = []
      let current: string | null = questions[0]?.id ?? null
      for (const question of questions) {
        const element = viewport.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(question.id)}"]`)
        if (!element) continue
        const rect = element.getBoundingClientRect()
        if (rect.top <= readingLine) current = question.id
        if (rect.bottom > bounds.top && rect.top < bounds.bottom) visible.push(question.id)
      }
      if (viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 1) current = questions.at(-1)?.id ?? null
      setActiveId(current)
      setVisibleIds(previous => previous.join() === visible.join() ? previous : visible)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    const observer = new ResizeObserver(schedule)
    observer.observe(viewport)
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild)
    viewport.addEventListener('scroll', schedule, { passive: true })
    schedule()
    return () => { cancelAnimationFrame(frame); observer.disconnect(); viewport.removeEventListener('scroll', schedule) }
  }, [questions, viewportRef, isMobile])

  useEffect(() => {
    const container = mapViewportRef.current
    if (!container || container.contains(document.activeElement)) return
    container.querySelector<HTMLElement>('[data-active]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId, questions, isMobile])

  if (isMobile || (!questions.length && !hasMoreOlder)) return null
  return <aside data-question-index data-source="assistant-ui-conversation-map" className="flex w-11 shrink-0 flex-col py-3">
    {hasMoreOlder && <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="chat-question-index-button shrink-0" aria-label={loadFailed ? '加载失败，重试更早的提问' : '加载更早的提问'}
          disabled={isLoadingOlder} aria-busy={isLoadingOlder} onClick={async () => { setLoadFailed(false); setLoadFailed(!await onLoadOlder()) }}>
          <span aria-hidden="true">{isLoadingOlder ? '·' : loadFailed ? '!' : '⋯'}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="motion-reduce:animate-none">{isLoadingOlder ? '正在加载…' : loadFailed ? '加载失败，请重试' : '加载更早的提问'}</TooltipContent>
    </Tooltip>}
    <span className="sr-only" role="status">{isLoadingOlder ? '正在加载更早的提问' : loadFailed ? '加载失败，请重试' : ''}</span>
    <div ref={mapViewportRef} data-question-index-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 [scrollbar-width:thin]">
      <ConversationMap entries={questions.map(question => ({ id: question.id, title: question.preview }))}
        activeId={activeId ?? undefined} visibleIds={visibleIds} onSelect={onNavigate} side="right"
        aria-label="当前对话提问索引"
        className="min-h-full gap-1 [--foreground:var(--primary)] [&>button:focus-visible]:!outline-solid [&>button:focus-visible]:!outline-2 [&>button:focus-visible]:!outline-ring motion-reduce:[&_*]:!transition-none"
        style={{ height: questions.length * 18 }} />
    </div>
  </aside>
}
