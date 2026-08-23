import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type ApiAgentEvent,
  type ApiAgentRun,
  type ApiAgentRunStatus,
  type ApiAgentWorkspaceFile,
  type ApiAgentWorkspaceFileContent,
  type ApiTriageEconomics,
  api,
} from '@/api/client'
import { Checkbox } from '@/components/Checkbox'
import { CodeBlock, RichBody } from '@/components/Message'
import { ResizeHandle } from '@/components/ResizeHandle'
import { Select } from '@/components/Select'
import { useResizableWidth } from '@/lib/useResizableWidth'
import { cn } from '@/lib/utils'
import { useParticipants } from '@/stores/participants'

type StatusFilter = ApiAgentRunStatus | 'all'
type DevPanel = 'traces' | 'workspace' | 'triage'
const DEV_PANELS: DevPanel[] = ['traces', 'workspace', 'triage']
const PANEL_LABEL: Record<DevPanel, string> = { traces: 'Traces', workspace: 'Workspace', triage: 'Triage $' }
const TRIAGE_WINDOWS: { hours: number; label: string }[] = [
  { hours: 6, label: '6h' }, { hours: 24, label: '24h' }, { hours: 72, label: '3d' }, { hours: 168, label: '7d' },
]

const STATUS_OPTIONS: StatusFilter[] = ['all', 'running', 'waiting_for_human', 'stalled', 'failed', 'completed', 'skipped']

const STATUS_STYLE: Record<ApiAgentRunStatus, { label: string; cls: string; dot: string }> = {
  running: {
    label: "运行",
    cls: 'bg-sky2-50 text-skype-deep border-sky2-100',
    dot: 'var(--skype)',
  },
  waiting_for_human: {
    label: '等待用户',
    cls: 'bg-cloud text-gold-deep border-gold',
    dot: 'var(--gold-deep)',
  },
  stalled: {
    label: "停滞",
    cls: 'bg-coral-soft text-coral-deep border-coral-soft',
    dot: 'var(--coral-deep)',
  },
  failed: {
    label: "失败",
    cls: 'bg-coral-soft text-coral-deep border-coral-soft',
    dot: 'var(--coral-deep)',
  },
  completed: {
    label: "已完成",
    cls: 'bg-cloud text-ink-700 border-ink-100',
    dot: 'var(--avail)',
  },
  skipped: {
    label: "已跳过",
    cls: 'bg-ink-100 text-ink-600 border-ink-100',
    dot: 'var(--ink-300)',
  },
}

const LEVEL_STYLE: Record<ApiAgentEvent['level'], string> = {
  debug: 'border-ink-100 bg-paper text-ink-500',
  info: 'border-sky2-100 bg-sky2-50 text-skype-deep',
  warn: 'border-gold bg-cloud text-gold-deep',
  error: 'border-coral-soft bg-coral-soft text-coral-deep',
}

function clock(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function elapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 100) / 10
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rest = Math.round(s % 60)
  return `${m}m ${rest}s`
}

