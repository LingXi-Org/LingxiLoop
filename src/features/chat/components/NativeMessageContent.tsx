import { VisualizeText } from '../visualize/VisualizeText'
import { MessagePrimitive, MessagePartPrimitive, useAui, useAuiState, type SourceMessagePartProps, type TextMessagePartComponent } from '@assistant-ui/react'
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'
import { z } from 'zod'
import { AttachmentCard } from '@/components/assistant-ui/elements/attachment-card'
import { DocumentReference } from '@/components/assistant-ui/elements/document-reference'
import { Reasoning } from '@/components/assistant-ui/elements/reasoning'
import { AgentPlan, type AgentPlanStep } from '@/components/assistant-ui/elements/agent-plan'
import { Button } from '@/components/ui/button'
import { activityAnnotation, isAnswerRevision, readActivityTasks } from '@/lib/runActivity'
import { terminalFailurePresentation } from '../runtime/terminal-presentation'
import { useRunActivityHistory } from '../runtime/useRunActivityHistory'
import { HistoryActivityScope } from '../runtime/HistoryActivityScope'
import { MemoryTool } from './MemoryTool'
import type { MemoryActivity } from '@/lib/memoryActivity'
import { RunActivity, type RunActivityStatus } from '@/components/assistant-ui/elements/run-activity'
import { readRunTrace } from '@/lib/runTrace'
import { TraceWaterfall } from '@/components/trace-waterfall/trace-waterfall'
import { MarkdownText, type MarkdownConfidenceClaim } from '@/components/assistant-ui/markdown-text'
import { MessageFooterContext, MessageFooterContents } from '@/components/assistant-ui/message-footer'
import { styledGenerativeUILibrary } from '@/components/assistant-ui/elements/generative-ui'
import { Citation } from '@/components/tool-ui/citation'
import { generativeComponentSchemas } from '@/lib/nativeMessage'
import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import { BusinessMessagePart } from './BusinessMessagePart'
import { MessagePartBoundary } from './MessagePartBoundary'
import { NativeTool } from './NativeTool'
import { messagePresentation, orderActivityEntries } from './message-presentation'

const ReadOnlyMessage = createContext(false)
const GroupOwnsFooter = createContext(false)
const LastBodyIndex = createContext(-1)
const PartPresentation = createContext<{ Text: TextMessagePartComponent; footer: ReactNode; mediaFooter: ReactNode }>({ Text: DefaultText, footer: null, mediaFooter: null })

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
    const readOnly = useContext(ReadOnlyMessage)
    const parsed = z.record(z.string(), z.unknown()).parse(schema.parse(props))
    if (name === 'memory-summary') return <MemoryTool memory={parsed as MemoryActivity} readOnly={readOnly} />
    if (name === 'agent-plan') return <AgentPlan title={String(parsed.title)} steps={parsed.steps as AgentPlanStep[]} activeIndex={Number(parsed.activeIndex)} paused={!running} />
    if (name === 'calendar-event') {
      const event = parsed.event as { title: string; startAt: string }
      return <p className="whitespace-pre-wrap text-sm">{event.title} · {event.startAt}（日历功能已停止支持）</p>
    }
    if (name === 'learning-stats') return <p className="text-sm text-muted-foreground">历史学习统计已归档。</p>
    const Component = styledGenerativeUILibrary[name]!.render
    return <Component {...parsed} $status="done">{children}</Component>
  },
]))

function DefaultText() {
  const claims = useAuiState(state => {
    const part = state.message.content.find(part => part.type === 'data' && part.name === 'citation-claims')
    return part?.type === 'data' ? (part.data as { claims: MarkdownConfidenceClaim[] }).claims : undefined
  })
  return <MessageFooterContents inset={false}><MarkdownText agent confidenceClaims={claims} inlineCitations /></MessageFooterContents>
}

