// Repeatable browser acceptance without Playwright, through the real conversation thread.
// Failure cases: v2 filtering, reordered mixed parts, lost replay fields, unusable media,
// hidden approvals, partial tool arguments, missing nested messages or editable child content.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, useExternalStoreRuntime, type ThreadMessage } from '@assistant-ui/react'
import { ConversationThread } from '../src/features/chat/components/ConversationThread'
import { convertEnvelope } from '../src/features/chat/runtime/converter'
import { useParticipants } from '../src/features/agents/state'
import { serializeMessage, deserializeMessage } from '../src/lib/nativeMessage'
import '../src/styles/globals.css'

const participants = { agent: { id: 'agent',kind: 'agent' as const,name: '验收助手',initial: '助',avatarBg: 'transparent',status: 'avail' as const } }
useParticipants.setState({ byId:participants })
const metadata = { unstable_state:null,unstable_data:[],unstable_annotations:[],steps:[],custom:{} }
const native: ThreadMessage = { id:'mixed',role:'assistant',createdAt:new Date('2026-10-02T00:00:00Z'),
  status:{ type:'running' },metadata,content:[
    { type:'text',text:'第一段：原生消息' },
    { type:'reasoning',text:'允许公开的推理摘要',unstable_summary:'推理摘要' },
    { type:'image',image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lxoAAAAASUVORK5CYII=',filename:'pixel.png' },
    { type:'text',text:'第二段：图片之后' },
    { type:'source',sourceType:'url',id:'url',title:'URL 来源',url:'https://example.com' },
    { type:'source',sourceType:'document',id:'document',title:'文档来源',mediaType:'application/pdf',filename:'evidence.pdf' },
    { type:'file',data:'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',sourceType:'url',mimeType:'audio/wav',filename:'audio.wav' },
    { type:'file',data:'data:video/webm;base64,AAAA',sourceType:'url',mimeType:'video/webm',filename:'video.webm' },
    { type:'generative-ui',id:'tree',spec:{ root:{ component:'Card',props:{ title:'动态组件树' },children:[{ component:'Text',props:{ value:'白名单组件' } }] } } },
    { type:'data',name:'tool-activity',data:{ title:'业务数据卡片',status:'完成' } },
    { type:'tool-call',toolCallId:'partial',toolName:'fixture.partial',args:{ query:'par' },argsText:'{"query":"par' },
    { type:'tool-call',toolCallId:'approval',toolName:'fixture.approval',args:{},argsText:'{}',approval:{ id:'approval' } },
    { type:'tool-call',toolCallId:'expired',toolName:'fixture.expired',args:{},argsText:'{}',approval:{ id:'expired',resolution:'expired' } },
    { type:'tool-call',toolCallId:'input',toolName:'fixture.input',args:{},argsText:'{}',interrupt:{ type:'human',payload:{ prompt:'需要补充信息' } } },
    { type:'tool-call',toolCallId:'child',toolName:'fixture.child',args:{},argsText:'{}',result:{ ok:true },timing:{ startedAt:1,completedAt:11 },
      messages:[{ id:'nested',role:'assistant',createdAt:new Date(0),status:{ type:'complete',reason:'stop' },metadata,
        content:[{ type:'text',text:'嵌套消息正文' },{ type:'generative-ui',spec:{ root:{ component:'Badge',props:{ value:'嵌套组件' } } } }] }] },
  ] }
const initial = convertEnvelope({ channelId:'fixture',channelType:2,fromUid:'agent',clientMsgNo:'mixed',messageId:'mixed',messageSeq:0,timestamp:1790899200,
  payload:serializeMessage(native) },{ participants,meId:'me' })

function App() {
  const [message,setMessage] = useState(initial), [result,setResult] = useState<Record<string,unknown>>({ status:'待运行' })
  const runtime = useExternalStoreRuntime({ messages:[message],isRunning:message.status?.type === 'running',onNew:async () => {},
    onResumeToolCall:({ toolCallId,payload }) => setMessage(current => ({ ...current,content:current.content.map(part => {
      if (part.type !== 'tool-call' || part.toolCallId !== toolCallId) return part
      const { interrupt:_interrupt,...rest } = part; return { ...rest,result:{ answer:payload } }
    }) } as ThreadMessage)),
    onRespondToToolApproval:async ({ approvalId,approved }) => setMessage(current => ({ ...current,
      content:current.content.map(part => part.type === 'tool-call' && part.approval?.id === approvalId ? { ...part,approval:{ ...part.approval,approved } } : part) } as ThreadMessage)) })
  const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  async function until(check: () => boolean, label: string) {
    const deadline = Date.now()+5000
    while (!check()) {
      if (Date.now()>deadline) throw new Error(label)
      await new Promise(resolve => setTimeout(resolve,30))
    }
  }
  async function run() {
    try {
      setResult({ status:'运行中' })
      const canvas = document.createElement('canvas'); canvas.width=160; canvas.height=90
      const context = canvas.getContext('2d')!, stream = canvas.captureStream(0)
      const recorder = new MediaRecorder(stream,{ mimeType:'video/webm' }), chunks:Blob[] = []
      recorder.ondataavailable = event => chunks.push(event.data)
      const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve() })
      recorder.start()
      for (let frame=0;frame<10;frame++) {
        context.fillStyle = frame % 2 ? '#2563eb' : '#0f172a'; context.fillRect(0,0,160,90)
        ;(stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack).requestFrame()
        await new Promise(resolve => setTimeout(resolve,100))
      }
      recorder.stop(); await stopped; stream.getTracks().forEach(track => { track.stop() })
      const video = `data:video/webm;base64,${btoa(String.fromCharCode(...new Uint8Array(await new Blob(chunks).arrayBuffer())))}`
      const wave = new Uint8Array(8044), header = new DataView(wave.buffer)
      for (const [offset,text] of [[0,'RIFF'],[8,'WAVEfmt '],[36,'data']] as const) wave.set(new TextEncoder().encode(text),offset)
      header.setUint32(4,8036,true); header.setUint32(16,16,true); header.setUint16(20,1,true); header.setUint16(22,1,true)
      header.setUint32(24,8000,true); header.setUint32(28,8000,true); header.setUint16(32,1,true); header.setUint16(34,8,true); header.setUint32(40,8000,true)
      wave.fill(128,44)
      const audio = `data:audio/wav;base64,${btoa(String.fromCharCode(...wave))}`
      const playable = { ...message,content:message.content.map(part => part.type === 'file' ? { ...part,data:part.mimeType === 'audio/wav' ? audio : video } : part) } as ThreadMessage
      setMessage(playable); await paint()
      const surface = document.querySelector('#native-content')!
      await until(() => surface.querySelector('audio')?.src === audio && surface.querySelector('video')?.src === video,'媒体未更新')
      const order = [...surface.querySelectorAll('[data-native-part]')].slice(0,4).map(node => node.getAttribute('data-native-part'))
      if (order.join(',') !== 'text,reasoning,image,text') throw new Error('真实线程丢失消息或混合内容顺序变化')
      if ((surface.querySelector('[data-native-part="reasoning"] details') as HTMLDetailsElement)?.open) throw new Error('推理内容默认展开')
      if (surface.querySelectorAll('audio[controls],video[controls]').length !== 2) throw new Error('媒体控件缺失')
      for (const media of surface.querySelectorAll<HTMLMediaElement>('audio,video')) {
        media.muted=true; await media.play()
        await until(() => media.currentTime > 0 || Boolean(media.error),`${media.tagName} 未开始播放`)
        media.pause()
        if (media.currentTime <= 0 || media.error) throw new Error(`${media.tagName} 无法播放：time=${media.currentTime},ready=${media.readyState},error=${media.error?.code}`)
      }
      for (const text of ['文档来源','白名单组件','业务数据卡片','嵌套消息正文','嵌套组件','已过期','需要补充信息']) {
        if (!surface.textContent?.includes(text)) throw new Error(`内容缺失：${text}`)
      }
      const final = { ...playable,status:{ type:'complete',reason:'stop' },content:playable.content.map(part => part.type === 'tool-call' && part.toolCallId === 'partial'
        ? { ...part,args:{ query:'partial complete' },argsText:'{"query":"partial complete"}',result:{ error:'可回放的工具失败' },isError:true } : part) } as ThreadMessage
      const replay = deserializeMessage(JSON.parse(JSON.stringify(serializeMessage(final))))
      if (JSON.stringify(serializeMessage(replay)) !== JSON.stringify(serializeMessage(final))) throw new Error('回放丢失字段')
      setMessage(replay); await paint()
      await until(() => surface.textContent?.includes('可回放的工具失败') === true,'工具失败结果丢失')
      setResult({ status:'通过',checks:['真实线程 v2','混合顺序','推理折叠','音视频实际播放','两类来源','data','动态组件','嵌套消息','参数增量','审批过期','人工输入','工具错误','序列化回放'],at:new Date().toISOString() })
    } catch (error) { setResult({ status:'失败',error:String(error) }) }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{ type:'application/json' }))
    const link = document.createElement('a'); link.href=url; link.download='native-message-browser-result.json'; link.click(); URL.revokeObjectURL(url)
  }
  return <main className="mx-auto grid h-dvh max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)] gap-4 p-6"><h1>原生消息浏览器验收</h1>
    <div><div className="flex gap-4"><button onClick={() => void run()}>运行验收</button><button onClick={download}>导出结果</button></div>
      <pre id="native-result" role="status" className="max-h-32 overflow-auto">{JSON.stringify(result,null,2)}</pre></div>
    <div id="native-content" className="min-h-0 overflow-hidden"><AssistantRuntimeProvider runtime={runtime}><ConversationThread conversationId="fixture" threadRootId="fixture-root" readOnly /></AssistantRuntimeProvider></div>
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
