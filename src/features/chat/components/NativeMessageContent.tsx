import { MessagePrimitive, MessagePartPrimitive, PartByIndexProvider, useScrollLock, useAui, useAuiState, type PartState, type SourceMessagePartProps, type TextMessagePartComponent } from '@assistant-ui/react'
import { createContext, type ReactNode, useContext, useRef, useState } from 'react'
import { z } from 'zod'
import { AttachmentCard } from '@/components/assistant-ui/elements/attachment-card'
import { DocumentReference } from '@/components/assistant-ui/elements/document-reference'
import { Reasoning } from '@/components/assistant-ui/elements/reasoning'
import { AgentPlan, type AgentPlanStep } from '@/components/assistant-ui/elements/agent-plan'
import { RunActivity, type RunActivityStatus } from '@/components/assistant-ui/elements/run-activity'
import { activityAnnotation } from '@/lib/runActivity'
import { ToolGroup } from '@/components/assistant-ui/elements/tool-group'
import { ToolTimeline } from '@/components/assistant-ui/elements/tool-timeline'
import { WrenchIcon } from 'lucide-react'
import { MarkdownText, type MarkdownConfidenceClaim } from '@/components/assistant-ui/markdown-text'
import { MessageFooterContext, MessageFooterContents } from '@/components/assistant-ui/message-footer'
import { styledGenerativeUILibrary } from '@/components/assistant-ui/elements/generative-ui'
import { Citation } from '@/components/tool-ui/citation'
import { generativeComponentSchemas } from '@/lib/nativeMessage'
import { OPENUI_COMPONENT } from '@/lib/interactive-ui/catalog'
import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import { BusinessMessagePart } from './BusinessMessagePart'
import { MessagePartBoundary } from './MessagePartBoundary'
import { RunActivityHistory } from './RunActivityHistory'
import { NativeTool, hasRichTool } from './NativeTool'
import { TeacherBriefingStatsTool } from './ToolRenderers'

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
    const running = useAuiState(state => state.message.status?.type === 'running')
    const parsed = z.record(z.string(), z.unknown()).parse(schema.parse(props))
    if (name === 'agent-plan') return <AgentPlan title={String(parsed.title)} steps={parsed.steps as AgentPlanStep[]} activeIndex={Number(parsed.activeIndex)} paused={!running} />
    if (name === OPENUI_COMPONENT) return <p className="whitespace-pre-wrap break-words text-sm">{String(parsed.fallback)}</p>
    if (name === 'calendar-event') {
      const event = parsed.event as { title: string; startAt: string }
      return <p className="whitespace-pre-wrap text-sm">{event.title} · {event.startAt}（日历功能已停止支持）</p>
    }
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
  if (part.type === 'reasoning') return []
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