function PartFrame({ children, footer, mediaFooter }: { children: ReactNode; footer: ReactNode; mediaFooter: ReactNode }) {
  const groupOwnsFooter = useContext(GroupOwnsFooter)
  const part = useAuiState(state => state.part)
  const lastBodyIndex = useContext(LastBodyIndex)
  const isLast = useAuiState(state => !groupOwnsFooter && state.message.parts[lastBodyIndex] === state.part)
  const value = !groupOwnsFooter && isLast ? part.type === 'image' || part.type === 'file' ? mediaFooter : footer : null
  return <MessageFooterContext.Provider value={value}>
    <div className="min-w-0" data-native-part={part.type} data-part-identity={activityAnnotation(part)?.id}>
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
    case 'text': content = <VisualizeText part={part} Text={Text} readOnly={readOnly} />; break
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
  return <PartFrame footer={footer} mediaFooter={mediaFooter}>{isAnswerRevision(part) ? <details data-slot="answer-revision" className="min-w-0">
    <summary className="text-muted-foreground hover:text-foreground focus-visible:ring-ring cursor-pointer rounded py-1 text-sm outline-none focus-visible:ring-2">
      {activityAnnotation(part)!.label}
    </summary>
    <div className="border-border mt-2 border-s ps-3">{content}</div>
  </details> : content}</PartFrame>
}

function IndexedPart() { return <NativePart {...useContext(PartPresentation)} /> }
const activityDisplay = { Text: DefaultText, footer: null, mediaFooter: null }
const indexedComponents = {
  Text: IndexedPart, Reasoning: IndexedPart, Source: IndexedPart, Image: IndexedPart, File: IndexedPart,
  tools: { Override: IndexedPart }, data: { Fallback: IndexedPart },
  generativeUI: { components: Object.fromEntries(Object.entries(generativeComponents).map(([name, Component]) => [name,
    function FramedComponent(props: { children?: ReactNode }) {
      const { footer, mediaFooter } = useContext(PartPresentation)
      return <PartFrame footer={footer} mediaFooter={mediaFooter}><MessageFooterContents inset={false}><Component {...props} /></MessageFooterContents></PartFrame>
    },
  ])) },
}

