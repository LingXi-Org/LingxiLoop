import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  document: ArtifactDocument
  pageId: string
  compute: NativeCompute
  loadedPageIds: string[]
  pageVersion(id: string): string | undefined
  revisionSeq?: string
  notes: boolean
  speakerWindow: Window | null
  notesWritable: boolean
  getNotesBase(): ArtifactDocument
  onNotesCommit(id: string, notes: string, base: ArtifactDocument): void
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
export default function SlidesPresentation({
  active,
  document: doc,
  pageId,
  compute,
  loadedPageIds,
  pageVersion,
  revisionSeq,
  notes,
  speakerWindow,
  notesWritable,
  getNotesBase,
  onNotesCommit,
  ensurePage,
  onNavigate,
  onClose,
  onSave,
  onError,
}: Props) {
  const root = useRef<HTMLElement>(null),
    surface = useRef<HTMLDivElement>(null),
    outgoing = useRef<HTMLDivElement>(null),
    veil = useRef<HTMLDivElement>(null)
  const [SlidesSpeaker, setSlidesSpeaker] = useState<
    typeof import('./SlidesSpeaker').default | null
  >(null)
  const [speakerError, setSpeakerError] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 }),
    [showNotes, setShowNotes] = useState(notes),
    [transition, setTransition] = useState<Transition | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('')
  const reportError = (message: string) => {
    setError(message)
    onError(message)
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
      if (window.document.fullscreenElement) void window.document.exitFullscreen()
      else
        void root.current?.requestFullscreen().catch(() => reportError('请使用浏览器的全屏操作。'))
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
        >
          <div
            className="native-slides-presentation-stage"
            onClick={(event) => {
              if (
                !(event.target as HTMLElement).closest(
                  'a,button,input,textarea,select,iframe,[contenteditable]',
                )
              )
                next(1)
            }}
          >
            {page && loadedPageIds.includes(pageId) ? (
              <>
                <div
                  className="native-slides-presentation-frame"
                  style={{ width: page.width * scale, height: page.height * scale }}
                >
                  <div
                    className="native-slides-presentation-scale"
                    style={{ width: page.width, height: page.height, transform: `scale(${scale})` }}
                  >
                    <div
                      ref={surface}
                      className="native-slides-presentation-current"
                      data-page-id={pageId}
                      style={{ background: artifactPageBackground(page, doc) }}
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
                      width: transition.from.width * outgoingScale,
                      height: transition.from.height * outgoingScale,
                    }}
                  >
                    <div
                      className="native-slides-presentation-scale"
                      style={{
                        width: transition.from.width,
                        height: transition.from.height,
                        transform: `scale(${outgoingScale})`,
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
          {error && (
            <div className="native-presentation-error" role="alert">
              {error}
              <button type="button" onClick={() => setError('')}>
                关闭
              </button>
            </div>
          )}
          <nav className="native-present-controls" aria-label="放映控制">
            <IconButton
              icon="previous"
              label="上一页"
              disabled={index <= 0 || loading}
              onClick={() => next(-1)}
            />
            <span aria-live="polite">
              {index + 1} / {pages.length}
            </span>
            <IconButton
              icon="next"
              label="下一页"
              disabled={index >= pages.length - 1 || loading}
              onClick={() => next(1)}
            />
            <IconButton
              icon="notes"
              label="讲者备注"
              active={showNotes}
              onClick={() => setShowNotes((value) => !value)}
            />
            <IconButton
              icon="fit"
              label="全屏"
              onClick={() =>
                void root.current
                  ?.requestFullscreen()
                  .catch(() => reportError('请使用浏览器的全屏操作。'))
              }
            />
            <IconButton icon="close" label="退出放映" onClick={onClose} />
          </nav>
        </section>
      )}
      {speakerWindow && SlidesSpeaker && (
        <SlidesSpeaker
          presenting={active}
          win={speakerWindow}
          document={doc}
          pageId={pageId}
          compute={compute}
          loadedPageIds={loadedPageIds}
          writable={notesWritable}
          getNotesBase={getNotesBase}
          onNotesCommit={onNotesCommit}
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
