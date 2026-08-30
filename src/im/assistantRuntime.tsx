import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type AttachmentAdapter,
  type CompleteAttachment,
  type PendingAttachment,
} from '@assistant-ui/react'
import { useCallback, useMemo, type ReactNode } from 'react'
import { agentsApi } from '@/features/agents/api'
import { uploadsApi } from '@/features/platform/api'
import { sendComposerMessage } from '@/features/chat/sendComposerMessage'
import { useConversationUi } from '@/stores/conversationUi'
import { useMe } from '@/stores/auth'
import { useParticipants } from '@/features/agents/state'
import type { Message } from '@/types'
import { createLingxiAssistantMessage } from './assistantMessage'

type UploadedAttachment = PendingAttachment & {
  apiAttachment: Awaited<ReturnType<typeof uploadsApi.uploadFile>>
}

const attachmentAdapter: AttachmentAdapter = {
  accept: '*/*',
  async add({ file }) {
    const apiAttachment = await uploadsApi.uploadFile(file)
    return {
      id: apiAttachment.key ?? crypto.randomUUID(),
      type: apiAttachment.kind === 'img' ? 'image' : 'document',
      name: apiAttachment.name,
      contentType: apiAttachment.mime ?? file.type,
      file,
      apiAttachment,
      status: { type: 'requires-action', reason: 'composer-send' },
    } as UploadedAttachment
  },
  async send(attachment): Promise<CompleteAttachment> {
    const uploaded = attachment as unknown as UploadedAttachment
    return {
      ...uploaded,
      status: { type: 'complete' },
      content: uploaded.apiAttachment.kind === 'img'
        ? [{ type: 'image', image: uploaded.apiAttachment.url }]
        : [{
            type: 'file',
            filename: uploaded.apiAttachment.name,
            mimeType: uploaded.apiAttachment.mime ?? 'application/octet-stream',
            data: uploaded.apiAttachment.url,
          }],
    }
  },
  async remove() {},
}

function parseAppendMessage(message: AppendMessage) {
  if (message.role !== 'user') throw new Error('Composer protocol requires a user message')
  const textParts = message.content.filter((part) => part.type === 'text')
  if (textParts.length !== 1) throw new Error('Composer protocol requires exactly one text part')
  const attachments = message.attachments ?? []
  if (attachments.length > 1) throw new Error('Composer protocol accepts at most one attachment')
  const attachment = attachments[0]
    ? (attachments[0] as unknown as UploadedAttachment).apiAttachment
    : null
  if (attachments[0] && !attachment) throw new Error('Composer attachment was not uploaded')
  return { text: textParts[0].text.trim(), attachment }
}

export function LingxiAssistantRuntimeProvider({
  messages,
  conversationId,
  replyingToId = null,
  children,
}: {
  messages: readonly Message[]
  conversationId: string
  replyingToId?: string | null
  children: ReactNode
}) {
  const participants = useParticipants((state) => state.byId)
  const meId = useMe()
  const convertMessage = useCallback(
    (message: Message, index: number) => createLingxiAssistantMessage(message, index, messages, participants, meId),
    [meId, messages, participants],
  )
  const onNew = useCallback(async (message: AppendMessage) => {
    const { text, attachment } = parseAppendMessage(message)
    await sendComposerMessage({ conversationId, text, attachment, replyingToId })
    if (!replyingToId) useConversationUi.getState().setReplyingTo(conversationId, null)
  }, [conversationId, replyingToId])
  const adapter = useMemo(() => ({
    messages,
    convertMessage,
    onNew,
    adapters: { attachments: attachmentAdapter },
    onAddToolResult: async ({ toolCallId, toolName, result }: {
      toolCallId: string
      toolName: string
      result: unknown
    }) => {
      if (toolName !== 'lingxi_approval' || !toolCallId.startsWith('approval:')) return
      const persisted = typeof result === 'object' && result !== null && (result as { persisted?: unknown }).persisted === true
      if (persisted) return
      const decision = typeof result === 'object' && result !== null ? (result as { decision?: unknown }).decision : undefined
      if (decision !== 'approved' && decision !== 'denied') return
      await agentsApi.resolveApproval(toolCallId.slice('approval:'.length), decision === 'approved' ? 'approved' : 'rejected')
    },
  }), [convertMessage, messages, onNew])
  const runtime = useExternalStoreRuntime<Message>(adapter)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="assistant-ui-scope aui-thread-root h-full min-h-0 bg-background text-foreground" data-lingxi-assistant-thread>
        {children}
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}