function NativePart({ Text = DefaultText, footer = null, mediaFooter = null }: { Text?: TextMessagePartComponent; footer?: ReactNode; mediaFooter?: ReactNode }) {
  const aui = useAui()
  const readOnly = useContext(ReadOnlyMessage)
  const part = useAuiState(state => state.part)
  const requestVersion = useAuiState(state => (state.message.metadata.custom.harness as RunDisplayState | undefined)?.requestVersion)
  let content: ReactNode
  switch (part.type) {
    case 'text': content = <Text {...part} />; break
    case 'reasoning': content = <Reasoning streaming={part.status.type === 'running'}><MarkdownText agent /></Reasoning>; break
    case 'source': content = <SourcePart {...part} />; break
    case 'image': content = <AttachmentCard filename={part.filename ?? '图片'} data={part.image} mimeType="image/*" sourceType="url" />; break
    case 'file': content = <AttachmentCard filename={part.filename ?? '附件'} data={part.data} mimeType={part.mimeType} sourceType={part.sourceType} />; break
    case 'data': content = <BusinessMessagePart {...part} readOnly={readOnly} />; break
    case 'generative-ui': content = <MessageFooterContents inset={false}><MessagePrimitive.GenerativeUI components={generativeComponents} /></MessageFooterContents>; break
    case 'tool-call': content = <NativeTool key={`${part.approval?.id ?? part.toolCallId}:${requestVersion ?? ''}`} {...part} addResult={aui.part.addToolResult} resume={aui.part.resumeToolCall} respondToApproval={aui.part.respondToToolApproval} readOnly={readOnly}>
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
}

function ActivityParts({ Text, footer, mediaFooter, attention }: { Text: TextMessagePartComponent; footer: ReactNode; mediaFooter: ReactNode; attention: ReactNode }) {
  const message = useAuiState(state => state.message)
  const [open, setOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [visible, setVisible] = useState(40)
  const root = useRef<HTMLDivElement>(null)
  const lockScroll = useScrollLock(root, 200)
  const nativeStatus = message.status!
  const status: RunActivityStatus = nativeStatus.type === 'incomplete'
    ? nativeStatus.reason === 'cancelled' || nativeStatus.reason === 'error' ? nativeStatus.reason : 'incomplete' : nativeStatus.type
  const labels = { running: '正在处理', 'requires-action': '需要你确认', complete: '已完成', cancelled: '已停止', incomplete: '尚未完成', error: '任务未完成' }
  const parts = message.parts.map((part, index) => {
    const entry = activityAnnotation(part)
    const attention = entry?.kind === 'attention' || part.type === 'tool-call' && (part.toolName === 'teacher.draft_homework' || Boolean(part.approval || part.interrupt || part.isError || part.status.type === 'requires-action' || part.status.type === 'incomplete'))
    return { id: entry?.id ?? `part:${index}`, kind: entry?.kind, label: entry?.label ?? '其他内容', attention, running: part.status.type === 'running',
      content: <PartByIndexProvider key={entry?.id ?? index} index={index}><NativePart Text={Text} footer={footer} mediaFooter={mediaFooter} /></PartByIndexProvider> }
  })
  const activities = parts.filter(part => !part.attention && (part.kind === 'tool' || part.kind === 'commentary'))
  const entries: { id: string; kind: 'tool' | 'commentary'; label: string; content: ReactNode }[] = []
  for (let index = 0; index < Math.min(visible, activities.length); index++) {
    const part = activities[index]
    if (part.kind !== 'tool') { entries.push({ ...part, kind: 'commentary' }); continue }
    const tools = [part]
    while (index + 1 < Math.min(visible, activities.length) && activities[index + 1].kind === 'tool') tools.push(activities[++index])
    entries.push({ ...part, kind: 'tool', content: tools.length === 1 ? part.content
      : <ToolGroup count={tools.length} active={tools.some(tool => tool.running)}>{tools.map(tool => tool.content)}</ToolGroup> })
  }
  if (visible < activities.length) entries.push({ id: 'more-activity', kind: 'commentary', label: '显示更多活动', content:
    <button type="button" className="rounded text-sm underline outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setVisible(value => value + 40)}>显示更多活动（还有 {activities.length - visible} 条）</button> })
  const tools = parts.filter(part => part.kind === 'tool')
  if (tools.length > 1) entries.unshift({ id: 'tool-timeline', kind: 'tool', label: '工具执行记录', content: <ToolTimeline
    steps={tools.map(tool => ({ id: tool.id, verb: tool.label, chip: tool.running ? '处理中' : '查看记录', icon: WrenchIcon }))}
    visibleSteps={Math.min(visible, tools.length)} streaming={tools.some(tool => tool.running)} open={timelineOpen} onOpenChange={setTimelineOpen}
    restingLabel={`工具执行记录 · ${tools.length} 项`} activeLabel="工具正在处理" stats={[]} /> })
  return <div ref={root}><RunActivity status={status} statusLabel={labels[status]} open={open} onOpenChange={next => { lockScroll(); setOpen(next) }}
    entries={entries}
    attention={<>{parts.filter(part => part.attention).map(part => <div key={part.id} role="group" aria-label={part.label}>{part.content}</div>)}<RunActivityHistory message={message} />{attention}</>}>
    {parts.filter(part => !part.attention && part.kind !== 'tool' && part.kind !== 'commentary').map(part => part.content)}
  </RunActivity></div>
}

export function NativeMessageContent({ Text = DefaultText, footer = null, mediaFooter = null, attention = null }: {
  Text?: TextMessagePartComponent; footer?: ReactNode; mediaFooter?: ReactNode; attention?: ReactNode
}) {
  const readOnly = useContext(ReadOnlyMessage)
  const message = useAuiState(state => state.message)
  const attachments = message.role === 'user' ? message.attachments : []
  const last = message.content.reduce((last, part, index) => part.type !== 'data' || part.name !== 'citation-claims' ? index : last, -1)
  const hasActivity = Boolean(message.metadata.custom.activityHistory) || message.parts.some(part =>
    part.type === 'tool-call' || ['commentary', 'attention'].includes(activityAnnotation(part)?.kind ?? ''))
  return <GroupOwnsFooter.Provider value={false}><div className="native-message-content grid min-w-0 gap-2" data-aui-theme="elements">
    {message.role === 'assistant' && message.metadata.custom.activityPresentation && hasActivity ? <ActivityParts Text={Text} footer={footer} mediaFooter={mediaFooter} attention={attention} /> : <MessagePrimitive.GroupedParts groupBy={groupParts} indicator="never">
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
        return <NativePart Text={Text} footer={footer} mediaFooter={mediaFooter} />
      }}
    </MessagePrimitive.GroupedParts>}
    {!message.metadata.custom.activityPresentation && attention}
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
