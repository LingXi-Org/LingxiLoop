import { Bold, Italic, Underline } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useLocalDraft } from './draft-context'
import type { ArtifactRichText } from '../../../../shared/artifact-document'

function normalizedRichText(raw: ArtifactRichText): ArtifactRichText {
  return {
    type: raw.type,
    ...(raw.text !== undefined ? { text: raw.text } : {}),
    ...(raw.attrs ? { attrs: { ...(raw.attrs.level !== undefined ? { level: raw.attrs.level } : {}), ...(raw.attrs.start !== undefined ? { start: raw.attrs.start } : {}), ...(raw.attrs.textAlign ? { textAlign: raw.attrs.textAlign } : {}) } } : {}),
    ...(raw.marks ? { marks: raw.marks.flatMap<NonNullable<ArtifactRichText['marks']>[number]>(mark => {
      if (mark.type !== 'link') return [{ type: mark.type }]
      if (!mark.attrs?.href || !/^(https?:\/\/|mailto:|#)/i.test(mark.attrs.href)) return []
      return [{ type: 'link' as const, attrs: { href: mark.attrs.href, ...(mark.attrs.target === '_blank' || mark.attrs.target === '_self' ? { target: mark.attrs.target } : {}) } }]
    }) } : {}),
    ...(raw.content ? { content: raw.content.map(normalizedRichText) } : {}),
  }
}

export default function RichTextEditor({ value, text, onChange, onFinish }: {
  value?: ArtifactRichText; text: string; onChange(value: ArtifactRichText, text: string): void; onFinish(): void
}) {
  const callback = useRef(onChange)
  callback.current = onChange
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composing = useRef(false)
  const lastSaved = useRef('')
  const editor = useEditor({
    extensions: [StarterKit.configure({ undoRedo: false, codeBlock: false, horizontalRule: false, trailingNode: false })],
    content: value ?? { type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] },
    autofocus: 'end',
    editorProps: {
      attributes: { 'aria-label': '编辑文本', 'data-native-text-editor': 'true', role: 'textbox', 'aria-multiline': 'true' },
      handleDOMEvents: {
        compositionstart: () => { composing.current = true; markDirty(true); return false },
        compositionend: (_view, event) => { composing.current = false; if (event.isTrusted) queueMicrotask(save); return false },
      },
      handleKeyDown: (_view, event) => { if (event.key === 'Escape' && !event.isComposing) { save(); onFinish(); return true } return false },
    },
    onCreate: ({ editor }) => { if (!lastSaved.current) lastSaved.current = JSON.stringify(normalizedRichText(editor.getJSON() as ArtifactRichText)) },
    onUpdate: () => { markDirty(true); if (pending.current) clearTimeout(pending.current); pending.current = setTimeout(save, 500) },
    onBlur: () => { save() },
  })
  function save() {
    if (!editor || composing.current || !lastSaved.current) return
    if (pending.current) { clearTimeout(pending.current); pending.current = null }
    const next = normalizedRichText(editor.getJSON() as ArtifactRichText)
    const serialized = JSON.stringify(next)
    if (serialized === lastSaved.current) { markDirty(false); return }
    lastSaved.current = serialized
    callback.current(next, editor.getText()); markDirty(false)
  }
  const markDirty = useLocalDraft(save)
  useEffect(() => {
    // StrictMode may clean up this effect before Tiptap's asynchronous onCreate.
    // Establish the editor's normalized baseline before any cleanup can flush it.
    if (editor && !lastSaved.current) lastSaved.current = JSON.stringify(normalizedRichText(editor.getJSON() as ArtifactRichText))
    return () => { save(); if (pending.current) clearTimeout(pending.current) }
  }, [editor])
  if (!editor) return null
  return <div className="native-rich-editor" onPointerDown={event => event.stopPropagation()}>
    <div className="native-text-tools" role="toolbar" aria-label="文字格式" onMouseDown={event => event.preventDefault()}>
      <button type="button" aria-label="加粗" aria-pressed={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} aria-hidden="true" /></button>
      <button type="button" aria-label="斜体" aria-pressed={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} aria-hidden="true" /></button>
      <button type="button" aria-label="下划线" onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline size={16} aria-hidden="true" /></button>
      <button type="button" aria-label="项目列表" onClick={() => editor.chain().focus().toggleBulletList().run()}>• 列表</button>
      <button type="button" aria-label="编号列表" onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. 列表</button>
      <button type="button" onClick={() => { save(); onFinish() }}>完成</button>
    </div>
    <EditorContent editor={editor} />
  </div>
}
