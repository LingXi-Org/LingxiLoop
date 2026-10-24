import { createContext, useContext, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useAui, useAuiState, useExternalStoreRuntime } from '@assistant-ui/react'
import { MarkdownText } from '../src/components/assistant-ui/markdown-text'
import { NativeMessageContent } from '../src/features/chat/components/NativeMessageContent'
import { ComposerQuotePreview } from '../src/features/chat/components/QuotePreview'
import { copyMessageText, useMessageCopyText } from '../src/features/chat/components/MessageActions'
import { createNativeMessage, deserializeMessage } from '../src/lib/nativeMessage'
import { presentParticipant } from '../src/lib/participantDisplayName'
import { useParticipants } from '../src/features/agents/state'
import { useConversations } from '../src/features/conversations/store'
import { ComposerTriggers } from '../src/features/chat/components/ComposerTriggers'
import { ComposerLexicalInput } from '../src/features/chat/components/ComposerLexicalInput'
import { Button } from '../src/components/ui/button'
import type { Participant } from '../src/types'
import '../src/styles/globals.css'

const base: Participant[] = ['nova','sage','milo','trace','scout','forge'].map(id => presentParticipant({
  id, name:id, kind:'agent' as const, presetKey:id, initial:'助', avatarBg:'transparent', status:'avail' as const,
}))
const full = '成员：@nova、@sage、@milo、@trace、@scout、@forge。\n\n| 成员 ID | 分工 |\n| --- | --- |\n| sage | 查证 |\n\n> 历史：@milo 已核对。\n\n旧格式 `@trace`；未知 @sagee。'
const Members = createContext(base)
function Text() { return <MarkdownText agent mentionTargets={useContext(Members)} /> }
function Message() {
  const roster = useContext(Members), ref = useRef<HTMLDivElement>(null), aui = useAui()
  const {getText} = useMessageCopyText(ref,roster), [copied,setCopied] = useState('')
  const id = useAuiState(state=>state.message.id)
  return <MessagePrimitive.Root><div ref={ref} data-msg-id={id} className="rounded-xl border p-4">
    <NativeMessageContent Text={Text} />
    <div className="mt-4 flex gap-2"><Button onClick={async()=>{const text=getText(); await copyMessageText(text);setCopied(text)}}>复制正文</Button>
      <Button onClick={()=>aui.thread.composer().setQuote({messageId:id,text:getText()})}>引用正文</Button></div>
    <output aria-label="复制内容" className="sr-only">{copied}</output>
  </div></MessagePrimitive.Root>
}
useParticipants.setState({byId:Object.fromEntries(base.map(p=>[p.id,p])),loaded:true})
useConversations.setState({list:[{id:'chinese-fixture',kind:'group',title:'合成房间',members:base.map(p=>p.id),leaderId:'nova',lastAt:'',lastAtIso:'',preview:''}],loaded:true})
function Preview() {
  const [roster,setRoster] = useState(base), [prefix,setPrefix] = useState(0), [history,setHistory] = useState(false)
  const prefixes = ['@n','@no','@nov','@nova','`@sa','`@sag','`@sage`',full]
  const text = prefixes[prefix]
  const source = createNativeMessage({id:'chinese-message',role:'assistant',content:[{type:'text',text}],
    status: prefix === 7 ? {type:'complete',reason:'stop'} : {type:'running'},
    custom:{conversationId:'chinese-fixture',senderId:'nova',senderKind:'agent',senderName:'司南'}})
  const message = history ? JSON.parse(JSON.stringify(source)) : source
  const runtime = useExternalStoreRuntime({messages:[deserializeMessage(message)],isRunning:prefix!==7,onNew:async()=>{}})
  const insert = useRef<()=>void>(()=>{})
  return <main className="mx-auto max-w-3xl space-y-4 p-5"><h1 className="text-xl font-semibold">中文提及与交接</h1>
    <p>合成成员与历史，内部身份保持不变。</p>
    <div className="flex flex-wrap gap-2"><Button onClick={()=>setPrefix(p=>Math.min(7,p+1))}>推进流式片段</Button>
      <Button onClick={()=>setPrefix(7)}>完成答复</Button><Button onClick={()=>{const next=base.map(p=>p.id==='sage'?{...p,name:'新的明理',sourceName:'新的明理'}:p);useParticipants.setState({byId:Object.fromEntries(next.map(p=>[p.id,p]))});setRoster(next)}}>修改中文名</Button>
      <Button onClick={()=>setHistory(true)}>刷新历史</Button></div>
    <ul aria-label="成员名册" className="flex flex-wrap gap-3">{roster.map(p=><li key={p.id}>{p.name}</li>)}</ul>
    <Members.Provider value={roster}><AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root><ThreadPrimitive.Viewport><ThreadPrimitive.Messages components={{Message}} /></ThreadPrimitive.Viewport>
        <ComposerPrimitive.Root><ComposerQuotePreview onDismiss={()=>{}} />
        <ComposerTriggers conversationId="chinese-fixture" onOpenPoll={()=>{}}><ComposerLexicalInput conversationId="chinese-fixture" insertMentionRef={insert} aria-label="提及编辑器" className="rounded-lg border p-3" /></ComposerTriggers></ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider></Members.Provider>
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
