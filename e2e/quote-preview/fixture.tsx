import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { ConversationRuntimeProvider } from '@/features/chat/runtime/runtime'
import { convertEnvelopeBatch, projectMessageGroups } from '@/features/chat/runtime/converter'
import { EMPTY_CONVERSATION_CHAT_STATE, useChatThreadStore } from '@/features/chat/runtime/store'
import { harnessApi } from '@/features/chat/runtime/harness-api'
import { messagesApi } from '@/features/chat/api'
import { useAuth } from '@/stores/auth'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import { createNativeMessage } from '@/lib/nativeMessage'
import type { Participant } from '@/types'
import '@/styles/globals.css'

import type { ImEnvelope } from '@/lib/im/wukong'
import { chatTransport } from '@/features/chat/runtime/transport'
import { useAui } from '@assistant-ui/react'
const participants: Record<string, Participant> = {
  me: { id: 'me', kind: 'human', name: '林悦', initial: '林', avatarBg: '#52796f', status: 'avail' },
  colleague: { id: 'colleague', kind: 'human', name: '陈晨', initial: '陈', avatarBg: '#707f9b', status: 'avail' },
  agent: { id: 'agent', kind: 'agent', name: '望远', initial: '望', avatarBg: 'transparent', status: 'avail' },
}
useAuth.setState({ user: { id: 'me', name: '林悦', email: 'fixture@example.com', emailVerified: true, providers: [] }, activeCompanyId: 'fixture' })
useParticipants.setState({ byId: participants, loaded: true })
useConversations.setState({ list: [{ id: 'quote-preview', title: '产品讨论', kind: 'group', members: Object.keys(participants) }] as never })
const rows = [
  ['original', 'colleague', '使用可视化为我讲解 KV 缓存。'],
  ['mine', 'me', '请重试这条消息。', 'original'],
  ['assistant', 'agent', 'KV 缓存保存先前生成的键和值，避免重复计算。', 'original'],
  ['long-source', 'colleague', '很长的原文与链接 https://example.com/' + 'longpath'.repeat(65)],
  ['long-reply', 'me', '收到，先讨论核心部分。', 'long-source'],
  ['file-source', 'colleague', '', undefined, true],
  ['file-reply', 'agent', '附件信息已收到。', 'file-source'],
  ['unavailable', 'me', '继续讨论。', 'deleted-source'],
  ['foreign-reply', 'me', '不可跨会话解析原文。', 'foreign-source'],
  ['file-only-reply', 'me', '', 'original', true],
  ['multi-reply', 'me', '第一段回复。', 'original'],
  ['snapshot-reply', 'agent', '历史回复。', 'unloaded-source'],
  ['incoming-reply', 'colleague', '收到你的回复。', 'mine'],
  ['citation-source', 'agent', '[已净化引用](#cite-source)'],
  ['empty-source', 'agent', ''],
  ['tool-source', 'agent', ''],
  ['empty-reply', 'me', '等待原文。', 'empty-source'],
  ['tool-reply', 'me', '等待工具后的正文。', 'tool-source'],
] as const
const envelopes: ImEnvelope[] = rows.map(([id, fromUid, text, reply, file], index) => ({
  channelId: 'quote-preview', channelType: 2, fromUid, clientMsgNo: id, messageId: id, messageSeq: index + 1, timestamp: 1790899200 + index * 120,
  payload: createNativeMessage({ id, role: fromUid === 'agent' ? 'assistant' : 'user',
    content: id === 'empty-source' ? [] : id === 'tool-source' ? [{type:'tool-call',toolCallId:'fixture-call',toolName:'fixture.lookup',args:{},argsText:'{}',result:{ok:true}}] : id === 'multi-reply' ? [{type:'text',text}, {type:'text',text:'第二段正文保留。'}] : file ? [{type:'file', filename:'缓存设计.pdf', mimeType:'application/pdf', data:'https://example.com/design.pdf', sourceType:'url'}] : [{type:'text',text}],
    custom: reply ? {replyToClientMsgNo:reply, ...(id === 'snapshot-reply' ? {quoted:{id:reply,authorId:'history-author',authorName:'历史作者',body:'保留的历史引用摘要。'}} : {})} : {} }),
}))
const seed = () => useChatThreadStore.setState({ conversations: {
  'quote-preview': { ...EMPTY_CONVERSATION_CHAT_STATE, loaded: true, hasMoreOlder: false, messages: convertEnvelopeBatch(envelopes, { participants, meId:'me' }) },
  'other-conversation': { ...EMPTY_CONVERSATION_CHAT_STATE, loaded: true, hasMoreOlder: false, messages: convertEnvelopeBatch([{
    ...envelopes[0], channelId: 'other-conversation', clientMsgNo: 'foreign-source', messageId: 'foreign-source',
    payload: createNativeMessage({ id:'foreign-source',role:'user',content:[{type:'text',text:'OTHER_CONVERSATION_FIXTURE_ONLY'}] }),
  }], {participants,meId:'me'}) },
} })
seed()
harnessApi.list = async () => []
messagesApi.markRead = async () => ({ ok:true, latestSeq:envelopes.length })
// Local transport boundary: exercise real sendAppend/quote serialization without IM or production.
chatTransport.send = async (_conversationId, _text, _attachments, reply, id, payload) => {
  document.documentElement.dataset.sentReply = reply ?? ''
  document.documentElement.dataset.sentPayloadReply = String(payload?.metadata.custom.replyToClientMsgNo ?? '')
  envelopes.push({ channelId:'quote-preview',channelType:2,fromUid:'me',clientMsgNo:id!,messageId:id!,messageSeq:envelopes.length+1,timestamp:1790899999,payload:payload! })
  seed()
  return true
}
function Controls() {
  const aui = useAui()
  return <nav aria-label="测试控制" style={{display:'flex',flexWrap:'wrap',gap:12,padding:8}}>
    <button onClick={() => aui.thread.composer().setQuote({messageId:'original',text:'使用可视化为我讲解 KV 缓存。'})}>准备回复</button>
    <button onClick={() => aui.thread.composer().setQuote({messageId:'file-source',text:''})}>回复附件</button>
    <button onClick={() => aui.thread.composer().setQuote({messageId:'citation-source',text:'已净化引用'})}>回复净化文本</button>
    <button onClick={() => aui.thread.composer().setQuote({messageId:'citation-source',text:''})}>回复隐藏文本</button>
    <button onClick={() => aui.thread.composer().setQuote({messageId:'foreign-source',text:''})}>回复不可用原文</button>
    <button onClick={() => {
      const state = useChatThreadStore.getState().conversations['quote-preview']!
      const messages = projectMessageGroups(state.messages.map(message => ['empty-source','tool-source'].includes(message.id) ? {...message,content:[{type:'text' as const,text:'后续正文已到达'}]} : message))
      useChatThreadStore.setState({conversations:{'quote-preview':{...state,messages}}})
    }}>补全原文</button>
    <button onClick={() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.classList.toggle('dark') }}>切换主题</button>
  </nav>
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><main className="flex h-dvh flex-col bg-background text-foreground"><ConversationRuntimeProvider conversationId="quote-preview"><Controls/><div className="min-h-0 flex-1"><ConversationThread conversationId="quote-preview" /></div></ConversationRuntimeProvider></main></TooltipProvider>)
