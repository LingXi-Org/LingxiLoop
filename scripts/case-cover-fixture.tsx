// Synthetic component fixture only. This is not a generated Hairline acceptance sample.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { CaseCover, type CaseCoverDescriptor } from '../src/features/cases/CaseCover'
import '../src/styles/globals.css'

const descriptor = (id: number): CaseCoverDescriptor => ({ schemaVersion: 1, status: 'ready', fingerprint: `fixture-${id}`, generation: 1,
  alt: `抽屉柜${id}，中文无障碍说明`, previewUrl: `/api/cases/fixture/cover/assets/job${id}/1/preview?snapshot=published`,
  interactiveUrl: `/api/cases/fixture/cover/assets/job${id}/1/interactive?snapshot=published`, canRetry: false })
function Fixture() {
  const [scope, setScope] = useState(1)
  const [mounted, setMounted] = useState(true)
  return <main className="mx-auto max-w-3xl space-y-4 p-6">
    <h1 className="text-xl">合成封面隔离边界</h1>
    <p>此处验证可复用组件，不作为真实模型生成验收。</p>
    <button type="button" onClick={() => setScope(value => value + 1)}>切换组织</button>
    <button type="button" onClick={() => setMounted(value => !value)}>切换页面</button>
    <div className="grid grid-cols-3 gap-4">{mounted && [1, 2, 3].map(id => <section key={id} data-fixture-cover={id}>
      <CaseCover cover={descriptor(id)} title={`知识整理${id}`} scopeKey={`company-${scope}:reader`} />
      <a href={`#article-${id}`}>阅读案例{id}</a>
    </section>)}</div>
    <div className="h-[150vh]" aria-hidden="true" />
  </main>
}
const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light'
createRoot(document.getElementById('root')!).render(<ThemeProvider attribute="class" forcedTheme={theme}><Fixture /></ThemeProvider>)
