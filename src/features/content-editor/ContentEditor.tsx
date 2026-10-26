import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import './content-editor.css'
import { syntaxHighlighter } from '@blocknote/code-block'
import { NativeView } from './NativeView'
import { contentSchema, contentDictionary } from './schema'
import { importLegacy } from './legacy'
import { pasteContent } from './paste'
import { useCreateBlockNote } from '@blocknote/react'
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { usableDocument, type ContentDocument } from './document'

export interface ContentEditorHandle {
  insertImage(url: string, name: string): void
  removeFile(url: string): void
  replaceSection(index: number, original: string, replacement: string): boolean
  focus(): void
}

/** Business adapter only: all blocks, menus, toolbars and interactions are upstream defaults. */
export const ContentEditor = forwardRef<ContentEditorHandle, {
  value: string; document?: ContentDocument | null; label: string
  /** Legacy structured plain-text items must not merge through Markdown parsing. */
  legacyParagraphs?: string[]
  onChange(value: string, document: ContentDocument, sections: string[]): void
  uploadFile?(file: File): Promise<string>
  disabled?: boolean; compact?: boolean; maxLength?: number; legacyFormat?: 'forum' | 'markdown'; onFocus?(): void
}>(({ value, document, legacyParagraphs, label, onChange, uploadFile, disabled = false, compact = false, maxLength = 20000, legacyFormat = 'forum', onFocus }, ref) => {
  const { resolvedTheme } = useTheme()
  const current = useRef({ onChange, uploadFile })
  current.current = { onChange, uploadFile }
  const syncing = useRef(false)
  const legacyParagraphKey = usableDocument(document, value) ? undefined : legacyParagraphs && JSON.stringify(legacyParagraphs)
  const last = useRef<{ value: string; document?: ContentDocument | null; legacyParagraphKey?: string } | null>(null)
  const original = useRef(document?.legacyMarkdown ?? value)
  const editor = useCreateBlockNote({
    schema: contentSchema, dictionary: contentDictionary, extensions: [syntaxHighlighter], pasteHandler: context => pasteContent(context, legacyFormat),
    domAttributes: { editor: { 'aria-label': label, role: 'textbox', 'aria-multiline': 'true' } },
    uploadFile: async file => {
      if (!current.current.uploadFile) throw new Error('此内容不支持上传附件，请使用链接。')
      return current.current.uploadFile(file)
    },
  })
  useLayoutEffect(() => {
    if (last.current?.value === value && last.current.document === document && last.current.legacyParagraphKey === legacyParagraphKey) return
    syncing.current = true
    const blocks = usableDocument(document, value) ? document.blocks
      : legacyParagraphs ? legacyParagraphs.map(content => ({ type: 'paragraph' as const, content }))
        : importLegacy(editor, value, legacyFormat)
    editor.transact(transaction => {
      transaction.setMeta('addToHistory', false)
      editor.replaceBlocks(editor.document, blocks.length ? blocks : [{ type: 'paragraph' }])
    })
    original.current = usableDocument(document, value) ? document.legacyMarkdown ?? value : value
    last.current = { value, document, legacyParagraphKey }
    syncing.current = false
  }, [editor, value, document, legacyFormat, legacyParagraphs, legacyParagraphKey])
  useImperativeHandle(ref, () => ({
    focus: () => editor.focus(),
    replaceSection: (index, originalText, replacement) => {
      if (disabled || !replacement.trim()) return false
      const blocks = editor.document.filter(block => editor.blocksToMarkdownLossy([block]).trim())
      const block = blocks[index]
      // Match exactly what the teacher reviewed; preserve every unselected native block.
      if (!block) return false
      const section = usableDocument(document, value) ? editor.blocksToMarkdownLossy([block]).trim() : legacyParagraphs?.[index] ?? editor.blocksToMarkdownLossy([block]).trim()
      if (section !== originalText) return false
      editor.replaceBlocks([block], [{ type: 'paragraph', content: replacement.trim() }])
      return true
    },
    insertImage: (url, name) => {
      editor.insertBlocks([{ type: 'image', props: { url, name } }], editor.getTextCursorPosition().block, 'after')
      editor.focus()
    },
    removeFile: url => {
      const ids: string[] = []
      editor.forEachBlock(block => { if ('url' in block.props && block.props.url === url) ids.push(block.id); return true })
      if (ids.length) editor.removeBlocks(ids)
    },
  }), [editor, disabled, document, value, legacyParagraphs])
  return <div data-content-editor className={`content-editor ${compact ? 'content-editor-compact' : ''}`} onFocusCapture={onFocus}
    onSubmit={event => event.stopPropagation()}>
    <NativeView editor={editor} editable={!disabled} theme={resolvedTheme === 'dark' ? 'dark' : 'light'} onChange={() => {
      if (syncing.current) return
      const markdown = editor.blocksToMarkdownLossy()
      const sections = editor.document.map(block => editor.blocksToMarkdownLossy([block]).trim()).filter(Boolean)
      const next: ContentDocument = { format: 'blocknote', version: 1, blocks: editor.document, projection: markdown, sections, ...(original.current ? { legacyMarkdown: original.current } : {}) }
      last.current = { value: markdown, document: next }
      current.current.onChange(markdown, next, sections)
    }} />
    {!compact && <p className="px-3 pb-2 text-xs text-muted-foreground" role={value.length > maxLength ? 'alert' : undefined}>
      {value.length > maxLength ? `内容超过 ${maxLength.toLocaleString()} 字，请缩短后保存。` : `${value.length.toLocaleString()} / ${maxLength.toLocaleString()}`}
    </p>}
  </div>
})
ContentEditor.displayName = 'ContentEditor'

export function ContentDocumentView({ document }: { document: ContentDocument }) {
  const { resolvedTheme } = useTheme()
  const editor = useCreateBlockNote({ initialContent: document.blocks, schema: contentSchema, dictionary: contentDictionary, extensions: [syntaxHighlighter] }, [document])
  return <div className="content-document"><NativeView editor={editor} editable={false} theme={resolvedTheme === 'dark' ? 'dark' : 'light'} /></div>
}
