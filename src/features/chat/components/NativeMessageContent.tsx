import { MessagePrimitive, MessagePartPrimitive, useAuiState, type PartState, type SourceMessagePartProps, type TextMessagePartComponent } from '@assistant-ui/react'
import { createContext, type ReactNode, useContext } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { z } from 'zod'
import { AttachmentCard } from '@/components/assistant-ui/elements/attachment-card'
import { DocumentReference } from '@/components/assistant-ui/elements/document-reference'
import { Reasoning } from '@/components/assistant-ui/elements/reasoning'
import { ToolGroup } from '@/components/assistant-ui/elements/tool-group'
import { MarkdownText, type MarkdownConfidenceClaim } from '@/components/assistant-ui/markdown-text'
import { MessageFooterContext, MessageFooterContents } from '@/components/assistant-ui/message-footer'
import { styledGenerativeUILibrary } from '@/components/assistant-ui/elements/generative-ui'
import { Citation } from '@/components/tool-ui/citation'
import { generativeComponentSchemas } from '@/lib/nativeMessage'
import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import { BusinessMessagePart } from './BusinessMessagePart'
import { MessagePartBoundary } from './MessagePartBoundary'
import { NativeTool, hasRichTool } from './NativeTool'
import { CalendarEventCard, TeacherBriefingStatsTool } from './ToolRenderers'

const ReadOnlyMessage = createContext(false)
const GroupOwnsFooter = createContext(false)

function SourcePart(part: SourceMessagePartProps) {
  return <MessageFooterContents inset={false}>
    {part.sourceType === 'url'
      ? <Citation id={part.id} href={part.url} title={part.title ?? new URL(part.url).hostname} type="webpage" locale="zh-CN" className="w-full max-w-96" />
      : <DocumentReference title={part.title} anchors={[]} activePage={-1} />}
  </MessageFooterContents>
}

const generativeComponents = Object.fromEntries(Object.entries(generativeComponentSchemas).map(([name, schema]) => [name,
  function NativeComponent({ children, ...props }: { children?: ReactNode }) {
    const parsed = z.record(z.string(), z.unknown()).parse(schema.parse(props))
    if (name === 'calendar-event') return <CalendarEventCard args={parsed} />
    if (name === 'learning-stats') return <TeacherBriefingStatsTool args={parsed} />
    const Component = styledGenerativeUILibrary[name]!.render
    return <Component {...parsed} $status="done">{children}</Component>
  },
]))

const DefaultText = () => {
  const claims = useAuiState(state => {
    const part = state.message.content.find(part => part.type === 'data' && part.name === 'citation-claims')
    return part?.type === 'data' ? (part.data as { claims: MarkdownConfidenceClaim[] }).claims : undefined
  })
  return <MessageFooterContents inset={false}><MarkdownText agent confidenceClaims={claims} inlineCitations /></MessageFooterContents>
}

function groupParts(part: PartState): readonly ('group-reasoning' | 'group-tools')[] {
  if (part.type === 'reasoning') return ['group-reasoning']
  if (part.type !== 'tool-call' || hasRichTool(part.toolName) || part.approval || part.interrupt || part.messages?.length || part.isError
    || part.status.type === 'incomplete' || part.status.type === 'requires-action') return []
  const resultStatus = part.result && typeof part.result === 'object' && 'status' in part.result ? part.result.status : undefined
  return resultStatus === 'failed' || resultStatus === 'cancelled' ? [] : ['group-tools']
}

function PartFrame({ children, footer, mediaFooter }: { children: ReactNode; footer: ReactNode; mediaFooter: ReactNode }) {
  const groupOwnsFooter = useContext(GroupOwnsFooter)
  const part = useAuiState(state => state.part)
  const isLast = useAuiState(state => {
    const last = state.message.parts.filter(part => part.type !== 'data' || part.name !== 'citation-claims').at(-1)
    return last === state.part
  })
  const value = !groupOwnsFooter && isLast ? part.type === 'image' || part.type === 'file' ? mediaFooter : footer : null
  return <MessageFooterContext.Provider value={value}>
    <div className="min-w-0" data-native-part={part.type}>
      <MessagePartBoundary resetKey={part} running={part.status.type === 'running'}>{children}</MessagePartBoundary>
    </div>
  </MessageFooterContext.Provider>
}

