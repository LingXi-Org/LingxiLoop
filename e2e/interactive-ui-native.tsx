import { useState } from 'react'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useAuiState, useExternalStoreRuntime } from '@assistant-ui/react'
import { createNativeMessage, deserializeMessage } from '@/lib/nativeMessage'
import { OPENUI_COMPONENT } from '@/lib/interactive-ui/catalog'
import type { OpenUiEnvelope } from '@/lib/interactive-ui/protocol'
import { NativeOpenUiLesson } from '@/features/chat/components/interactive-ui/OpenUiLesson'

function LessonMessage() {
  const part = useAuiState(state => state.message.content[0])
  if (part?.type !== 'generative-ui' || Array.isArray(part.spec.root) || typeof part.spec.root !== 'object') return null
  return <MessagePrimitive.Root><NativeOpenUiLesson value={(part.spec.root as { props?: Record<string, unknown> }).props} readOnly={false} /></MessagePrimitive.Root>
}

export default function NativeRevisionFixture({ envelope, onCommit }: { envelope: OpenUiEnvelope; onCommit: () => void }) {
  const [committed, setCommitted] = useState(false)
  const messages = [envelope, { ...envelope, messageId: 'fixture-next', revision: 2, baseRevision: 1 }].map((lesson, index) =>
    deserializeMessage(createNativeMessage({ id: lesson.messageId, role: 'assistant',
      content: [{ type: 'generative-ui', spec: { root: { component: OPENUI_COMPONENT, props: lesson } } }],
      // A next result can retain its prior IM sequence while the new result is still pending.
      custom: { conversationId: 'fixture-room', sequence: index && committed ? 2 : 1,
        harness: { delivery: index && !committed ? 'pending' : 'delivered' } },
    })))
  const runtime = useExternalStoreRuntime({ messages, isRunning: false, onNew: async () => {} })
  return <main className="mx-auto grid max-w-3xl gap-4 p-4">
    <button type="button" onClick={() => { onCommit(); setCommitted(true) }}>确认新版本送达</button>
    <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root><ThreadPrimitive.Messages components={{ Message: LessonMessage }} /></ThreadPrimitive.Root></AssistantRuntimeProvider>
  </main>
}