export function NativeMessageContent({ Text = DefaultText, footer = null, mediaFooter = null, attention = null }: {
  Text?: TextMessagePartComponent; footer?: ReactNode; mediaFooter?: ReactNode; attention?: ReactNode
}) {
  const readOnly = useContext(ReadOnlyMessage)
  const message = useAuiState(state => state.message)
  const [activityOpen, setActivityOpen] = useState(false)
  const [traceSelection, setTraceSelection] = useState<{ scope: string; id: string | null; version: number }>({ scope: '', id: null, version: 0 })
  const trace = useMemo(() => message.role === 'assistant' ? readRunTrace(message.metadata.custom.runTrace) : undefined,
    [message.role,message.metadata.custom.runTrace])
  const custom = message.metadata.custom
  const traceScope = JSON.stringify([message.id, (custom.harness as RunDisplayState | undefined)?.requestVersion, trace?.root.id])
  const selectedTraceSpanId = traceSelection.scope === traceScope ? traceSelection.id : null
  const target = useMemo(() => typeof custom.conversationId === 'string' && typeof custom.senderId === 'string' && typeof custom.runId === 'string'
    ? { conversationId: custom.conversationId, agentId: custom.senderId, runId: custom.runId,
      ...(typeof custom.threadRootId === 'string' ? { threadId: custom.threadRootId } : {}) } : undefined,
  [custom.conversationId, custom.senderId, custom.runId, custom.threadRootId])
  const history = useRunActivityHistory({ target, message, enabled: !readOnly && message.role === 'assistant' })
  const tasks = readActivityTasks(custom.activityTasks)?.tasks
  const presentation = useMemo(() => messagePresentation(message), [message])
  const liveEntries = presentation.flatMap(item => item.region === 'process' && item.annotation ? [{
    id: item.annotation.id, order: item.annotation.order, taskId: item.annotation.taskId, kind: item.part.type === 'tool-call' ? 'tool' as const : 'commentary' as const,
    revision: isAnswerRevision(item.part),
    label: item.part.type === 'text' && !isAnswerRevision(item.part) ? item.part.text.slice(0,500).replace(/\s+/gu,' ').trim().slice(0,160) || item.annotation.label : item.annotation.label,
    content: <PartPresentation.Provider value={activityDisplay}><GroupOwnsFooter.Provider value={true}><MessagePrimitive.PartByIndex index={item.index} components={indexedComponents} /></GroupOwnsFooter.Provider></PartPresentation.Provider>,
  }] : [])
  const archivedEntries = history.entries.map(entry => {
    const annotation = activityAnnotation(entry.part)!
    return { id: entry.id, order: entry.order, taskId: annotation.taskId, history: true, revision: isAnswerRevision(entry.part),
      kind: entry.part.type === 'tool-call' ? 'tool' as const : 'commentary' as const, label: annotation.label,
      content: <HistoryActivityScope entry={entry}><ReadOnlyMessage.Provider value={true}><GroupOwnsFooter.Provider value={true}>
        <NativePart />
      </GroupOwnsFooter.Provider></ReadOnlyMessage.Provider></HistoryActivityScope>,
    }
  })
  // The page hook removes every live identity, including results/attention which stay outside this disclosure.
  // Missing historical order is kept in its persisted page order; no time or parent relation is inferred.
  const entries = orderActivityEntries([...archivedEntries, ...liveEntries])
  const historyControls = history.hasMore || history.isLoading || history.error ? <div data-slot="run-activity-history" className="grid justify-items-start gap-2">
    {history.error && <p role="alert" className="text-sm text-destructive">{history.error}</p>}
    <Button type="button" variant="ghost" size="sm" disabled={history.isLoading} onClick={history.error ? history.retry : history.loadMore}>
      {history.isLoading ? '正在加载…' : history.error ? '重试' : '加载更多过程'}
    </Button>
  </div> : undefined
  const status: RunActivityStatus = message.status?.type === 'running' ? 'running'
    : message.status?.type === 'requires-action' ? 'requires-action'
    : message.status?.type === 'incomplete' ? message.status.reason === 'cancelled' ? 'cancelled' : message.status.reason === 'error' ? 'error' : 'incomplete'
    : 'complete'
  const statusLabel = status === 'error' || status === 'cancelled'
    ? terminalFailurePresentation(message)?.statusLabel ?? (status === 'cancelled' ? '已取消' : '执行未完成')
    : { running: '处理中', 'requires-action': '等待处理', complete: '处理过程', incomplete: '未完成' }[status]
  const attachments = message.role === 'user' ? message.attachments : []
  const body = presentation.filter(item => item.region === 'body')
  const decisions = presentation.filter(item => item.region === 'attention')
  const lastBodyIndex = body.findLast(item => item.part.type !== 'data' || item.part.name !== 'citation-claims')?.index ?? -1
  const display = { Text, footer, mediaFooter }
  return <LastBodyIndex.Provider value={lastBodyIndex}><GroupOwnsFooter.Provider value={false}><PartPresentation.Provider value={display}><div className="native-message-content grid min-w-0 gap-2" data-aui-theme="elements">
    {(entries.length > 0 || trace || tasks?.length || historyControls) && <RunActivity status={status} statusLabel={statusLabel} entries={entries} tasks={tasks} historyControls={historyControls}
      durationLabel={trace?.root.durationMs !== null && trace?.root.durationMs !== undefined ? `${(trace.root.durationMs / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 秒` : undefined}
      onInspectTask={id => setTraceSelection(current => ({ scope: traceScope, id, version: current.version + 1 }))}
      open={activityOpen} onOpenChange={open => { setActivityOpen(open); if (open && history.entries.length === 0 && history.hasMore && !history.isLoading) history.loadMore() }}
      trace={trace ? <TraceWaterfall key={trace.root.id} trace={trace} selectedSpanId={selectedTraceSpanId}
        selectionVersion={traceSelection.version} onSelectedSpanChange={id => setTraceSelection(current => ({ ...current, scope: traceScope, id }))} /> : undefined} />}
    <div data-message-region="body" className="grid min-w-0 gap-2 empty:hidden">
      {body.map(item => <MessagePrimitive.PartByIndex key={item.key} index={item.index} components={indexedComponents} />)}
    </div>
    {body.length === 0 && <MessageFooterContents inset={false}>{footer}</MessageFooterContents>}
    <div data-message-region="attention" className="grid min-w-0 gap-2 empty:hidden"><GroupOwnsFooter.Provider value={true}>
      {decisions.map(item => <MessagePrimitive.PartByIndex key={item.key} index={item.index} components={indexedComponents} />)}
      {attention}
    </GroupOwnsFooter.Provider></div>
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
  </div></PartPresentation.Provider></GroupOwnsFooter.Provider></LastBodyIndex.Provider>
}
