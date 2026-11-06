import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ArtifactDocument, ArtifactPage } from '../../../../shared/artifact-document'
import type { NativeCompute } from './compute'
import { EditorIcon } from './EditorPrimitives'
import { PageContent } from './renderer'
import TextAreaField from './TextAreaField'
import { slideTitleSnippet, speakerPreviewPage } from './slide-speaker-state'
import styles from './slides-speaker.css?inline'

interface Props {
  presenting: boolean
  win: Window
  document: ArtifactDocument
  pageId: string
  compute: NativeCompute
  loadedPageIds: string[]
  writable: boolean
  getNotesBase(): ArtifactDocument
  onNotesCommit(id: string, notes: string, base: ArtifactDocument): void
  ensurePage(id: string): Promise<void>
  onNavigate(id: string): void
  onClose(): void
  onSave(): void
}

function Preview({
  page,
  document: doc,
  compute,
  win,
}: {
  win: Window
  page: ArtifactPage
  document: ArtifactDocument
  compute: NativeCompute
}) {
  const root = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const snapshot = useMemo(() => speakerPreviewPage(page, doc.assets), [page, doc.assets])
  const previewDocument = useMemo(
    () => ({ ...doc, pages: { ...doc.pages, [page.id]: snapshot } }),
    [doc, page.id, snapshot],
  )
  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const PopupResizeObserver = (win as Window & typeof globalThis).ResizeObserver
    const observer = new PopupResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    setWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [win])
  return (
    <div ref={root} className="native-speaker-preview" data-speaker-preview>
      {width > 0 && (
        <div
          inert
          style={{
            width: page.width,
            height: page.height,
            transform: `scale(${Math.min(width / page.width, (width * 9) / 16 / page.height)})`,
            transformOrigin: 'top left',
          }}
        >
          <PageContent document={previewDocument} page={snapshot} compute={compute} />
        </div>
      )}
    </div>
  )
}

