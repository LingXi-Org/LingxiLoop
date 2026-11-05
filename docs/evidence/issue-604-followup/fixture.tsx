import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { ContentEditor, ContentDocumentView, type ContentDocument } from '../../../src/features/content-editor'
import { MemoContent } from '../../../src/features/learning/forum/memos/MemoContent'

const source = '2*3*4 and x**2\n\n*保留斜体*\n\n`2*3*4`\n\n```python\nx = 2*3*4\n```\n\n$2*3*4$\n\n$$\nx**2 + 2*3*4\n$$\n\n<https://example.invalid/2*3*4>\n\nhttps://example.invalid/2*3*4\n\ntail'
const parts = ['```\nimport x\nfrom x import y\nx = 1\ny = 2', '', 'if x:\n    print(y)', '', 'print(x)', '```']
const historical = (italic: boolean): ContentDocument => ({ format: 'blocknote', version: 1, projection: parts.join('\n'), sections: [], blocks: parts.map((text, index) => ({ id: `p${index}`, type: 'paragraph', props: { textAlignment: 'left', textColor: 'default', backgroundColor: 'default' }, children: [], content: [{ type: 'text', text, styles: italic && index === 2 ? { italic: true } : {} }] })) })
function Fixture() {
  const [draft, setDraft] = useState<{ value: string; document?: ContentDocument }>({ value: source })
  const [open, setOpen] = useState(0)
  const saved = useRef<{ value: string; document?: ContentDocument } | undefined>(undefined)
  return <main style={{ maxWidth: 900, margin: 'auto', padding: 16, overflowWrap: 'anywhere' }}>
    <section id="memo"><h1>保存文本阅读</h1><MemoContent content={source} literalOperators /></section>
    <section id="editor"><h2>编辑并重新打开</h2><ContentEditor key={open} value={draft.value} document={draft.document} label="保真作答" legacyFormat="forum" onChange={(value, document) => setDraft({ value, document })} />
      <button onClick={() => { saved.current = JSON.parse(JSON.stringify(draft)); setDraft(saved.current!); setOpen(value => value + 1) }}>保存并重新打开</button>
      <output data-open-count={open}>{JSON.stringify(saved.current ?? null)}</output>
    </section>
    <section id="plain"><h2>历史无样式围栏</h2><ContentDocumentView document={historical(false)} legacyFormat="markdown" /></section>
    <section id="styled"><h2>保留历史斜体</h2><ContentDocumentView document={historical(true)} legacyFormat="markdown" /></section>
  </main>
}
createRoot(document.getElementById('root')!).render(<ThemeProvider attribute="class" defaultTheme="light"><Fixture /></ThemeProvider>)
