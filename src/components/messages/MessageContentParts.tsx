import { useState, type ReactNode } from 'react'
import { useAuiState, type ReasoningMessagePartProps } from '@assistant-ui/react'
import { ReasoningPanel } from '@/components/assistant-ui/elements/reasoning-panel'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import type { LingxiImMessageCustom } from '@/im/assistantMessage'
import { ImBubble } from './ImBubble'

export function NativeTextPart({ reactions }: { reactions?: ReactNode }) {
  const custom = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  const message = custom.message
  return <ImBubble reactions={reactions} isMine={custom.isMine}>
    {message.streaming === 'placeholder' ? <span className="thinking-card py-0.5" aria-label={`${custom.senderName} 正在思考`} role="status"><span className="thinking-card-dots" aria-hidden><i /><i /><i /></span><span>思考中</span></span> : <div data-find-content className={message.streaming === 'markdown' ? 'streaming-markdown' : undefined}><MarkdownText /></div>}
  </ImBubble>
}

export function NativeReasoningPart({ part }: { part: ReasoningMessagePartProps }) {
  const custom = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  const streaming = custom.message.streaming === 'markdown'
  const [open, setOpen] = useState(streaming)
  return <ReasoningPanel steps={[{ title: 'Reasoning', body: part.text }]} visibleSteps={1} streaming={streaming} open={streaming || open} onOpenChange={setOpen} restingLabel="Reasoned" className="mt-1 max-w-[620px]" />
}
