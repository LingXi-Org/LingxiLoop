import { type ThreadMessage, useAuiState } from '@assistant-ui/react'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { questionGeometry } from './question-geometry'
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
    let register = true
    let nodes: { id: string; element: HTMLElement }[] = []
    const questionIds = new Set(questions.map(question => question.id))
    const update = () => {
      frame = 0
      if (register) {
        nodes = questions.flatMap(question => {
          const element = viewport.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(question.id)}"]`)
          return element ? [{ id: question.id, element }] : []
        })
        register = false
      }
      const atBottom = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 1
      const result = questionGeometry(nodes.length, index => nodes[index]!.element.getBoundingClientRect(),
        viewport.getBoundingClientRect(), atBottom)
      setActiveId((atBottom ? questions.at(-1)?.id : nodes[result.active]?.id ?? questions[0]?.id) ?? null)
      const visible = result.visible.map(index => nodes[index]!.id)
      setVisibleIds(previous => previous.length === visible.length && previous.every((id, index) => id === visible[index]) ? previous : visible)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    // Token/text mutations do not re-register historical nodes. Only inserted,
    // removed or replaced question roots invalidate this DOM identity cache.
    const containsQuestion = (node: Node) => node instanceof Element &&
      [node, ...node.querySelectorAll('[data-msg-id]')].some(element => questionIds.has(element.getAttribute('data-msg-id') ?? ''))
    const mutations = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(containsQuestion))) {
        register = true
        schedule()
      }
    })
    mutations.observe(viewport, { childList: true, subtree: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(viewport)
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild)
    viewport.addEventListener('scroll', schedule, { passive: true })
    schedule()
    return () => { cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect(); viewport.removeEventListener('scroll', schedule) }
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
