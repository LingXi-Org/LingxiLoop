import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { convertEnvelope, projectMessageGroups } from '@/features/chat/runtime/converter'
import { createNativeMessage } from '@/lib/nativeMessage'
import { useParticipants } from '@/features/agents/state'
import { useChatThreadStore, EMPTY_CONVERSATION_CHAT_STATE } from '@/features/chat/runtime/store'
import { homeworkApi } from '@/features/learning/homework/api'
import '@/styles/globals.css'
const participants = { agent: { id:'agent', kind:'agent', name:'尺寸检查助手', initial:'助', avatarBg:'transparent', status:'avail' } } as const
useParticipants.setState({ byId: participants })
const long = 'VeryLongUnbrokenHomeworkCriterion'.repeat(25)
const homework = { id:'draft', courseId:'course', title:long.slice(0,200), instructions:'作业正文\n\n'+long, criteria:[long], links:[], attachments:[{key:'synthetic.pdf',name:long+'.pdf'}], dueAt:'2026-11-20T10:00:00Z',status:'DRAFT',revision:1,visibleHash:'fixture',createdBy:'teacher',canPublish:false,canEditDraft:true,validation:{status:'MATERIAL_ERROR',revision:1,feedback:long} }
let release:()=>void
const gate = new Promise<void>(resolve=>{release=resolve})
homeworkApi.detail = async()=>{await gate; return {homework,student:null,teacher:true} as any}
homeworkApi.saveDraft = async()=>{throw new Error('Synthetic save failure')}

;(window as any).releaseDraft=()=>release()
const initialText=Array.from({length:30},(_,i)=>`第 ${i+1} 行公开答复，用于确定性尺寸检查。`).join('\n\n')
function makeMessage(text:string, draft=false) {
 const content:any[]=[{type:'text',text:initialText}]
 if(draft)content.push({type:'tool-call',toolCallId:'draft',toolName:'teacher.draft_homework',args:{},argsText:'{}',result:{status:'completed',value:{result:{courseId:'course',homeworkId:'draft'}}}})
 if(text.length>initialText.length)content.push({type:'text',text:text.slice(initialText.length)})
 return convertEnvelope({channelId:'room',channelType:2,fromUid:'agent',clientMsgNo:'reply',messageId:'reply',messageSeq:1,timestamp:1767225600,payload:createNativeMessage({id:'reply',role:'assistant',content})},{participants,meId:'teacher'})
}
function Fixture(){
 const params=new URLSearchParams(location.search),draft=params.has('draft')
 const [running,setRunning]=useState(false)
 ;(window as any).start=()=>setRunning(true)
 ;(window as any).finish=()=>setRunning(false)
 const [text,setText]=useState(initialText)
 const reply=makeMessage(text,draft)
 if(running)reply.status={type:'running'}
 const messages=projectMessageGroups([reply])
 useChatThreadStore.setState({conversations:{room:{...EMPTY_CONVERSATION_CHAT_STATE,messages,loaded:true,hasMoreOlder:false}}})
 ;(window as any).append=()=>setText(value=>value+'\n\n'+Array.from({length:8},()=> '新追加的答复内容。').join('\n\n'))
 ;(window as any).rich=()=>setText(value=>value+'\n\n```text\n'+long+'\n```\n\n|'+Array(12).fill('列标题').join('|')+'|\n|'+Array(12).fill('---').join('|')+'|\n|'+Array(12).fill('单元格内容').join('|')+'|')
 const runtime=useExternalStoreRuntime({messages,isRunning:running,onNew:async()=>{}})
 return <TooltipProvider><AssistantRuntimeProvider runtime={runtime}><div style={{height:'100dvh',display:'flex',flexDirection:'column',maxWidth:900,marginInline:'auto'}}><div style={{height:48,flexShrink:0}}>确定性合成数据</div><div style={{minHeight:0,flex:1}}><ConversationThread conversationId="room" readOnly /></div><div style={{height:88,flexShrink:0,borderTop:'1px solid gray'}}>输入区占位（不覆盖视口）</div></div></AssistantRuntimeProvider></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
