// Real message rendering and native conversion, with synthetic public media only.
import { AssistantRuntimeProvider, type ThreadMessage, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useParticipants } from '@/features/agents/state'
import { ConversationMessage } from '@/features/chat/components/ConversationMessage'
import { convertEnvelopeBatch } from '@/features/chat/runtime/converter'
import type { LingxiMessageMetadata } from '@/features/chat/runtime/model'
import { useConversations } from '@/features/conversations/store'
import type { ImEnvelope } from '@/lib/im/wukong'
import { createNativeMessage, type NativeAttachment } from '@/lib/nativeMessage'
import { useAuth } from '@/stores/auth'
import type { Participant } from '@/types'
import '@/styles/globals.css'
import './fixture.css'

const svg = (label: string, color: string, width: number, height: number) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${color}"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="#e7eedc"/><text x="50%" y="52%" font-size="${Math.min(width, height) / 12}" text-anchor="middle" fill="#243b35">${label}</text></svg>`)
const images = {
  single: svg('PUBLIC A', '#7d9f92', 1200, 800),
  landscape: svg('PUBLIC B', '#b3a087', 1400, 600),
  portrait: svg('PUBLIC C', '#7e93ad', 600, 1200),
  square: svg('PUBLIC D', '#ab91a6', 900, 900),
  pure: svg('PUBLIC E', '#96a474', 400, 5000),
  assistant: svg('ASSISTANT', '#a7a7a7', 1100, 700),
  broken: 'data:image/png;base64,bm90LWFuLWltYWdl',
}
const longName = '公开练习图片与非常长的文件名'.repeat(14) + '.png'
const participants: Record<string, Participant> = {
  self: { id: 'self', kind: 'human', name: '本地学生', initial: '学', avatarBg: '#52796f', status: 'avail' },
  other: { id: 'other', kind: 'human', name: '公开同学', initial: '同', avatarBg: '#707f9b', status: 'avail' },
  agent: { id: 'agent', kind: 'agent', name: '公开助教', initial: '助', avatarBg: '', status: 'avail' },
}
useAuth.setState({ user: { id: 'self', name: '本地学生', email: 'fixture@example.invalid', emailVerified: true, providers: [] } })
useParticipants.setState({ byId: participants, loaded: true, refresh: async () => {} })
useConversations.setState({ list: [{ id: 'user-images', title: '公开图片布局示例', kind: 'group', members: Object.keys(participants), leaderId: null, lastAt: '', lastAtIso: '', preview: '' }], loaded: true,
  load: async () => {}, reload: async () => {} })
const attachment = (id: string, name: string, src: string, asFile = false): NativeAttachment => ({
  id, name, type: asFile ? 'document' : 'image', contentType: 'image/svg+xml', status: { type: 'complete' },
  content: asFile ? [{ type: 'file', filename: name, data: src, mimeType: 'image/svg+xml', sourceType: 'url' }] : [{ type: 'image', filename: name, image: src }],
})
const payloads = [
  ['mine-single', 'self', createNativeMessage({ id: 'mine-single', role: 'user', content: [{ type: 'text', text: '本人单图：这是我画出的公开示意图。' }], attachments: [attachment('image-single', '公开示意图.svg', images.single)] })],
  ['other-many', 'other', createNativeMessage({ id: 'other-many', role: 'user', content: [{ type: 'text', text: '别人多图：横图、竖图和方图保留原来的顺序。' }],
    attachments: [attachment('image-landscape', '公开横图.svg', images.landscape), attachment('image-file-portrait', '以文件形式上传的公开竖图.svg', images.portrait, true), attachment('image-square', '公开方图.svg', images.square)] })],
  ['mine-pure', 'self', createNativeMessage({ id: 'mine-pure', role: 'user', content: [{ type: 'image', filename: '只有图片.svg', image: images.pure }] })],
  ['mine-failed', 'self', createNativeMessage({ id: 'mine-failed', role: 'user', content: [{ type: 'text', text: '坏图片的文字、引用和失败状态仍可见。' }], attachments: [attachment('image-broken', longName, images.broken)],
    custom: { replyToClientMsgNo: 'other-many' } })],
  ['mine-pdf', 'self', createNativeMessage({ id: 'mine-pdf', role: 'user', content: [{ type: 'text', text: '非图片 PDF 保留文件卡片。' }], attachments: [{ id: 'document-pdf', type: 'document', name: '公开练习.pdf', contentType: 'application/pdf', status: { type: 'complete' },
    content: [{ type: 'file', filename: '公开练习.pdf', mimeType: 'application/pdf', sourceType: 'url', data: 'data:application/pdf;base64,JVBERi0xLjQKJSBTeW50aGV0aWMgcHVibGljIGZpeHR1cmUK' }] }] })],
  ['assistant-media', 'agent', createNativeMessage({ id: 'assistant-media', role: 'assistant', content: [{ type: 'text', text: '助手图片保留现有卡片展示。' }, { type: 'image', filename: '助手公开图片.svg', image: images.assistant }] })],
] as const
const envelopes: ImEnvelope[] = payloads.map(([id, sender, payload], index) => ({ channelId: 'user-images', channelType: 2, fromUid: sender, clientMsgNo: id, messageId: id,
  messageSeq: index + 1, timestamp: 1792915200 + index * 600, payload }))
function loadMessages(): ThreadMessage[] {
  return convertEnvelopeBatch(envelopes, { participants, meId: 'self' }).map(message => {
    const metadata = message.metadata.custom as LingxiMessageMetadata
    return { ...message, metadata: { ...message.metadata, custom: { ...metadata,
      ...(message.id === 'mine-pure' ? { delivery: 'sending' } : {}),
      ...(message.id === 'mine-failed' ? { delivery: 'failed', sendError: '公开示例：发送状态待确认，附件已保留。' } : {}),
    } } } as ThreadMessage
  })
}
const manifest = loadMessages().map(message => ({ messageId: message.id, role: message.role,
  attachmentIds: message.role === 'user' ? message.attachments.map(item => item.id) : [],
  images: [...message.content, ...message.role === 'user' ? message.attachments.flatMap(item => item.content) : []].flatMap(part => part.type === 'image'
    ? [{ src: part.image, name: part.filename ?? '图片' }]
    : part.type === 'file' && part.mimeType.startsWith('image/') ? [{ src: part.data, name: part.filename ?? '附件' }] : []),
}))
function Messages() {
  const runtime = useExternalStoreRuntime<ThreadMessage>({ messages: loadMessages(), onNew: async () => { throw new Error('Read-only fixture cannot send') } })
  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ Message: ConversationMessage }} /></AssistantRuntimeProvider>
}
function App() {
  const [mount, setMount] = useState(0)
  return <TooltipProvider><main className="fixture-page bg-background text-foreground">
    <nav className="fixture-controls" aria-label="本地测试控制"><span>公开合成图片消息</span><button onClick={() => setMount(value => value + 1)}>重新挂载消息</button></nav>
    <output data-fixture-manifest hidden>{JSON.stringify(manifest)}</output>
    <section className="fixture-thread" aria-label="真实图片消息"><Messages key={mount} /></section>
  </main></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