function relative(ts: string): string {
  const delta = Date.now() - new Date(ts).getTime()
  if (delta < 5000) return 'just now'
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`
  return `${Math.round(delta / 3_600_000)}h ago`
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return String(value)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asTraceText(value: unknown): { text: string; length?: number; truncated?: boolean } | null {
  if (typeof value === 'string') return { text: value }
  if (!isRecord(value) || typeof value.text !== 'string') return null
  return {
    text: value.text,
    length: typeof value.length === 'number' ? value.length : undefined,
    truncated: Boolean(value.truncated),
  }
}

function MetaGrid({ items }: { items: Array<{ label: string; value: unknown }> }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {items.filter((item) => item.value !== undefined && item.value !== null && item.value !== '').map((item) => (
        <div key={item.label} className="rounded-[9px] border border-ink-100 bg-paper px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-ink-300">{item.label}</div>
          <div className="mt-1 truncate font-mono text-[11.5px] text-ink-800">{String(item.value)}</div>
        </div>
      ))}
    </div>
  )
}

function PayloadBlock({ label, value, empty = '(empty)' }: { label: string; value: unknown; empty?: string }) {
  const traced = asTraceText(value)
  const text = traced ? traced.text : typeof value === 'undefined' ? '' : pretty(value)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">{label}</div>
        {traced?.length !== undefined && (
          <div className="font-mono text-[10px] text-ink-300">
            {traced.length.toLocaleString()} 字符{traced.truncated ? "/ 被截断" : ''}
          </div>
        )}
      </div>
      <pre className="max-h-[360px] overflow-auto rounded-[10px] border border-ink-100 bg-ink-900 p-3 text-[11px] leading-[1.55] text-sky2-50">
        {text || empty}
      </pre>
    </div>
  )
}

function TraceInputView({ value }: { value: unknown }) {
  if (!Array.isArray(value)) return <PayloadBlock label="输入" value={value} />
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">输入消息</div>
      {value.map((item, idx) => {
        const rec = isRecord(item) ? item : {}
        const content = Array.isArray(rec.content) ? rec.content : []
        return (
          <div key={idx} className="rounded-[10px] border border-ink-100 bg-paper p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-ink-400">
              <span>#{idx + 1}</span>
              {rec.role !== undefined && <span>角色={String(rec.role)}</span>}
              {rec.type !== undefined && <span>类型={String(rec.type)}</span>}
              {rec.callId !== undefined && <span>呼叫={String(rec.callId)}</span>}
            </div>
            <div className="space-y-2">
              {rec.output !== undefined && <PayloadBlock label="函数输出" value={rec.output} />}
              {content.map((part, partIdx) => {
                const p = isRecord(part) ? part : {}
                const type = String(p.type ?? `part ${partIdx + 1}`)
                if (p.text !== undefined) return <PayloadBlock key={partIdx} label={type} value={p.text} />
                if (type === 'input_image') {
                  return (
                    <div key={partIdx} className="rounded-[9px] border border-sky2-100 bg-sky2-50 px-3 py-2 font-mono text-[11px] text-skype-deep">
                      图像/ {String(p.detail ?? 'auto')} / {String(p.imageUrl ?? '')}
                    </div>
                  )
                }
                return <PayloadBlock key={partIdx} label={type} value={p} />
              })}
              {content.length === 0 && rec.content !== undefined && <PayloadBlock label="内容" value={rec.content} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ModelRequestDetails({ data }: { data: Record<string, unknown> }) {
  const request = isRecord(data.request) ? data.request : {}
  return (
    <div className="mt-3 space-y-3">
      <MetaGrid items={[
        { label: "模型", value: data.model },
        { label: "跳", value: data.hop },
        { label: "上一页", value: data.previousResponseId },
        { label: "最大令牌数", value: request.maxOutputTokens },
      ]} />
      <PayloadBlock label="说明" value={data.instructions} />
      <TraceInputView value={data.input} />
    </div>
  )
}

function ModelResponseDetails({ data }: { data: Record<string, unknown> }) {
  const usage = isRecord(data.usage) ? data.usage : {}
  const toolCalls = Array.isArray(data.toolCalls) ? data.toolCalls : []
  return (
    <div className="mt-3 space-y-3">
      <MetaGrid items={[
        { label: "模型", value: data.model },
        { label: "跳", value: data.hop },
        { label: "回应", value: data.responseId },
        { label: "状态", value: data.status },
        { label: "输入标记", value: usage.input_tokens },
        { label: "输出标记", value: usage.output_tokens },
      ]} />
      <PayloadBlock label="输出文本" value={data.outputText} empty="(no assistant text; tool-only response)" />
      {toolCalls.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">请求工具调用</div>
          {toolCalls.map((call, idx) => {
            const rec = isRecord(call) ? call : {}
            return (
              <div key={idx} className="rounded-[10px] border border-ink-100 bg-paper p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-ink-400">
                  <span>{String(rec.name ?? 'tool')}</span>
                  {rec.callId !== undefined && <span>{String(rec.callId)}</span>}
                </div>
                <PayloadBlock label="参数" value={rec.arguments ?? rec.rawArguments} />
              </div>
            )
          })}
        </div>
      )}
      <PayloadBlock label="响应输出项目" value={data.output} />
    </div>
  )
}

function ToolDetails({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="mt-3 space-y-3">
      <MetaGrid items={[
        { label: "跳", value: data.hop },
        { label: "呼叫", value: data.callId },
        { label: "持续时间", value: typeof data.durationMs === 'number' ? elapsed(data.durationMs) : undefined },
        { label: "好的", value: data.ok },
      ]} />
      {data.args !== undefined && <PayloadBlock label="参数" value={data.args} />}
      {data.output !== undefined && <PayloadBlock label="输出" value={data.output} />}
      {data.error !== undefined && data.error !== null && <PayloadBlock label="错误" value={data.error} />}
    </div>
  )
}

function EventDetails({ event }: { event: ApiAgentEvent }) {
  const data = event.data ?? {}
  const specialized = event.kind === 'model.request'
    ? <ModelRequestDetails data={data} />
    : event.kind === 'model.response'
      ? <ModelResponseDetails data={data} />
      : event.kind.startsWith('tool.')
        ? <ToolDetails data={data} />
        : null
  const defaultOpen = event.kind === 'model.request' || event.kind === 'model.response' || event.kind.startsWith('tool.')

  return (
    <div>
      {specialized}
      <details className="mt-3" open={!specialized && defaultOpen}>
        <summary className="cursor-pointer select-none text-[11px] font-semibold text-skype-deep">原始数据</summary>
        <pre className="mt-2 max-h-[260px] overflow-auto rounded-[9px] bg-ink-900 p-3 text-[11px] leading-[1.45] text-sky2-50">
          {pretty(data)}
        </pre>
      </details>
    </div>
  )
}

function bytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${Math.round(size / 1024 / 102.4) / 10} MB`
}

function StatusPill({ status }: { status: ApiAgentRunStatus }) {
  const tone = STATUS_STYLE[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold', tone.cls)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />
      {tone.label}
    </span>
  )
}

function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex h-[46px] min-w-[96px] items-center justify-center gap-2 rounded-[13px] border border-ink-100 bg-cloud px-4 text-[12.5px] font-semibold text-skype-deep transition',
        'shadow-[0_1px_0_rgba(255,255,255,0.95)_inset,0_12px_28px_-24px_rgba(26,78,120,0.58)]',
        'hover:border-sky2-200 hover:bg-sky2-50/70 active:scale-[0.985]',
        'focus:outline-none focus:ring-4 focus:ring-sky2-100',
        loading && 'text-skype-deep/75',
      )}
      aria-busy={loading}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid h-4 w-4 place-items-center rounded-full border transition',
          loading
            ? 'animate-spin border-sky2-200 border-t-skype'
            : 'border-sky2-200 bg-sky2-50 shadow-[inset_0_0_0_4px_rgba(255,255,255,0.72)]',
        )}
      />
      <span>刷新</span>
    </button>
  )
}

function AgentDot({ run }: { run: ApiAgentRun }) {
  return (
    <div
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white"
      style={{
        background: run.agentAvatarUrl
          ? `center / cover url(${run.agentAvatarUrl})`
          : 'linear-gradient(135deg, var(--skype), var(--whisper))',
      }}
    >
      {!run.agentAvatarUrl && run.agentName.charAt(0).toUpperCase()}
    </div>
  )
}

function RunRow({ run, active, onClick }: { run: ApiAgentRun; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-[12px] border p-3 text-left transition',
        active
          ? 'border-sky2-200 bg-cloud shadow-soft'
          : 'border-transparent bg-transparent hover:border-ink-100 hover:bg-cloud/70',
      )}
    >
      <div className="flex items-start gap-3">
        <AgentDot run={run} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-[13.5px] font-semibold text-ink-900">{run.agentName}</div>
            <StatusPill status={run.status} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-500">
            <span>{clock(run.startedAt)}</span>
            <span className="h-1 w-1 rounded-full bg-ink-200" />
            <span>{elapsed(run.durationMs)}</span>
            {run.stage && (
              <>
                <span className="h-1 w-1 rounded-full bg-ink-200" />
                <span className="truncate font-mono">{run.stage}</span>
              </>
            )}
          </div>
          <div className="mt-2 line-clamp-2 text-[12px] leading-[1.45] text-ink-600">
            {run.error || run.summary || `${run.inboxCount} unread inputs`}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10.5px] font-semibold text-ink-400">
            <span>{run.inboxCount} 收件箱</span>
            <span>/</span>
            <span>{run.toolCallCount} 工具</span>
            <span>/</span>
            <span>{run.tokenCount} 令牌</span>
          </div>
        </div>
      </div>
    </button>
  )
}

