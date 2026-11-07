import type { SpeakerNoteDraftStore, CommitSpeakerNote } from './speaker-note-drafts'
import { useEffect, useLayoutEffect, useRef, useState, useId, type ComponentProps } from 'react'
import type { ArtifactDocument, ArtifactPage } from '../../../../shared/artifact-document'
import { artifactPageBackground } from '../../../../shared/artifact-themes'
import type { NativeCompute } from './compute'
import { IconButton } from './EditorPrimitives'
import { PageContent } from './renderer'
import {
  animateSlideTransition,
  navigationTransition,
  type SlideTransition,
} from './presentation-transition'
import './slides-presentation.css'

interface Props {
  active: boolean
  fullscreenSession: { deferred: boolean; request: Promise<boolean> | null; since: number; warning?: string }
  coarsePointer: boolean
  onToggleSpeaker(): boolean
  document: ArtifactDocument
  pageId: string
  compute: NativeCompute
  loadedPageIds: string[]
  pageVersion(id: string): string | undefined
  revisionSeq?: string
  notes: boolean
  getSpeakerWindow(): Window | null
  notesWritable: boolean
  getNotesBase(): ArtifactDocument
  onNotesCommit: CommitSpeakerNote
  noteDrafts: SpeakerNoteDraftStore
  saveError: string
  saveConflict: boolean
  saving: boolean
  onDownloadRecovery(): void
  onRecover(): void
  onCheckAccess(): void
  ensurePage(id: string): Promise<void>
  onNavigate(id: string): void
  onClose(): void
  onSave(): void
  onError(message: string): void
}
interface Transition {
  from: ArtifactPage
  toId: string
  kind: SlideTransition
  back: boolean
  key: number
}
/** Outgoing embedded code is never mounted a second time during transitions. */
function outgoingPage(page: ArtifactPage): ArtifactPage {
  const hidden = new Set<string>()
  for (const node of Object.values(page.nodes))
    if (node.type === 'embed') {
      let ancestor = node
      while (ancestor.parentId && page.nodes[ancestor.parentId])
        ancestor = page.nodes[ancestor.parentId]
      hidden.add(ancestor.id)
    }
  return {
    ...page,
    nodes: Object.fromEntries(
      Object.entries(page.nodes).map(([id, node]) => [
        id,
        hidden.has(id) ? { ...node, hidden: true } : node,
      ]),
    ),
  }
}
function PresentationControlButton(props: ComponentProps<typeof IconButton>) {
  const tooltipId = useId()
  return <IconButton {...props} title={undefined} aria-describedby={tooltipId}><span id={tooltipId} className="native-present-tooltip" role="tooltip">{props.label}</span></IconButton>
}
export default function SlidesPresentation({
  active,
  fullscreenSession,
  coarsePointer,
  onToggleSpeaker,
  document: doc,
  pageId,
  compute,
  loadedPageIds,
  pageVersion,
  revisionSeq,
  notes,
  getSpeakerWindow,
  notesWritable,
  getNotesBase,
  onNotesCommit,
  noteDrafts,
  saveError,
  saveConflict,
  saving,
  onDownloadRecovery,
  onRecover,
  onCheckAccess,
  ensurePage,
  onNavigate,
  onClose,
  onSave,
  onError,
}: Props) {
  const speakerWindow = getSpeakerWindow()
  const root = useRef<HTMLElement>(null),
    surface = useRef<HTMLDivElement>(null),
    outgoing = useRef<HTMLDivElement>(null),
    veil = useRef<HTMLDivElement>(null)
  const [SlidesSpeaker, setSlidesSpeaker] = useState<
    typeof import('./SlidesSpeaker').default | null
  >(null)
  const [speakerError, setSpeakerError] = useState(false)
  const controls = useRef<HTMLElement>(null)
  const [fullscreen, setFullscreen] = useState(!!window.document.fullscreenElement)
  const [fullscreenDenied, setFullscreenDenied] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerType = useRef<string | null>(null)
  const fullscreenLifetime = useRef<object | null>(null)
  const deferFullscreen = useRef(false), requestingFullscreen = useRef(false),
    intentionalFullscreenExit = useRef(false), fullscreenEnteredAt = useRef(0)
  const latest = useRef({ onClose, onError })
  latest.current = { onClose, onError }
  const [size, setSize] = useState({ width: 0, height: 0 }),
    [showNotes, setShowNotes] = useState(notes),
    [transition, setTransition] = useState<Transition | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [warning, setWarning] = useState('')
  const reportError = (message: string) => {
    setError(message)
    onError(message)
  }
  const showControls = () => {
    setControlsVisible(true)
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    controlsTimer.current = setTimeout(() => {
      const focused = window.document.activeElement
      if (!(focused instanceof HTMLElement && controls.current?.contains(focused) && focused.matches(':focus-visible')))
        setControlsVisible(false)
    }, 1800)
  }
  useEffect(() => {
    if (!active) return
    let live = true
    const token = {}
    fullscreenLifetime.current = token
    deferFullscreen.current = fullscreenSession.deferred
    fullscreenEnteredAt.current = window.document.fullscreenElement ? Date.now() : 0
    intentionalFullscreenExit.current = false
    setFullscreenDenied(false)
    setWarning(fullscreenSession.warning ?? '')
    setShowNotes(notes)
    const changed = () => {
      const entered = !!window.document.fullscreenElement
      setFullscreen(entered)
      showControls()
      if (entered) {
        fullscreenEnteredAt.current = Date.now()
        intentionalFullscreenExit.current = false
        deferFullscreen.current = false
      } else {
        const shouldExit = fullscreenEnteredAt.current > 0 && Date.now() - fullscreenEnteredAt.current >= 3000 && !intentionalFullscreenExit.current && window.document.hasFocus()
        fullscreenEnteredAt.current = 0
        intentionalFullscreenExit.current = false
        if (shouldExit) latest.current.onClose()
      }
    }
    window.document.addEventListener('fullscreenchange', changed)
    setFullscreen(!!window.document.fullscreenElement)
    showControls()
    void fullscreenSession.request?.then(entered => {
      if (!live) {
        if (fullscreenLifetime.current === token && entered && window.document.fullscreenElement) void window.document.exitFullscreen().catch(() => {})
      } else if (!entered) {
        setFullscreenDenied(true)
        setError('此处无法使用全屏，可继续在窗口中放映。')
      }
    })
    return () => {
      live = false
      window.document.removeEventListener('fullscreenchange', changed)
      if (controlsTimer.current) clearTimeout(controlsTimer.current)
      queueMicrotask(() => {
        if (fullscreenLifetime.current === token && window.document.fullscreenElement) void window.document.exitFullscreen().catch(() => {})
      })
    }
  }, [active, fullscreenSession])
  const enterFullscreen = () => {
    if (!window.document.fullscreenEnabled || fullscreenDenied || requestingFullscreen.current) return
    requestingFullscreen.current = true
    void window.document.documentElement.requestFullscreen().then(() => {
      if (!mounted.current) { if (window.document.fullscreenElement) void window.document.exitFullscreen().catch(() => {}); return }
      fullscreenEnteredAt.current = Date.now()
    }, () => {
      if (!mounted.current) return
      setFullscreenDenied(true)
      reportError('此处无法使用全屏，可继续在窗口中放映。')
    }).finally(() => { requestingFullscreen.current = false })
  }
  const toggleFullscreen = () => {
    showControls()
    deferFullscreen.current = false
    if (window.document.fullscreenElement) {
      intentionalFullscreenExit.current = true
      void window.document.exitFullscreen().catch(() => {})
    } else enterFullscreen()
  }
  const toggleNotes = () => {
    showControls()
    if (speakerWindow && !speakerWindow.closed) { onToggleSpeaker(); return }
    if (showNotes) { setShowNotes(false); return }
    if (coarsePointer) { setShowNotes(true); return }
    intentionalFullscreenExit.current = !!window.document.fullscreenElement
    if (onToggleSpeaker()) {
      deferFullscreen.current = true
      if (window.document.fullscreenElement) void window.document.exitFullscreen().catch(() => {})
    } else {
      intentionalFullscreenExit.current = false
      setShowNotes(true)
      setWarning('演讲者窗口未能打开，讲者备注已显示在放映窗口中。')
    }
  }
  useEffect(() => {
    if (!speakerWindow || SlidesSpeaker || speakerError) return
    let active = true
    void import('./SlidesSpeaker')
      .then((module) => {
        if (active) setSlidesSpeaker(() => module.default)
      })
      .catch(() => {
        if (active) {
          setSpeakerError(true)
          speakerWindow.close()
          reportError('演讲者视图未能加载，请刷新页面后重试。')
        }
      })
    return () => {
      active = false
    }
  }, [speakerWindow, SlidesSpeaker, speakerError])
  const transitionKey = useRef(0),
    mounted = useRef(false),
    navigation = useRef(false)
  const page = doc.pages[pageId],
    pages = doc.pageOrder.filter((id) => !doc.pages[id].skip),
    index = pages.indexOf(pageId)
  const scale = page
    ? Math.max(0.001, Math.min(size.width / page.width, size.height / page.height))
    : 1
  const outgoingScale = transition
    ? Math.max(
        0.001,
        Math.min(size.width / transition.from.width, size.height / transition.from.height),
      )
    : 1
  useLayoutEffect(() => {
    if (!active) {
      setTransition(null)
      return
    }
    mounted.current = true
    root.current?.focus({ preventScroll: true })
    const element = root.current?.querySelector<HTMLElement>('.native-slides-presentation-stage')
    if (!element) return
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight }),
      observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => {
      mounted.current = false
      observer.disconnect()
    }
  }, [active])
  useLayoutEffect(() => {
    if (
      !active ||
      !transition ||
      transition.toId !== pageId ||
      !surface.current ||
      !outgoing.current ||
      !page
    )
      return
    return animateSlideTransition(
      outgoing.current,
      surface.current,
      transition.from,
      page,
      transition.kind,
      transition.back,
      scale,
      veil.current,
      () => setTransition((value) => (value?.key === transition.key ? null : value)),
    )
  }, [transition, pageId, scale, page, active])
  const go = async (target: string, back: boolean, animate = true) => {
    if (!page || target === pageId || navigation.current) return
    navigation.current = true
    setLoading(true)
    try {
      await ensurePage(target)
      if (!mounted.current) return
      const kind = animate
        ? navigationTransition(
            page,
            doc.pages[target],
            back,
            window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          )
        : null
      setTransition(
        kind
          ? { from: outgoingPage(page), toId: target, kind, back, key: ++transitionKey.current }
          : null,
      )
      onNavigate(target)
    } catch {
      if (mounted.current) reportError('幻灯片未能加载，请重试。')
    } finally {
      navigation.current = false
      if (mounted.current) setLoading(false)
    }
  }
  const next = (direction: number) => {
    const target = pages[index + direction]
    if (target) void go(target, direction < 0)
  }
  const keyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    // A speaker portal shares React, but owns its separate window's keyboard.
    if (!root.current?.contains(event.target as Node)) return
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const targets = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),iframe,[tabindex]:not([tabindex="-1"])') ?? [])]
        .filter(element => !element.closest('[inert]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
      const index = targets.indexOf(window.document.activeElement as HTMLElement)
      const next = targets[event.shiftKey ? (index <= 0 ? targets.length - 1 : index - 1) : (index + 1) % targets.length]
      if (next) { event.preventDefault(); event.stopPropagation(); showControls(); next.focus({ preventScroll: true }) }
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      event.stopPropagation()
      onSave()
      return
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (
      (event.target as HTMLElement).closest('input,textarea,select,a,iframe,[contenteditable]') ||
      (event.key === ' ' && (event.target as HTMLElement).closest('button,summary'))
    )
      return
    const direction = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)
      ? 1
      : ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)
        ? -1
        : 0
    if (direction) {
      event.preventDefault()
      event.stopPropagation()
      next(direction)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      event.stopPropagation()
      const target = event.key === 'Home' ? pages[0] : pages.at(-1)
      if (target) void go(target, event.key === 'Home', false)
    } else if (event.key.toLowerCase() === 'f' && !event.repeat) {
      event.preventDefault()
      toggleFullscreen()
    } else if (/^[1-9]$/.test(event.key) && pages[Number(event.key) - 1]) {
      event.preventDefault()
      void go(pages[Number(event.key) - 1], Number(event.key) - 1 < index, false)
    }
  }
  return (
    <>
      {active && (
        <section
          ref={root}
          className="native-slides-presentation"
          data-native-editor-boundary
          data-transition={transition?.kind}
          aria-label="幻灯片放映"
          tabIndex={0}
          onKeyDown={keyDown}
          onPointerMove={event => { if (!event.buttons) showControls() }}
          onPointerDownCapture={event => { pointerType.current = event.pointerType }}
          onPointerCancelCapture={event => {
            pointerType.current = null
            if (event.pointerType === 'touch' || event.pointerType === 'pen') showControls()
          }}
          onClickCapture={() => {
            if (pointerType.current === 'touch' || pointerType.current === 'pen') showControls()
            pointerType.current = null
          }}
          onFocusCapture={event => { if (root.current?.contains(event.target as Node) && controls.current?.contains(event.target as Node)) showControls() }}
        >
          <div
            className="native-slides-presentation-stage"
            onClick={(event) => {
              if (
                !(event.target as HTMLElement).closest(
                  'a,button,input,textarea,select,iframe,[contenteditable]',
                )
              ) {
                if (deferFullscreen.current && !window.document.fullscreenElement && !fullscreenDenied && window.document.fullscreenEnabled) {
                  deferFullscreen.current = false
                  enterFullscreen()
                  return
                }
                const rect = event.currentTarget.getBoundingClientRect()
                next(event.clientX < rect.left + rect.width / 2 ? -1 : 1)
              }
            }}
          >
            {page && loadedPageIds.includes(pageId) ? (
              <>
                <div
                  className="native-slides-presentation-frame"
                  style={{ width: page.width, height: page.height, transform: `translate(-50%, -50%) scale(${scale})` }}
                >
                  <div
                    className="native-slides-presentation-scale"
                    style={{ width: page.width, height: page.height }}
                  >
                    <div
                      ref={surface}
                      className="native-slides-presentation-current"
                      data-page-id={pageId}
                      style={{ background: transition?.kind === 'magic' ? artifactPageBackground(page, doc) : undefined }}
                    >
                      <PageContent
                        document={doc}
                        page={page}
                        compute={compute}
                        presenting
                        pageVersion={pageVersion(pageId)}
                        revisionSeq={revisionSeq}
                      />
                      {transition?.kind === 'magic' && (
                        <div
                          ref={veil}
                          className="native-slides-presentation-veil"
                          style={{ background: artifactPageBackground(transition.from, doc) }}
                        />
                      )}
                    </div>
                  </div>
                </div>
                {transition && transition.toId === pageId && (
                  <div
                    className="native-slides-presentation-frame native-slides-presentation-outgoing-frame"
                    aria-hidden="true"
                    inert
                    style={{
                      width: transition.from.width,
                      height: transition.from.height,
                      transform: `translate(-50%, -50%) scale(${outgoingScale})`,
                    }}
                  >
                    <div
                      className="native-slides-presentation-scale"
                      style={{
                        width: transition.from.width,
                        height: transition.from.height,
                      }}
                    >
                      <div
                        ref={outgoing}
                        className="native-slides-presentation-outgoing"
                        style={{ width: transition.from.width, height: transition.from.height }}
                      >
                        <PageContent
                          document={doc}
                          page={transition.from}
                          compute={compute}
                          pageVersion={pageVersion(transition.from.id)}
                          revisionSeq={revisionSeq}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p role="status">正在加载幻灯片…</p>
            )}
            {loading && (
              <span className="native-presentation-loading" role="status">
                正在加载下一页…
              </span>
            )}
          </div>
          {showNotes && (
            <aside className="native-presentation-notes" aria-label="讲者备注">
              {page?.notes || '本页没有讲者备注。'}
            </aside>
          )}
          {(error || warning) && (
            <div className="native-presentation-error" role={error ? "alert" : "status"}>
              {error || warning}
              <button type="button" onClick={() => { setError(''); setWarning('') }}>
                关闭
              </button>
            </div>
          )}
          <nav ref={controls} className="native-present-controls" data-controls-visible={controlsVisible} aria-label="放映控制" onClick={event=>{event.stopPropagation();showControls()}} onBlur={showControls}>
            <PresentationControlButton icon="previous" label="上一页" disabled={loading} onClick={() => next(-1)} />
            <span className="native-present-position" aria-live="polite">{index + 1}<span> / {pages.length}</span></span>
            <PresentationControlButton icon="next" label="下一页" disabled={loading} onClick={() => next(1)} />
            <span className="native-present-divider" aria-hidden="true" />
            {(pages.some(id=>doc.pages[id].notes.trim()) || showNotes || speakerWindow) && <PresentationControlButton icon="speakerNotes" label={speakerWindow&&!speakerWindow.closed?'关闭讲者备注窗口':showNotes?'隐藏讲者备注':fullscreen&&!coarsePointer?'显示讲者备注（将离开全屏，点击画面可返回）':'显示讲者备注'} active={showNotes||!!speakerWindow} onClick={toggleNotes} />}
            {window.document.fullscreenEnabled && <PresentationControlButton icon={fullscreen?'collapse':'fit'} label={fullscreen?'退出全屏（F）':fullscreenDenied?'此处无法使用全屏':'全屏（F）'} aria-keyshortcuts="F" aria-disabled={fullscreenDenied&&!fullscreen||undefined} onClick={toggleFullscreen} />}
            <PresentationControlButton icon="close" label="退出放映" aria-keyshortcuts="Escape" onClick={onClose} />
          </nav>
        </section>
      )}
      {speakerWindow && SlidesSpeaker && (
        <SlidesSpeaker
          presenting={active}
          since={fullscreenSession.since}
          getWindow={() => speakerWindow}
          document={doc}
          pageId={pageId}
          compute={compute}
          loadedPageIds={loadedPageIds}
          writable={notesWritable}
          getNotesBase={getNotesBase}
          onNotesCommit={onNotesCommit}
          noteDrafts={noteDrafts}
          saveError={saveError}
          saveConflict={saveConflict}
          saving={saving}
          onDownloadRecovery={onDownloadRecovery}
          onRecover={onRecover}
          onCheckAccess={onCheckAccess}
          ensurePage={ensurePage}
          onNavigate={(id) =>
            void go(id, pages.indexOf(id) < index, Math.abs(pages.indexOf(id) - index) === 1)
          }
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </>
  )
}
