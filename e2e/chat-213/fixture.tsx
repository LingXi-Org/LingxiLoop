import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { ConversationRuntimeProvider } from '@/features/chat/runtime/runtime'
import { convertEnvelopeBatch } from '@/features/chat/runtime/converter'
import { EMPTY_CONVERSATION_CHAT_STATE, useChatThreadStore } from '@/features/chat/runtime/store'
import { harnessApi } from '@/features/chat/runtime/harness-api'
import { messagesApi } from '@/features/chat/api'
import { useAuth } from '@/stores/auth'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import { createNativeMessage } from '@/lib/nativeMessage'
import type { Participant } from '@/types'
import '@/styles/globals.css'

// Historical NativeMessages and roster fixture; no model response is simulated.
const currentNames: Record<string, string> = { nova: '司南', sage: '明理', milo: '砺思', trace: '溯源', scout: '寻知', forge: '成器' }
const canonicalRoster = new URLSearchParams(location.search).has('currentNames')
const participants: Record<string, Participant> = {
  me: { id: 'me', kind: 'human', name: '测试用户', initial: '测', avatarBg: '#7257d9', status: 'avail' },
  ...Object.fromEntries(['nova', 'sage', 'milo', 'trace', 'scout', 'forge'].map(key => [`preset-${key}`, {
    id: `preset-${key}`, kind: 'agent', presetKey: key, name: canonicalRoster ? currentNames[key] : key[0].toUpperCase() + key.slice(1), initial: key[0], avatarBg: 'transparent', status: 'avail',
  }])),
  custom: { id: 'custom', kind: 'agent', name: 'Nova Labs', initial: 'N', avatarBg: 'transparent', status: 'avail' },
  renamed: { id: 'renamed', kind: 'agent', presetKey: 'scout', name: '我的研究搭档', initial: '研', avatarBg: 'transparent', status: 'avail' },
}
useAuth.setState({ user: { id: 'me', name: '测试用户', email: 'fixture@example.com', emailVerified: true, providers: [] }, activeCompanyId: 'fixture' })
useParticipants.setState({ byId: participants, loaded: true })
useConversations.setState({ list: [{ id: 'chat-213', title: '提及与滚动', kind: 'group', members: Object.keys(participants) }] as never })
const texts = ['@preset-nova 中文行首。', '中文行中 @preset-sage 继续说明。', '中文行尾 @preset-milo', '换行处的中文文字'.repeat(8) + ' @preset-trace 下一行。', '@preset-scout @preset-forge @all', '@custom @renamed', '历史英文提及 @Nova @Sage @Milo @Trace @Forge', '`@Nova` mail@nova.cn [@Nova](https://example.com)']
const messages = convertEnvelopeBatch(Array.from({ length: 14 }, (_, index) => {
  const id = `mention-${index}`
  return { channelId: 'chat-213', channelType: 2, fromUid: 'me', clientMsgNo: id, messageId: id, messageSeq: index + 1, timestamp: 1790899200 + index,
    payload: createNativeMessage({ id, role: 'user', content: [{ type: 'text', text: index < 6 ? `第${index}条历史提问。\n\n${'保留正文滚动与渐进模糊。'.repeat(12)}` : texts[index - 6] }] }) }
}), { participants, meId: 'me' })
useChatThreadStore.setState({ conversations: { 'chat-213': { ...EMPTY_CONVERSATION_CHAT_STATE, loaded: true, hasMoreOlder: false, messages } } })
harnessApi.list = async () => []
messagesApi.markRead = async () => ({ ok: true, latestSeq: 14 })
createRoot(document.getElementById('root')!).render(<TooltipProvider><main className="h-dvh bg-background text-foreground"><ConversationRuntimeProvider conversationId="chat-213"><ConversationThread conversationId="chat-213" /></ConversationRuntimeProvider></main></TooltipProvider>)