function EventRow({ event }: { event: ApiAgentEvent }) {
  return (
    <div className="relative grid grid-cols-[98px_18px_minmax(0,1fr)] gap-3">
      <div className="pt-1 text-right font-mono text-[11px] text-ink-400">{clock(event.createdAt)}</div>
      <div className="relative flex justify-center">
        <span className="absolute top-0 h-full w-px bg-ink-100" />
        <span
          className={cn(
            'relative mt-1 h-3 w-3 rounded-full border-2 bg-cloud',
            event.level === 'error' ? 'border-coral-deep' : event.level === 'warn' ? 'border-gold-deep' : 'border-skype',
          )}
        />
      </div>
      <div className="pb-5">
        <div className={cn('rounded-[12px] border bg-cloud p-3', event.level === 'error' && 'border-coral-soft')}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold', LEVEL_STYLE[event.level])}>
              {event.level}
            </span>
            <span className="font-mono text-[11px] text-ink-400">{event.kind}</span>
            <span className="ml-auto text-[11px] text-ink-400">{relative(event.createdAt)}</span>
          </div>
          <div className="mt-2 text-[13px] font-semibold text-ink-900">{event.title}</div>
          {Object.keys(event.data ?? {}).length > 0 && <EventDetails event={event} />}
        </div>
      </div>
    </div>
  )
}

/* ============== Workspace file tree ============== */

interface FileTreeNode {
  name: string
  /** Full path from root, e.g. `memory/preference/mem-abc.md`. */
  path: string
  kind: 'folder' | 'file'
  /** Folder children indexed by name, sorted folders-first then alpha. */
  children?: FileTreeNode[]
  /** File-only: backref to the original API row for metadata + size. */
  file?: ApiAgentWorkspaceFile
}

/** Build a hierarchical tree from a flat list of paths. Folders are
 *  synthesized for every `/`-separated prefix; files sit at the leaves. */
function buildFileTree(files: ApiAgentWorkspaceFile[]): FileTreeNode[] {
  const root: FileTreeNode = { name: '', path: '', kind: 'folder', children: [] }
  for (const f of files) {
    const segs = f.path.split('/')
    let cursor = root
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]
      const isLast = i === segs.length - 1
      const prefix = segs.slice(0, i + 1).join('/')
      let next = cursor.children?.find((c) => c.name === seg && c.kind === (isLast ? 'file' : 'folder'))
      if (!next) {
        next = isLast
          ? { name: seg, path: prefix, kind: 'file', file: f }
          : { name: seg, path: prefix, kind: 'folder', children: [] }
        cursor.children = cursor.children ?? []
        cursor.children.push(next)
      }
      cursor = next
    }
  }
  const sortRec = (n: FileTreeNode) => {
    if (!n.children) return
    n.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const c of n.children) sortRec(c)
  }
  sortRec(root)
  return root.children ?? []
}

/** All ancestor folder paths so a freshly-loaded list can start with
 *  every folder expanded (a flat-feeling default for small trees). */
function allFolderPaths(nodes: FileTreeNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.kind === 'folder') {
      out.push(n.path)
      if (n.children) allFolderPaths(n.children, out)
    }
  }
  return out
}

function FolderRow({ node, depth, expanded, onToggle }: {
  node: FileTreeNode; depth: number; expanded: boolean; onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 rounded-[7px] px-1.5 py-1 text-left transition hover:bg-cloud/80"
      style={{ paddingLeft: 6 + depth * 14 }}
    >
      <svg
        width="10" height="10" viewBox="0 0 10 10"
        className="shrink-0 text-ink-400 transition-transform"
        style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
      >
        <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0 text-skype-deep">
        <path
          d={expanded
            ? 'M1.5 4h3l1 1h7v6.5a1 1 0 0 1-1 1H1.5z'
            : 'M1.5 3.5h3l1 1H12a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V3.5z'}
          fill="currentColor" opacity="0.18"
        />
        <path
          d="M1.5 4.5h4l1 1h6.5"
          stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
      <span className="truncate font-mono text-[12px] font-semibold text-ink-700">{node.name}</span>
    </button>
  )
}

const FILE_TYPE_TINT: Record<string, { bg: string; fg: string }> = {
  md:   { bg: 'var(--sky2-50)',    fg: 'var(--skype-deep)' },
  json: { bg: 'var(--gold-soft)',  fg: 'var(--gold-deep)' },
  yaml: { bg: 'var(--gold-soft)',  fg: 'var(--gold-deep)' },
  yml:  { bg: 'var(--gold-soft)',  fg: 'var(--gold-deep)' },
  ts:   { bg: 'var(--whisper-50)', fg: 'var(--whisper-deep)' },
  tsx:  { bg: 'var(--whisper-50)', fg: 'var(--whisper-deep)' },
  js:   { bg: 'var(--whisper-50)', fg: 'var(--whisper-deep)' },
  py:   { bg: 'var(--coral-soft)', fg: 'var(--coral-deep)' },
  sh:   { bg: 'var(--ink-100)',    fg: 'var(--ink-700)' },
  txt:  { bg: 'var(--ink-100)',    fg: 'var(--ink-500)' },
}

