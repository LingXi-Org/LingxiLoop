// Credential-free fixture: the production shell/components, with local-only transport.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '/src/components/ui/tooltip'
import { DesktopApp } from '/src/desktop/DesktopApp'
import { useAuth } from '/src/stores/auth'
import { useApp } from '/src/stores/app'
import { useSurface } from '/src/stores/surface'
import { useWorkspace } from '/src/features/knowledge/workspace'
import { useConversations } from '/src/features/conversations/store'
import { useParticipants } from '/src/features/agents/state'
import { useChatThreadStore, EMPTY_CONVERSATION_CHAT_STATE } from '/src/features/chat/runtime/store'
import { chatTransport } from '/src/features/chat/runtime/transport'
import { convertEnvelope } from '/src/features/chat/runtime/converter'
import { createNativeMessage } from '/src/lib/nativeMessage'
import { artifactsApi } from '/src/features/artifacts/api'
import { conversationsApi } from '/src/features/conversations/api'
import { PENDING_DESIGN_ID } from '/src/features/design/pending'
import '@fontsource-variable/inter'
import '/src/styles/app.css'
import '/src/styles/experience.css'

const params = new URLSearchParams(location.search)
const pinned = Number(params.get('pinned') ?? 2)
const participants = Object.fromEntries(['me', 'agent', 'peer', 'third', 'fourth'].map((id, i) => [id, {
  id, kind: id === 'agent' ? 'agent' : 'human', name: ['同学', '明理', '林同学', '陈同学', '王同学'][i],
  initial: ['同', '明', '林', '陈', '王'][i], avatarBg: '#668c80', status: 'avail',
  avatarUrl: id === 'peer' ? '/missing-fixture-avatar.png' : null,
}]))
const list = Array.from({ length: 12 }, (_, i) => ({
  id: `fixture-${i}`, kind: i % 3 === 0 ? 'group' : 'direct', title: ['明理', '课题组', 'Study Room', '这个会话名称非常长，用来核对截断效果'][i % 4],
  subtitle: i === 0 ? '讲题助手' : '学习讨论', members: i === 0 ? ['me', 'agent'] : ['me', ...['agent', 'peer', 'third', 'fourth'].slice(0, i % 4 + 1)],
  leaderId: 'agent', pinned: i < pinned, unread: i === 1 ? 120 : i === 2 ? 4 : 0, muted: i === 2,
  preview: '这次先把画板结构读清楚了，再继续推导。', lastAt: '10/31',
}))
useAuth.setState({ user: { id: 'me', name: '同学', email: 'fixture@example.invalid' }, authenticated: true, ready: true,
  activeCompanyId: 'fixture', companies: [{ id: 'fixture', name: '学习空间', slug: 'fixture', role: 'student', isAdmin: false, status: 'ACTIVE' }] })
useWorkspace.setState({ selectedId: 'fixture', loaded: true, companyId: 'fixture', list: [{ id: 'fixture', name: '人工智能基础', status: 'ACTIVE' }] })
useParticipants.setState({ byId: participants, loaded: true })
useConversations.setState({ list, loaded: true, projectId: 'fixture' })
useApp.setState({ selectedConversationId: list[0].id, mobileConversationOpen: true })
function message(id: string, sender: string, text: string) {
  return convertEnvelope({ channelId: list[0].id, channelType: 2, fromUid: sender, clientMsgNo: id, messageId: id, messageSeq: Number(id), timestamp: 1793779200,
    payload: createNativeMessage({ id, role: sender === 'agent' ? 'assistant' : 'user', createdAt: '2026-11-04T08:00:00Z', content: [{ type: 'text', text }] }),
  }, { participants, meId: 'me' })
}
useChatThreadStore.setState({ conversations: Object.fromEntries(list.map(c => [c.id, { ...EMPTY_CONVERSATION_CHAT_STATE, loaded: true, hasMoreOlder: false,
  messages: [message('1', 'me', '为我在画板中讲解 FlashAttention'), message('2', 'agent', '我先读了画板结构：`project/canvas.json` 目前为空，没有任何讲解页。下面按 Design 规范一次写出讲解板和索引。\n\n讲解板用一页把 **FlashAttention** 讲透：起因（n × n 分数矩阵反复进出 HBM）、分块与 m / ℓ / O 三个统计量、在线 softmax 的缩放更新式、一个 2×2 手算示例，以及「它省的是显存与带宽，不改变数值结果」这一边界。')],
}])) })
chatTransport.loadConversation = async () => {}
chatTransport.sendAppend = async (_id, append) => {
  const text = append.content.filter(part => part.type === 'text').map(part => part.text).join('')
  useChatThreadStore.setState(state => ({ conversations: { ...state.conversations, [_id]: { ...state.conversations[_id], messages: [...state.conversations[_id].messages, message(String(Date.now()), 'me', text)] } } }))
  return true
}
conversationsApi.search = async () => ({ rooms: [], groups: [], messages: [] })
conversationsApi.emitTyping = async () => ({ ok: true })
artifactsApi.getConversationDesign = async () => null
artifactsApi.ensureConversationDesign = async () => ({ id: PENDING_DESIGN_ID, title: 'FlashAttention 分步讲解' })
if (params.has('board')) useSurface.getState().openDesign(PENDING_DESIGN_ID, 'FlashAttention 分步讲解')
const spaces = { spaces: [], activeSpace: undefined, loading: false, error: null, pending: false, reload: async () => {}, select: async () => {} }
createRoot(document.getElementById('root')!).render(<ThemeProvider attribute={['class', 'data-theme']} forcedTheme={params.get('theme') || 'light'}><TooltipProvider><DesktopApp learningSpaces={spaces} /></TooltipProvider></ThemeProvider>)
