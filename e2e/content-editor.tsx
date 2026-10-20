// Isolated UI acceptance. Business persistence/authorization is tested by the cases/forum suites.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppThemeProvider } from '@/components/AppThemeProvider'
import { ContentEditor, ContentDocumentView, type ContentDocument } from '@/features/content-editor'
import '@/styles/globals.css'
if (!import.meta.env.DEV) throw new Error('Isolated fixture requires development mode')
const legacy = '# 原有内容\n\n原价 $5，折后 $3。\n下一行仍保留。\n\n保持普通段落\n---\n\n保留中文、[资料](https://example.org)和公式 $x^2$。\n\n- [ ] 核对资料\n\n```ts\nconst value = 2\n```\n\n```mermaid\ngraph LR\n A[观察] --> B[结论]\n```\n\n$$\nx^2+y^2=z^2\n$$\n\n文末段落'
function Fixture() {
  const [value,setValue]=useState(legacy),[document,setDocument]=useState<ContentDocument|null>(null),[key,setKey]=useState(0),[preview,setPreview]=useState(false)
  return <AppThemeProvider><main className="mx-auto max-w-3xl space-y-4 p-4"><h1>官方原生编辑器 · 隔离 UI 验收</h1>
    <ContentEditor key={key} label="原生正文" value={value} document={document} onChange={(next,doc)=>{setValue(next);setDocument(doc)}}/>
    <button type="button" onClick={()=>{localStorage.setItem('native-219',JSON.stringify({value,document}));setKey(key+1);setPreview(true)}}>保存并重新打开</button>
    {preview&&document&&<section aria-label="已保存文档"><ContentDocumentView document={document}/></section>}
  </main></AppThemeProvider>
}
createRoot(window.document.getElementById('root')!).render(<Fixture/> )