function FileRow({ node, depth, active, onClick }: {
  node: FileTreeNode; depth: number; active: boolean; onClick: () => void
}) {
  if (!node.file) return null
  const ext = node.name.includes('.') ? node.name.split('.').pop()!.toLowerCase() : ''
  const tint = FILE_TYPE_TINT[ext] ?? { bg: 'var(--ink-100)', fg: 'var(--ink-500)' }
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-[7px] py-1 pr-1.5 text-left transition',
        active ? 'bg-sky2-50 ring-1 ring-sky2-200' : 'hover:bg-cloud/80',
      )}
      style={{ paddingLeft: 6 + depth * 14 }}
    >
      <span className="ml-[10px] grid h-[18px] w-[22px] shrink-0 place-items-center rounded-[4px] font-mono text-[9px] font-bold uppercase tracking-tight"
        style={{ background: tint.bg, color: tint.fg }}>
        {ext || 'f'}
      </span>
      <span className={cn('truncate font-mono text-[12px]', active ? 'font-semibold text-skype-deep' : 'text-ink-700')}>{node.name}</span>
      <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-300">{bytes(node.file.size)}</span>
    </button>
  )
}

function FileTree({ nodes, depth, expanded, onToggle, selectedPath, onSelect }: {
  nodes: FileTreeNode[]
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  return (
    <div className="space-y-px">
      {nodes.map((n) => {
        if (n.kind === 'folder') {
          const isOpen = expanded.has(n.path)
          return (
            <div key={n.path}>
              <FolderRow node={n} depth={depth} expanded={isOpen} onToggle={() => onToggle(n.path)} />
              {isOpen && n.children && (
                <FileTree
                  nodes={n.children}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggle={onToggle}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                />
              )}
            </div>
          )
        }
        return (
          <FileRow
            key={n.path}
            node={n}
            depth={depth}
            active={n.path === selectedPath}
            onClick={() => onSelect(n.path)}
          />
        )
      })}
    </div>
  )
}

/** File-content renderer that picks the right view based on extension.
 *   - `.md` → RichBody (LingxiLoop's own markdown-ish renderer)
 *   - `.json` / `.ts` / `.py` / etc → CodeBlock (syntax-highlit)
 *   - anything else → wrapped plain text in paper theme */
function FileViewer({ path, body }: { path: string; body: string }) {
  const ext = path.includes('.') ? path.split('.').pop()!.toLowerCase() : ''
  if (!body) return <div className="text-[13px] italic text-ink-400">（空文件）</div>
  if (ext === 'md' || ext === 'markdown') {
    return (
      <div className="lingxiloop-prose font-display text-[14px] leading-[1.7] text-ink-900">
        <RichBody body={body} />
      </div>
    )
  }
  const codeLangs: Record<string, string> = {
    json: 'json', yaml: 'yaml', yml: 'yaml', ts: 'typescript', tsx: 'tsx',
    js: 'javascript', jsx: 'jsx', py: 'python', sh: 'bash', go: 'go',
    rs: 'rust', sql: 'sql', css: 'css', html: 'html',
  }
  if (codeLangs[ext]) {
    return <CodeBlock lang={codeLangs[ext]} code={body} />
  }
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.6] text-ink-900">
      {body}
    </pre>
  )
}

function fmtUsd(n: number): string {
  const a = Math.abs(n)
  const s = a >= 1 ? n.toFixed(2) : a >= 0.01 ? n.toFixed(4) : n.toFixed(6)
  return `$${s}`
}
function fmtPct(n: number): string { return `${(n * 100).toFixed(0)}%` }
function fmtTok(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n) }

function StatCard({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'pos' | 'neg' | 'warn' | 'muted'
}) {
  const cls = tone === 'neg' ? 'text-coral-deep' : tone === 'warn' ? 'text-gold-deep' : tone === 'muted' ? 'text-ink-400' : 'text-ink-900'
  const style = tone === 'pos' ? { color: 'var(--avail)' } : undefined
  return (
    <div className="rounded-[10px] border border-ink-100 bg-paper px-3.5 py-3">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-ink-300">{label}</div>
      <div className={cn('mt-1 font-display text-[20px] font-medium tabular-nums', cls)} style={style}>{value}</div>
      {sub && <div className="mt-0.5 text-[10.5px] leading-snug text-ink-400">{sub}</div>}
    </div>
  )
}

/** The full token unit-price menu — small brain vs big brain, always visible so
 *  the user knows the rates the estimates rest on. Role is a heuristic on the id
 *  (haiku/mini = cerebellum/small; everything else = main/big). */