export default function SlidesSpeaker({
  presenting,
  win,
  document: doc,
  pageId,
  compute,
  loadedPageIds,
  writable,
  getNotesBase,
  onNotesCommit,
  ensurePage,
  onNavigate,
  onClose,
  onSave,
}: Props) {
  const [closed, setClosed] = useState(win.closed),
    [editing, setEditing] = useState(false),
    [wide, setWide] = useState(win.innerWidth >= 640)
  const [clock, setClock] = useState({ running: true, start: Date.now(), elapsed: 0 }),
    [now, setNow] = useState(Date.now())
  const base = useRef<ArtifactDocument | null>(null),
    root = useRef<HTMLElement>(null)
  const pages = doc.pageOrder.filter((id) => !doc.pages[id].skip),
    index = pages.indexOf(pageId),
    page = doc.pages[pageId]
  const previous = pages[index - 1],
    next = pages[index + 1]
  useEffect(() => {
    const update = () => setWide(win.innerWidth >= 640),
      close = () => setClosed(true)
    win.addEventListener('resize', update)
    win.addEventListener('pagehide', close)
    return () => {
      win.removeEventListener('resize', update)
      win.removeEventListener('pagehide', close)
    }
  }, [win])
  useLayoutEffect(() => {
    win.document.querySelector('[data-speaker-loading]')?.remove()
    const copies = new Map<Element, Element>()
    const sync = () => {
      const sources = new Set<Element>(
        document.head.querySelectorAll('style,link[rel="stylesheet"]'),
      )
      for (const [source, copy] of copies)
        if (!sources.has(source)) {
          copy.remove()
          copies.delete(source)
        }
      for (const source of sources) {
        let copy = copies.get(source)
        if (!copy) {
          copy = source.cloneNode(true) as Element
          copies.set(source, copy)
          win.document.head.append(copy)
        } else if (copy.outerHTML !== source.outerHTML) {
          const updated = source.cloneNode(true) as Element
          copy.replaceWith(updated)
          copies.set(source, updated)
        }
      }
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    })
    return () => {
      observer.disconnect()
      for (const copy of copies.values()) copy.remove()
    }
  }, [win])
  useEffect(() => {
    if (!clock.running || closed || !presenting) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [clock.running, closed, presenting])
  useEffect(() => {
    if (!closed)
      win.document.title = presenting
        ? `LingxiLoop · 讲者备注 · ${index + 1} / ${pages.length}`
        : 'LingxiLoop · 讲者备注'
  }, [closed, win, index, pages.length, presenting])
  useEffect(() => {
    if (!writable) setEditing(false)
  }, [writable])
  useLayoutEffect(() => {
    if (editing) {
      const field = root.current?.querySelector('textarea')
      field?.focus()
      if (field) field.setSelectionRange(field.value.length, field.value.length)
    }
  }, [editing, pageId])
  useEffect(() => {
    root.current?.querySelector('[role="region"]')?.scrollTo(0, 0)
  }, [pageId])
  const ensure = useRef(ensurePage)
  ensure.current = ensurePage
  const [failedPreviews, setFailedPreviews] = useState<Set<string>>(() => new Set())
  const loadPreview = useCallback((id: string) => {
    void ensure
      .current(id)
      .then(() =>
        setFailedPreviews((previous) => {
          if (!previous.has(id)) return previous
          const result = new Set(previous)
          result.delete(id)
          return result
        }),
      )
      .catch(() => setFailedPreviews((previous) => new Set([...previous, id])))
  }, [])
  useEffect(() => {
    if (wide && presenting) for (const id of [previous, next]) if (id) loadPreview(id)
  }, [previous, next, wide, presenting, loadPreview])
  useEffect(() => {
    setEditing(false)
    if (presenting) {
      const time = Date.now()
      setNow(time)
      setClock({ running: true, start: time, elapsed: 0 })
    }
  }, [presenting])
  const elapsed = Math.max(0, clock.elapsed + (clock.running ? now - clock.start : 0)),
    seconds = Math.floor(elapsed / 1000)
  const navigate = (id: string | undefined) => {
    if (id) onNavigate(id)
  }
  const handlers = useRef({ presenting, editing, pages, index, navigate, onClose, onSave })
  handlers.current = { presenting, editing, pages, index, navigate, onClose, onSave }
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const value = handlers.current
      if (!value.presenting) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        value.onSave()
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (value.editing) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setEditing(false)
        }
        return
      }
      const target = event.target as HTMLElement
      if (
        target.closest('input,textarea,select,[contenteditable]') ||
        (event.key === ' ' && target.closest('button,a'))
      )
        return
      const scroller = target.closest<HTMLElement>('[data-speaker-notes]')
      if (
        scroller &&
        scroller.scrollHeight > scroller.clientHeight + 1 &&
        ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)
      )
        return
      const direction = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)
        ? 1
        : ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)
          ? -1
          : 0
      if (direction) {
        event.preventDefault()
        value.navigate(value.pages[value.index + direction])
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        value.navigate(event.key === 'Home' ? value.pages[0] : value.pages.at(-1))
      } else if (/^[1-9]$/.test(event.key)) {
        event.preventDefault()
        value.navigate(value.pages[Number(event.key) - 1])
      } else if (event.key === 'Escape') {
        event.preventDefault()
        value.onClose()
      }
    }
    win.addEventListener('keydown', keyDown)
    return () => win.removeEventListener('keydown', keyDown)
  }, [win])
  if (closed) return null
  if (!presenting)
    return createPortal(
      <section
        ref={root}
        className="native-editor native-speaker"
        data-native-editor-boundary
        aria-label="讲者备注等待视图"
      >
        <style>{styles}</style>
        <div className="native-speaker-right">
          <header className="native-speaker-head">
            <span>讲者备注</span>
            <span className="native-speaker-dim" style={{ fontWeight: 400 }}>
              {slideTitleSnippet(page, 80) || `第 ${doc.pageOrder.indexOf(pageId) + 1} 页`}
            </span>
          </header>
          <div
            role="region"
            aria-label="讲者备注"
            className="native-speaker-notes"
            data-speaker-notes
            tabIndex={0}
          >
            <div>
              <p className="native-speaker-dim" style={{ margin: '0 0 1em', fontSize: '.75em' }}>
                正在等待放映。在主窗口点击“放映”后，幻灯片会在主窗口播放，此窗口将同步显示计时器、当前页、接下来的一页和讲者备注。
              </p>
              {page?.notes.trim() || <span className="native-speaker-dim">本页没有讲者备注。</span>}
            </div>
          </div>
        </div>
      </section>,
      win.document.body,
    )
  const preview = (id: string) =>
    loadedPageIds.includes(id) ? (
      <Preview win={win} page={doc.pages[id]} document={doc} compute={compute} />
    ) : (
      <div className="native-speaker-preview" data-speaker-preview role="status">
        {failedPreviews.has(id) ? '预览未能加载，点按重试。' : '正在加载幻灯片…'}
      </div>
    )
  return createPortal(
    <section
      ref={root}
      className={`native-editor native-speaker ${wide ? 'native-speaker-wide' : ''}`}
      data-native-editor-boundary
      aria-label="演讲者视图"
    >
      <style>{styles}</style>
      <div className="native-speaker-left">
        <div className="native-speaker-bar">
          <span
            className={`native-speaker-clock ${clock.running ? '' : 'native-speaker-paused'}`}
            data-speaker-clock
            title={clock.running ? '已用时间' : '已用时间（已暂停）'}
          >
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
          </span>
          <button
            type="button"
            className="native-speaker-pill"
            data-speaker-running={clock.running}
            onClick={() => {
              const time = Date.now()
              setNow(time)
              setClock((value) => ({
                running: !value.running,
                start: time,
                elapsed: value.elapsed + (value.running ? time - value.start : 0),
              }))
            }}
          >
            {clock.running ? '暂停' : '继续'}
          </button>
          <button
            type="button"
            className="native-speaker-pill native-speaker-reset"
            onClick={() => {
              const time = Date.now()
              setNow(time)
              setClock((value) => ({ ...value, start: time, elapsed: 0 }))
            }}
          >
            重置
          </button>
          <span className="native-speaker-position">
            <span data-speaker-position>
              第 {index + 1} / {pages.length} 页
            </span>
            {([-1, 1] as const).map((direction) => (
              <button
                type="button"
                className="native-speaker-nav"
                key={direction}
                aria-label={direction < 0 ? '上一页' : '下一页'}
                title={
                  direction < 0
                    ? previous
                      ? '上一页'
                      : '已是第一页'
                    : next
                      ? '下一页'
                      : '已是最后一页'
                }
                disabled={direction < 0 ? !previous : !next}
                onClick={() => navigate(direction < 0 ? previous : next)}
              >
                <EditorIcon name={direction < 0 ? 'previous' : 'next'} size={16} />
              </button>
            ))}
          </span>
        </div>
        {wide && (
          <>
            <div className="native-speaker-current">{preview(pageId)}</div>
            <div className="native-speaker-adjacent">
              {[
                [previous, '上一页'],
                [next, '下一页'],
              ].map(([id, label], position) => (
                <div
                  className="native-speaker-column"
                  key={position}
                  style={!id ? { visibility: 'hidden' } : undefined}
                >
                  <span className="native-speaker-label">
                    {label}
                    <span className="native-speaker-dim">
                      {id ? ` · ${slideTitleSnippet(doc.pages[id])}` : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="native-speaker-thumb"
                    aria-label={
                      id && failedPreviews.has(id) ? `重新加载${label}预览` : `转到${label}`
                    }
                    title={id ? slideTitleSnippet(doc.pages[id]) : undefined}
                    disabled={!id}
                    onClick={() => {
                      if (id && failedPreviews.has(id)) loadPreview(id)
                      else navigate(id)
                    }}
                  >
                    {id && preview(id)}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="native-speaker-right">
        <header className="native-speaker-head">
          <span>讲者备注</span>
          <button
            type="button"
            className="native-speaker-switch"
            role="switch"
            aria-label="编辑备注"
            aria-checked={editing}
            title={writable ? '在此编辑讲者备注' : '当前演示文稿为只读'}
            disabled={!writable}
            onClick={() => setEditing((value) => !value)}
          >
            编辑
            <i aria-hidden="true" />
          </button>
        </header>
        {editing ? (
          <TextAreaField
            key={pageId}
            className="native-speaker-notes"
            label="讲者备注"
            value={page?.notes ?? ''}
            disabled={!writable}
            placeholder="添加讲者备注"
            onFocus={() => {
              base.current = getNotesBase()
            }}
            onCommit={(notes) => {
              onNotesCommit(pageId, notes, base.current ?? getNotesBase())
              base.current = getNotesBase()
            }}
          />
        ) : (
          <div
            role="region"
            aria-label="讲者备注"
            className="native-speaker-notes"
            data-speaker-notes
            tabIndex={0}
          >
            <div>
              {page?.notes || <span className="native-speaker-dim">本页没有讲者备注。</span>}
            </div>
          </div>
        )}
        {!wide && (
          <div className="native-speaker-next">
            {next ? (
              <>
                下一页：
                <span className="native-speaker-dim">{slideTitleSnippet(doc.pages[next])}</span>
              </>
            ) : (
              '已是最后一页'
            )}
          </div>
        )}
      </div>
    </section>,
    win.document.body,
  )
}
