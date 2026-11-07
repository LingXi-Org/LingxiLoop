import { useLayoutEffect, useRef } from 'react'
import { EditorIcon } from './EditorPrimitives'

/** A cancel control stays available while the heavy preview module is loading. */
export function BoardPreviewLoading({ title, onClose, onSave }: { title: string; onClose(): void; onSave(): void }) {
  const back = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => back.current?.focus({ preventScroll: true }), [])
  return <section className="native-board-preview" data-native-editor-boundary role="region" aria-label="画板全窗口预览" onKeyDown={event => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopPropagation(); onSave() }
  }}>
    <header className="native-board-preview-header"><button ref={back} type="button" className="native-icon-button" aria-label="返回画布" onClick={onClose}><EditorIcon name="previous" size={16} /></button><span className="native-board-preview-title">{title}</span></header>
    <div className="native-board-preview-viewport"><p role="status">正在加载全窗口预览…</p></div>
  </section>
}