function PriceMenuTable({ rows }: { rows: { model: string; inPer1M: number; cachedInPer1M: number; outPer1M: number; estimated: boolean }[] }) {
  if (rows.length === 0) return null
  const isSmall = (m: string) => /haiku|mini/i.test(m)
  return (
    <div className="rounded-[10px] border border-ink-100 bg-paper px-3.5 py-3">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-ink-300">代币单价 · 小脑与大脑（每 1M 代币 — 所有估算，除非您设置 LINGXILOOP_MODEL_PRICES_JSON）</div>
      <table className="mt-2 w-full text-[11.5px]">
        <thead className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-400">
          <tr>
            <th className="py-1 text-left">等级</th>
            <th className="py-1 text-left">型号</th>
            <th className="py-1 text-right">输入</th>
            <th className="py-1 text-right">缓存读取</th>
            <th className="py-1 text-right">输出</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((p) => (
            <tr key={p.model}>
              <td className="py-1">
                <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase', isSmall(p.model) ? 'bg-ink-100 text-ink-600' : 'bg-sky2-50 text-skype-deep')}>
                  {isSmall(p.model) ? "小脑瓜" : "大脑子"}
                </span>
              </td>
              <td className="py-1 font-mono text-ink-700">{p.model}</td>
              <td className="py-1 text-right tabular-nums text-ink-600">${p.inPer1M}</td>
              <td className="py-1 text-right tabular-nums text-ink-600">${p.cachedInPer1M}</td>
              <td className="py-1 text-right tabular-nums text-ink-600">${p.outPer1M}</td>
              <td className="py-1 text-right">{p.estimated && <span className="rounded bg-coral-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-coral-deep">东部</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The triage cost-effectiveness ledger — a self-contained full-width panel.
 *  Answers the user's question: is the small-brain gate actually saving money,
 *  given triage is always cold (uncached) while big-brain turns are cache-warm? */
function TriageEconomicsPanel(props: {
  panel: DevPanel
  setPanel: (p: DevPanel) => void
  agents: { id: string; name: string }[]
  agentId: string
  setAgentId: (v: string) => void
  hours: number
  setHours: (n: number) => void
  data: ApiTriageEconomics | null
  loading: boolean
  err: string | null
  onRefresh: () => void
}) {
  const { data } = props
  const net = data?.estimatedNetSavingsUsd ?? 0
  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-paper">
      <div className="border-b border-ink-100 px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[25px] font-medium tracking-tight text-ink-900">分类经济学</h1>
            <div className="mt-1 text-[12px] text-ink-500">
              小脑门省钱吗？每个分类都是一个冷会话（未缓存的输入）；它所屏蔽的大大脑变成了缓存温暖的。
            </div>
          </div>
          <RefreshButton loading={props.loading} onClick={props.onRefresh} />
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="grid grid-cols-3 gap-1 rounded-[11px] border border-ink-100 bg-cloud p-1">
            {DEV_PANELS.map((item) => (
              <button
                key={item}
                onClick={() => props.setPanel(item)}
                className={cn(
                  'rounded-[8px] px-3 py-2 text-[12px] font-semibold transition',
                  props.panel === item ? 'bg-sky2-50 text-skype-deep shadow-soft' : 'text-ink-500 hover:text-ink-700',
                )}
              >
                {PANEL_LABEL[item]}
              </button>
            ))}
          </div>
          <label className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-400">
            智能体
            <Select
              value={props.agentId}
              onValueChange={props.setAgentId}
              options={[{ value: 'all', label: "所有智能体" }, ...props.agents.map((a) => ({ value: a.id, label: a.name }))]}
              className="mt-1 w-44 normal-case tracking-normal"
            />
          </label>
          <label className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-400">
            窗口
            <Select<string>
              value={String(props.hours)}
              onValueChange={(v) => props.setHours(Number(v))}
              options={TRIAGE_WINDOWS.map((w) => ({ value: String(w.hours), label: w.label }))}
              className="mt-1 w-24 normal-case tracking-normal"
            />
          </label>
        </div>
      </div>

      {props.err && (
        <div className="mx-6 mt-4 rounded-[10px] bg-coral-soft px-3 py-2 text-[12px] text-coral-deep">{props.err}</div>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        {!data ? (
          <div className="grid h-full place-items-center text-[13px] text-ink-400">{props.loading ? "加载中…" : "无数据。"}</div>
        ) : (
          <div className="mx-auto max-w-[1100px] space-y-5">
            {/* ALWAYS-ON disclaimer: every $ here is an estimate. */}
            <div className="rounded-[10px] border border-coral-soft bg-coral-soft px-3.5 py-2.5 text-[11.5px] leading-[1.6] text-coral-deep">
              <b>⚠ 此页上的每一美元都是估算值</b>，可能与实际成本不同。DeepSeek 的默认价格仅用于估算；代币数量是真实的。设置 <code className="rounded bg-paper/60 px-1">LINGXILOOP_MODEL_PRICES_JSON</code> 为你的实际合同费率可获得准确结果。
            </div>

            {data.triageCount === 0 ? (
              <>
                <PriceMenuTable rows={data.priceTable ?? []} />
                <div className="rounded-[10px] border border-ink-100 bg-cloud px-3.5 py-3 text-[12px] leading-[1.6] text-ink-500">
                  此窗口中尚未记录分类。Agent OS 的下一次学习任务会开始记录；上表展示届时采用的参考价格。
                </div>
              </>
            ) : (
            <>
            {/* The headline: estimated net savings = avoided big-brain spend − triage spend. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label="预计。净储蓄"
                value={`${net >= 0 ? '+' : ''}${fmtUsd(net)}`}
                tone={net >= 0 ? 'pos' : 'neg'}
                sub={net >= 0 ? 'gate is paying off (estimate)' : 'gate COSTS more than it saves (estimate)'}
              />
              <StatCard
                label="避免大脑 $"
                value={fmtUsd(data.estimatedAvoidedUsd)}
                tone="pos"
                sub={`${data.triageSkipCount} skips × avg turn ${fmtUsd(data.avgTurnCostUsd)} (est.)`}
              />
              <StatCard label="分类支出" value={fmtUsd(data.triageCostUsd)} sub={`${data.triageCount} triages · ${data.triageMeasuredCount} measured`} />
              <StatCard label="头顶（唤醒大脑）" value={fmtUsd(data.triageOverheadUsd)} tone={data.triageOverheadUsd > 0 ? 'warn' : undefined} sub={`${data.triageWakeCount} paid the gate AND ran the turn`} />
              <StatCard label="大脑缓存命中" value={fmtPct(data.turnCacheHitRate)} sub={`${data.turnCount} turns · avg ${fmtUsd(data.avgTurnCostUsd)}`} />
              <StatCard label="跳过率" value={data.triageCount > 0 ? fmtPct(data.triageSkipCount / data.triageCount) : '—'} sub={`triage tokens: ${fmtTok(data.triageInputTokens ?? 0)} uncached in`} />
            </div>

            {/* The actual per-token unit prices the estimates rest on (table). */}
            {(data.unitPrices?.length ?? 0) > 0 && (
              <div className="rounded-[10px] border border-ink-100 bg-paper px-3.5 py-3">
                <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-ink-300">使用的单价 · 每 1M 代币（所有估计值，除非您设置 LINGXILOOP_MODEL_PRICES_JSON）</div>
                <table className="mt-2 w-full text-[11.5px]">
                  <thead className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-400">
                    <tr>
                      <th className="py-1 text-left">大脑
其中</th>
                      <th className="py-1 text-left">型号</th>
                      <th className="py-1 text-right">输入</th>
                      <th className="py-1 text-right">缓存读取</th>
                      <th className="py-1 text-right">输出</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {(data.unitPrices ?? []).map((p) => (
                      <tr key={`${p.role}:${p.model}`}>
                        <td className="py-1">
                          <span className={cn(
                            'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase',
                            p.role === 'triage' ? 'bg-ink-100 text-ink-600' : 'bg-sky2-50 text-skype-deep',
                          )}>{p.role === 'triage' ? "小脑瓜" : "大脑子"}</span>
                        </td>
                        <td className="py-1 font-mono text-ink-700">{p.model}</td>
                        <td className="py-1 text-right tabular-nums text-ink-600">${p.inPer1M}</td>
                        <td className="py-1 text-right tabular-nums text-ink-600">${p.cachedInPer1M}</td>
                        <td className="py-1 text-right tabular-nums text-ink-600">${p.outPer1M}</td>
                        <td className="py-1 text-right">{p.estimated && <span className="rounded bg-coral-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-coral-deep">东部</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="rounded-[10px] border border-ink-100 bg-cloud px-3.5 py-2.5 text-[11px] leading-[1.6] text-ink-500">
              <b className="text-ink-700">“已保存”的含义以及为什么它是一个估计值：</b> SKIP 可以防止大脑大转弯，所以节省的是 <b>回合将产生的大脑代币成本</b> - 我们无法确切知道（它没有运行）。我们用这个窗口中每个智能体自己的平均有效轮次成本来近似它： <b>避免 = Σ(跳过 × 该智能体的平均回合 $)</b>，那么 <b>净值 = 避免的 − 分类支出</b>。注意：跳过也会让大大脑的提示缓存变冷（5 分钟 TTL），因此稍后的真正回合可能会支付全部未缓存的输入 - 储蓄转移，它们不会消失。除了避免的身材之外，一切都被测量；缓存感知（缓存读取比新鲜输入便宜约 10 倍）。
              {data.costEstimated && <> 价格为 <b>标价估算</b> — 设置 <code className="rounded bg-paper px-1">LINGXILOOP_MODEL_PRICES_JSON</code> 为您的实际合同费率。</>}
            </div>

            {/* Per-agent breakdown. */}
            {props.agentId === 'all' && (data.perAgent?.length ?? 0) > 0 && (
              <div className="overflow-hidden rounded-[10px] border border-ink-100">
                <table className="w-full text-[11.5px]">
                  <thead className="bg-cloud text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-400">
                    <tr>
                      <th className="px-3 py-2 text-left">智能体</th>
                      <th className="px-3 py-2 text-right">分类</th>
                      <th className="px-3 py-2 text-right">跳过%</th>
                      <th className="px-3 py-2 text-right">分类 $</th>
                      <th className="px-3 py-2 text-right">平均转弯 $</th>
                      <th className="px-3 py-2 text-right">缓存命中</th>
                      <th className="px-3 py-2 text-right">预计。网</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {(data.perAgent ?? []).map((a) => (
                      <tr key={a.agentId}>
                        <td className="px-3 py-1.5 text-ink-800">{a.agentName}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ink-600">{a.triageCount}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ink-600">{a.triageCount > 0 ? fmtPct(a.skipCount / a.triageCount) : '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ink-600">{fmtUsd(a.triageCostUsd)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ink-600">{fmtUsd(a.avgTurnCostUsd)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ink-600">{fmtPct(a.turnCacheHitRate)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold" style={a.estimatedNetSavingsUsd >= 0 ? { color: 'var(--avail)' } : undefined}>
                          <span className={a.estimatedNetSavingsUsd < 0 ? 'text-coral-deep' : undefined}>{a.estimatedNetSavingsUsd >= 0 ? '+' : ''}{fmtUsd(a.estimatedNetSavingsUsd)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recent per-triage ledger. */}
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">最近的分类</div>
              <div className="space-y-1">
                {(data.recent ?? []).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-[8px] border border-ink-100 bg-paper px-3 py-1.5 text-[11.5px]">
                    <span className="w-[58px] shrink-0 tabular-nums text-ink-400">{clock(t.createdAt)}</span>
                    <span className="w-[90px] shrink-0 truncate text-ink-700">{t.agentName}</span>
                    <span className={cn(
                      'w-[52px] shrink-0 rounded-full px-1.5 py-0.5 text-center text-[9.5px] font-bold uppercase',
                      t.actionable ? 'bg-sky2-50 text-skype-deep' : 'bg-ink-100 text-ink-500',
                    )}>{t.actionable ? "醒来" : "跳过"}</span>
                    <span className="w-[88px] shrink-0 truncate text-[10px] text-ink-400">{t.source}</span>
                    <span className="w-[80px] shrink-0 text-right tabular-nums text-ink-600">{t.measured ? fmtUsd(t.costUsd) : '—'}</span>
                    <span className="w-[120px] shrink-0 text-right text-[10px] tabular-nums text-ink-400">
                      {t.measured ? `${fmtTok(t.inputTokens)} in · ${fmtTok(t.cachedInputTokens)} cache` : "未测量"}
                    </span>
                    <span className="flex-1 truncate text-right text-[10px] text-ink-400">
                      {!t.actionable && t.estSavingUsd != null
                        ? <span style={t.estSavingUsd >= 0 ? { color: 'var(--avail)' } : undefined} className={t.estSavingUsd < 0 ? 'text-coral-deep' : undefined}>
                            预计。 {t.estSavingUsd >= 0 ? "已保存" : "丢失"}{fmtUsd(Math.abs(t.estSavingUsd))}
                          </span>
                        : <span className="truncate">{t.reason ?? ''}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            </>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

export function ObservabilityView() {
  const byId = useParticipants((s) => s.byId)
  const loaded = useParticipants((s) => s.loaded)
  const { width: sidebarWidth, onResizeStart } = useResizableWidth('sidebar:observability', 380, { min: 280, max: 600 })
  const [panel, setPanel] = useState<DevPanel>('traces')
  const [runs, setRuns] = useState<ApiAgentRun[]>([])
  const [events, setEvents] = useState<ApiAgentEvent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<string>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [workspaceAgentId, setWorkspaceAgentId] = useState<string>('')
  const [workspaceFiles, setWorkspaceFiles] = useState<ApiAgentWorkspaceFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [workspaceFile, setWorkspaceFile] = useState<ApiAgentWorkspaceFileContent | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [workspaceErr, setWorkspaceErr] = useState<string | null>(null)
  const [triage, setTriage] = useState<ApiTriageEconomics | null>(null)
  const [triageHours, setTriageHours] = useState(24)
  const [triageLoading, setTriageLoading] = useState(false)
  const [triageErr, setTriageErr] = useState<string | null>(null)
  // Tree state: which folder paths are expanded. New file lists default to
  // every folder open (most agents have <20 files, flat-feeling is right).
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const fileTree = useMemo(() => buildFileTree(workspaceFiles), [workspaceFiles])
  useEffect(() => {
    setExpandedFolders(new Set(allFolderPaths(fileTree)))
  }, [fileTree])
  const toggleFolder = useCallback((p: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p); else next.add(p)
      return next
    })
  }, [])

  const agents = useMemo(
    () => Object.values(byId).filter((p) => p.kind === 'agent' && !p.departedAt).sort((a, b) => a.name.localeCompare(b.name)),
    [byId],
  )

  useEffect(() => {
    if (!loaded) void useParticipants.getState().load()
  }, [loaded])

  useEffect(() => {
    if (workspaceAgentId || agents.length === 0) return
    setWorkspaceAgentId(agents[0].id)
  }, [agents, workspaceAgentId])

  const loadRuns = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const data = await api.getAgentRuns({
        agentId: agentId === 'all' ? null : agentId,
        status,
        limit: 80,
      })
      setRuns(data)
      setSelectedId((cur) => cur && data.some((run) => run.id === cur) ? cur : data[0]?.id ?? null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [agentId, status])

  const loadEvents = useCallback(async (runId: string | null) => {
    if (!runId) {
      setEvents([])
      return
    }
    try {
      setEvents(await api.getAgentRunEvents(runId))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const loadWorkspaceFiles = useCallback(async () => {
    if (!workspaceAgentId) return
    setWorkspaceLoading(true)
    setWorkspaceErr(null)
    try {
      const files = await api.listAgentWorkspace(workspaceAgentId)
      setWorkspaceFiles(files)
      setSelectedPath((cur) => cur && files.some((file) => file.path === cur) ? cur : files[0]?.path ?? null)
    } catch (e) {
      setWorkspaceErr(e instanceof Error ? e.message : String(e))
    } finally {
      setWorkspaceLoading(false)
    }
  }, [workspaceAgentId])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  useEffect(() => {
    void loadEvents(selectedId)
  }, [loadEvents, selectedId])

  useEffect(() => {
    if (!autoRefresh) return
    const id = window.setInterval(() => {
      // Don't poll when the tab is backgrounded — same pattern as the
      // participants roster refresher. Saves API + battery for a panel
      // the user can't even see.
      if (document.visibilityState === 'hidden') return
      void loadRuns()
      void loadEvents(selectedId)
    }, 3000)
    return () => window.clearInterval(id)
  }, [autoRefresh, loadEvents, loadRuns, selectedId])

  useEffect(() => {
    if (panel === 'workspace') void loadWorkspaceFiles()
  }, [loadWorkspaceFiles, panel])

  const loadTriage = useCallback(async () => {
    setTriageLoading(true)
    setTriageErr(null)
    try {
      setTriage(await api.getTriageEconomics({ agentId: agentId === 'all' ? null : agentId, sinceHours: triageHours }))
    } catch (e) {
      setTriageErr(e instanceof Error ? e.message : String(e))
    } finally {
      setTriageLoading(false)
    }
  }, [agentId, triageHours])

  useEffect(() => {
    if (panel === 'triage') void loadTriage()
  }, [panel, loadTriage])

  useEffect(() => {
    if (panel !== 'workspace' || !workspaceAgentId || !selectedPath) {
      setWorkspaceFile(null)
      return
    }
    let cancelled = false
    setWorkspaceErr(null)
    void api.readAgentWorkspaceFile(workspaceAgentId, selectedPath)
      .then((file) => {
        if (!cancelled) setWorkspaceFile(file)
      })
      .catch((e) => {
        if (!cancelled) setWorkspaceErr(e instanceof Error ? e.message : String(e))
      })
    return () => { cancelled = true }
  }, [panel, selectedPath, workspaceAgentId])

  const selected = useMemo(
    () => runs.find((run) => run.id === selectedId) ?? null,
    [runs, selectedId],
  )

  if (panel === 'triage') {
    return (
      <TriageEconomicsPanel
        panel={panel}
        setPanel={setPanel}
        agents={agents}
        agentId={agentId}
        setAgentId={setAgentId}
        hours={triageHours}
        setHours={setTriageHours}
        data={triage}
        loading={triageLoading}
        err={triageErr}
        onRefresh={() => void loadTriage()}
      />
    )
  }

  return (
    <main
      className="grid h-full min-h-0 overflow-hidden bg-paper"
      style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)` }}
    >
      <section className="relative flex min-h-0 min-w-0 flex-col border-r border-ink-100">
        <div className="border-b border-ink-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-[25px] font-medium tracking-tight text-ink-900">智能体可观察性</h1>
              <div className="mt-1 text-[12px] text-ink-500">每个智能体回合的后端跟踪。</div>
            </div>
            <RefreshButton
              loading={panel === 'traces' ? loading : workspaceLoading}
              onClick={() => panel === 'traces' ? void loadRuns() : void loadWorkspaceFiles()}
            />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-1 rounded-[11px] border border-ink-100 bg-cloud p-1">
            {DEV_PANELS.map((item) => (
              <button
                key={item}
                onClick={() => setPanel(item)}
                className={cn(
                  'rounded-[8px] px-3 py-2 text-[12px] font-semibold transition',
                  panel === item ? 'bg-sky2-50 text-skype-deep shadow-soft' : 'text-ink-500 hover:text-ink-700',
                )}
              >
                {PANEL_LABEL[item]}
              </button>
            ))}
          </div>

          {panel === 'traces' ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <label className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-400">
                  智能体
                  <Select
                    value={agentId}
                    onValueChange={setAgentId}
                    options={[
                      { value: 'all', label: "所有智能体" },
                      ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
                    ]}
                    className="mt-1 normal-case tracking-normal"
                  />
                </label>
                <label className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-400">
                  状态
                  <Select<StatusFilter>
                    value={status}
                    onValueChange={setStatus}
                    options={STATUS_OPTIONS.map((s) => ({
                      value: s,
                      label: s === 'all' ? 'All statuses' : STATUS_STYLE[s].label,
                    }))}
                    className="mt-1 normal-case tracking-normal"
                  />
                </label>
              </div>

              <Checkbox
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                label="自动刷新"
                description="此面板打开时保持跟踪列表处于活动状态"
                className="mt-3"
              />
            </>
          ) : (
            <label className="mt-4 block text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-400">
              智能体工作区
              <Select
                value={workspaceAgentId}
                onValueChange={(next) => {
                  setWorkspaceAgentId(next)
                  setSelectedPath(null)
                  setWorkspaceFile(null)
                }}
                options={agents.length > 0
                  ? agents.map((agent) => ({ value: agent.id, label: agent.name }))
                  : [{ value: '', label: "还没有智能体", disabled: true }]}
                disabled={agents.length === 0}
                className="mt-1 normal-case tracking-normal"
              />
            </label>
          )}
        </div>

        {panel === 'traces' && err && (
          <div className="mx-5 mt-4 rounded-[10px] bg-coral-soft px-3 py-2 text-[12px] text-coral-deep">{err}</div>
        )}
        {panel === 'workspace' && workspaceErr && (
          <div className="mx-5 mt-4 rounded-[10px] bg-coral-soft px-3 py-2 text-[12px] text-coral-deep">{workspaceErr}</div>
        )}

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {panel === 'workspace' ? (
            workspaceFiles.length === 0 ? (
              <div className="grid h-full place-items-center px-8 text-center text-[13px] leading-[1.6] text-ink-400">
                该智能体工作区还没有文件。
              </div>
            ) : (
              <FileTree
                nodes={fileTree}
                depth={0}
                expanded={expandedFolders}
                onToggle={toggleFolder}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
              />
            )
          ) : (
            runs.length === 0 ? (
              <div className="grid h-full place-items-center px-8 text-center text-[13px] leading-[1.6] text-ink-400">
                尚未发现特工踪迹。向智能体对话发送消息，下一次唤醒将出现在此处。
              </div>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <RunRow key={run.id} run={run} active={run.id === selectedId} onClick={() => setSelectedId(run.id)} />
                ))}
              </div>
            )
          )}
        </div>
        <ResizeHandle onMouseDown={onResizeStart} />
      </section>

      <section className="min-h-0 min-w-0 overflow-hidden">
        {panel === 'workspace' ? (
          <div className="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden">
            <header className="border-b border-ink-100 bg-cloud/80 px-6 py-4 backdrop-blur">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-[24px] font-medium text-ink-900">
                    {workspaceFile?.path ?? 'Agent Workspace'}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-400">
                    <span>{workspaceAgentId || 'no-agent'}</span>
                    {workspaceFile && (
                      <>
                        <span>/</span>
                        <span>{bytes(workspaceFile.size)}</span>
                        <span>/</span>
                        <span>{workspaceFile.lineCount} 行</span>
                        <span>/</span>
                        <span>已更新 {relative(workspaceFile.updatedAt)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="rounded-[10px] border border-ink-100 bg-paper px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-300">文件</div>
                  <div className="mt-1 font-mono text-[13px] text-ink-900">{workspaceFiles.length}</div>
                </div>
              </div>
            </header>
            <div className="min-h-0 overflow-auto px-6 py-5">
              {workspaceFile ? (
                <article
                  className="min-h-full rounded-[14px] border border-ink-100 bg-paper p-6 shadow-soft"
                  style={{ background: 'var(--paper)' }}
                >
                  <FileViewer path={workspaceFile.path} body={workspaceFile.body || ''} />
                </article>
              ) : (
                <div className="grid h-full place-items-center text-[13px] text-ink-400">
                  选择工作区文件以检查其内容。
                </div>
              )}
            </div>
          </div>
        ) : selected ? (
          <div className="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden">
            <header className="border-b border-ink-100 bg-cloud/80 px-6 py-4 backdrop-blur">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <AgentDot run={selected} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-display text-[24px] font-medium text-ink-900">{selected.agentName}</h2>
                        <StatusPill status={selected.status} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-400">
                        <span>{selected.id}</span>
                        <span>/</span>
                        <span>{clock(selected.startedAt)}</span>
                        <span>/</span>
                        <span>{selected.stage ?? 'idle'}</span>
                      </div>
                    </div>
                  </div>
                  {(selected.error || selected.summary) && (
                    <div className={cn('mt-3 max-w-[900px] rounded-[10px] px-3 py-2 text-[12.5px] leading-[1.55]', selected.error ? 'bg-coral-soft text-coral-deep' : 'bg-sky2-50 text-ink-700')}>
                      {selected.error || selected.summary}
                    </div>
                  )}
                </div>
                <div className="grid min-w-[360px] grid-cols-4 gap-2">
                  <div className="rounded-[10px] border border-ink-100 bg-paper px-3 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-300">持续时间</div>
                    <div className="mt-1 font-mono text-[13px] text-ink-900">{elapsed(selected.durationMs)}</div>
                  </div>
                  <div className="rounded-[10px] border border-ink-100 bg-paper px-3 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-300">收件箱</div>
                    <div className="mt-1 font-mono text-[13px] text-ink-900">{selected.inboxCount}</div>
                  </div>
                  <div className="rounded-[10px] border border-ink-100 bg-paper px-3 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-300">工具</div>
                    <div className="mt-1 font-mono text-[13px] text-ink-900">{selected.toolCallCount}</div>
                  </div>
                  <div className="rounded-[10px] border border-ink-100 bg-paper px-3 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-300">代币</div>
                    <div className="mt-1 font-mono text-[13px] text-ink-900">{selected.tokenCount}</div>
                  </div>
                </div>
              </div>
            </header>

            <div className="min-h-0 overflow-auto px-6 py-5">
              {events.length === 0 ? (
                <div className="grid h-full place-items-center text-[13px] text-ink-400">本次运行没有记录任何事件。</div>
              ) : (
                <div className="max-w-[1040px]">
                  {events.map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid h-full place-items-center text-[13px] text-ink-400">选择一个运行来检查时间线。</div>
        )}
      </section>
    </main>
  )
}