export function NativeMessageContent({ Text = DefaultText, footer = null, mediaFooter = null }: {
  Text?: TextMessagePartComponent; footer?: ReactNode; mediaFooter?: ReactNode
}) {
  const readOnly = useContext(ReadOnlyMessage)
  const message = useAuiState(state => state.message)
  const requestVersion = (message.metadata.custom.harness as RunDisplayState | undefined)?.requestVersion
  const attachments = message.role === 'user' ? message.attachments : []
  const last = message.content.reduce((last, part, index) => part.type !== 'data' || part.name !== 'citation-claims' ? index : last, -1)
  return <GroupOwnsFooter.Provider value={false}><div className="native-message-content grid min-w-0 gap-2" data-aui-theme="elements">
    <MessagePrimitive.GroupedParts groupBy={groupParts} indicator="never">
      {({ part, children }) => {
        if (part.type === 'indicator') return null
        if (part.type === 'group-reasoning' || part.type === 'group-tools') {
          if (part.type === 'group-tools' && part.indices.length === 1) return children
          const ownsFooter = part.indices.includes(last)
          const summary = part.type === 'group-reasoning' ? part.indices.flatMap(index => {
            const item = message.content[index]
            return item?.type === 'reasoning' && item.unstable_summary ? [item.unstable_summary] : []
          }).join(' · ') : undefined
          return <MessageFooterContext.Provider value={ownsFooter ? footer : null}>
            <MessageFooterContents inset={false}><GroupOwnsFooter.Provider value={ownsFooter}>
              {part.type === 'group-reasoning'
                ? <Reasoning streaming={part.status.type === 'running'} summary={summary}>{children}</Reasoning>
                : <ToolGroup count={part.indices.length} active={part.status.type === 'running'}>{children}</ToolGroup>}
            </GroupOwnsFooter.Provider></MessageFooterContents>
          </MessageFooterContext.Provider>
        }
        let content: ReactNode
        switch (part.type) {
          case 'text': content = <Text {...part} />; break
          case 'reasoning': content = <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>; break
          case 'source': content = <SourcePart {...part} />; break
          case 'image': content = <AttachmentCard filename={part.filename ?? '图片'} data={part.image} mimeType="image/*" sourceType="url" />; break
          case 'file': content = <AttachmentCard filename={part.filename ?? '附件'} data={part.data} mimeType={part.mimeType} sourceType={part.sourceType} />; break
          case 'data': content = <BusinessMessagePart {...part} readOnly={readOnly} />; break
          case 'generative-ui': content = <MessageFooterContents inset={false}><MessagePrimitive.GenerativeUI components={generativeComponents} /></MessageFooterContents>; break
          case 'tool-call': content = <NativeTool key={`${part.approval?.id ?? part.toolCallId}:${requestVersion ?? ''}`} {...part} readOnly={readOnly}>
            {part.messages?.length ? <details className="rounded-xl border border-border/60 p-3">
              <summary className="cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-ring">子任务消息 · {part.messages.length}</summary>
              <div className="mt-3 border-s-2 border-border/60 ps-3"><ReadOnlyMessage.Provider value={true}>
                <MessagePartPrimitive.Messages components={{ Message: NativeMessageContent }} />
              </ReadOnlyMessage.Provider></div>
            </details> : null}
          </NativeTool>; break
          // Deprecated audio is rejected by the wire schema; never silently hide a new part.
          default: content = <p role="alert" className="text-sm text-destructive">这类消息暂时无法显示。</p>
        }
        return <PartFrame footer={footer} mediaFooter={mediaFooter}>{content}</PartFrame>
      }}
    </MessagePrimitive.GroupedParts>
    {attachments.map(attachment => <div key={attachment.id} data-native-attachment={attachment.id} className="grid min-w-0 gap-1">
      {attachment.content.map((part, index) => <MessageFooterContext.Provider key={index} value={!message.content.length && attachment === attachments.at(-1) && index === attachment.content.length - 1 ? mediaFooter : null}>
        <MessagePartBoundary resetKey={part}>
          {part.type === 'image' ? <AttachmentCard filename={part.filename ?? attachment.name} data={part.image} mimeType={attachment.contentType ?? 'image/*'} sourceType="url" />
            : part.type === 'file' ? <AttachmentCard filename={part.filename ?? attachment.name} data={part.data} mimeType={part.mimeType} sourceType={part.sourceType} />
            : part.type === 'text' ? <p className="whitespace-pre-wrap break-words">{part.text}</p>
            : part.type === 'data' ? <BusinessMessagePart {...part} status={{ type: 'complete' }} readOnly={readOnly} />
            : <p role="alert">不支持的附件内容</p>}
        </MessagePartBoundary>
      </MessageFooterContext.Provider>)}
    </div>)}
  </div></GroupOwnsFooter.Provider>
}
