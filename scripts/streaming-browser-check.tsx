// Open /scripts/streaming-browser-check.html on the local Vite server.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, useExternalStoreRuntime, ThreadPrimitive, MessagePrimitive, type ThreadMessage } from '@assistant-ui/react'
import { MarkdownText } from '../src/components/assistant-ui/markdown-text'
import '../src/styles/globals.css'

const chunks = [
  ['第', '第'], ['一段', '第一段'], ['\n\n第二段 **正在', '正在'], ['增长**', '增长'],
  ['\n\n列表：\n- 一', '一'], ['\n- 二', '二'], ['\n\n| 项目 | 值 |\n| --- | --- |\n| 测试 | 正常 |', '正常'],
  ['\n\n```js\nconst value = ', 'const value ='], ['42', '42'], ['\n```', '42'],
] as const
function Text() { return <MarkdownText segmented inlineCitations animateEntry /> }
function Message() { return <MessagePrimitive.Parts components={{ Text }} /> }
function App() {
  const [text, setText] = useState(''), [running, setRunning] = useState(false), [result, setResult] = useState('待运行')
  const messages: ThreadMessage[] = text ? [{ id: 'stable-reply', role: 'assistant', createdAt: new Date(0),
    content: [{ type: 'text', text }], status: running ? { type: 'running' } : { type: 'complete', reason: 'stop' },
    metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} } }] : []
  const runtime = useExternalStoreRuntime({ messages, isRunning: running, onNew: async () => {} })
  const painted = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  async function run() {
    setRunning(true); setText(''); setResult('检查中'); await painted()
    const durations: number[] = []
    let body = '', first: Element | null = null
    try {
      for (const [delta, expected] of chunks) {
        const began = performance.now(); body += delta; setText(body); await painted()
        const surface = document.querySelector('#body')!
        if (!surface.textContent?.includes(expected)) throw new Error(`正文未显示：第 ${durations.length + 1} 次更新`)
        const bubble = surface.querySelector('.im-markdown-bubble')
        if (first && first !== bubble) throw new Error('首气泡被重新创建')
        first ??= bubble; durations.push(performance.now() - began)
        await new Promise(resolve => setTimeout(resolve, 80))
      }
      setRunning(false); await painted()
      if (document.querySelector('#body .im-markdown-bubble') !== first) throw new Error('终态替换重建气泡')
      const sorted = [...durations].sort((a,b) => a-b)
      setResult(`通过 ${durations.length} 次增量；首正文 ${durations[0].toFixed(1)} ms；提交至绘制 P95 ${sorted[Math.ceil(sorted.length * .95)-1].toFixed(1)} ms；气泡节点稳定。仅本地渲染，不包含模型或传输。`)
    } catch (error) { setRunning(false); setResult(String(error)) }
  }
  return <main style={{ maxWidth: 900, margin: '24px auto', padding: 24 }}>
    <h1>连续正文浏览器回归</h1><button type="button" disabled={running} onClick={() => void run()}>运行增量检查</button>
    <p role="status">{result}</p><div id="body"><AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Messages components={{ AssistantMessage: Message, UserMessage: Message }} />
    </AssistantRuntimeProvider></div>
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
