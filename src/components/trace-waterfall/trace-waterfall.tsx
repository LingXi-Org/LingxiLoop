import { useEffect,useId,useMemo,useRef,useState } from 'react'
import { BotIcon,ChevronRightIcon,Clock3Icon,DatabaseIcon,GitBranchIcon,SparklesIcon,WrenchIcon } from 'lucide-react'
import type { RunTrace,TraceSpan } from '@/lib/runTrace'
import { cn } from '@/lib/utils'
import { TimelineRowMetrics } from './TimelineRowMetrics'

const ms = (value: number|null) => value === null ? '—' : `${Math.round(value).toLocaleString('zh-CN')} ms`
const tokens = (value: number|null) => value === null ? '—' : value.toLocaleString('zh-CN')
const cost = (span: TraceSpan) => span.cost === null && span.knownCost === undefined ? '—'
  : `${span.cost === null ? '已计' : ''}${span.costEstimated ? '约 ' : ''}$${(span.cost ?? span.knownCost)!.toLocaleString('en-US',{maximumFractionDigits: 8})}`
const labels = { running: '运行中',waiting: '等待处理',complete: '已完成',cancelled: '已取消',error: '失败',unknown: '结果未知' }
const kindLabels = { agent: 'Agent',llm: 'LLM',embedding: 'Embedding',tool: 'Tool' }
const icons = { agent: BotIcon,llm: SparklesIcon,embedding: DatabaseIcon,tool: WrenchIcon }
const hues = { agent: 'bg-indigo-400 dark:bg-indigo-400',llm: 'bg-sky-400 dark:bg-sky-400',embedding: 'bg-violet-400 dark:bg-violet-400',tool: 'bg-teal-400 dark:bg-teal-400' }
function flatten(span: TraceSpan): TraceSpan[] { return [span,...span.children.flatMap(flatten)] }
const rowColumns = 'grid grid-cols-[minmax(0,40%)_minmax(0,1fr)_4.5rem]'

/** Local composition around Langfuse's MIT bar metrics. No external requests. */
export function TraceWaterfall({ trace }: { trace: RunTrace }) {
  const titleId = useId(),detailId = useId()
  const [collapsed,setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [selectedId,setSelectedId] = useState<string|null>(null)
  const [now,setNow] = useState(() => Date.now())
  const rail = useRef<HTMLDivElement>(null)
  const [laneWidth,setLaneWidth] = useState(240)
  const running = trace.root.status === 'running'
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()),100)
    return () => clearInterval(timer)
  },[running,trace.startedAt])
  useEffect(() => {
    if (!rail.current) return
    const element = rail.current
    const observer = new ResizeObserver(() => setLaneWidth(element.clientWidth))
    observer.observe(element)
    setLaneWidth(element.clientWidth)
    return () => observer.disconnect()
  },[])
  const all = useMemo(() => flatten(trace.root),[trace.root])
  const selected = all.find(span => span.id === selectedId)
  const elapsed = running && trace.timingBasis === 'execution' && trace.startedAt !== null ? Math.max(0,now-trace.startedAt) : null
  // Include all descendants even when collapsed; starts can extend beyond the
  // current clock. Axis headroom is display space, never an invented event time.
  const hasTimeline = all.some(span=>span.start !== null && (span.end !== null || span.status === 'running' && elapsed !== null))
  const observedEnd = Math.max(1,elapsed ?? 0,...all.flatMap(span => [span.start ?? 0,span.end ?? 0]))
  const maxEnd = Math.ceil(observedEnd*1.08)
  const slowest = all.filter(span => span.kind !== 'agent' && span.durationMs !== null)
    .reduce<TraceSpan|undefined>((largest,span) => !largest || span.durationMs! > largest.durationMs! ? span : largest,undefined)
  const toggle = (id: string) => setCollapsed(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const row = (span: TraceSpan,depth: number) => {
    const Icon = icons[span.kind],isCollapsed = collapsed.has(span.id)
    const end = span.end ?? (span.status === 'running' ? elapsed : null)
    const known = hasTimeline && span.start !== null && end !== null && end >= span.start
    const x = known ? Math.min(laneWidth,Math.max(0,span.start!/maxEnd*laneWidth)) : 0
    const width = known ? Math.min(laneWidth-x,Math.max(1,(end!-span.start!)/maxEnd*laneWidth)) : 0
    const duration = span.durationMs ?? (known ? end!-span.start! : null)
    return <li key={span.id} data-trace-kind={span.kind} data-trace-status={span.status}>
      <div data-trace-row className={cn(rowColumns,'items-center rounded-sm transition-colors duration-150 motion-reduce:transition-none hover:bg-muted/50',
        selected?.id === span.id && 'bg-muted/70')}>
        <div className="relative flex min-w-0 items-center gap-1 py-2 pe-2" style={{paddingInlineStart: Math.min(depth,6)*12+4}}>
          {Array.from({length: Math.min(depth,6)},(_,level) => <span key={level} aria-hidden="true" className="pointer-events-none absolute inset-y-0 border-s border-border/50" style={{left: level*12+9}} />)}
          {depth > 0 && <span aria-hidden="true" className="pointer-events-none absolute top-1/2 h-px w-2 bg-border/50" style={{left: (Math.min(depth,6)-1)*12+9}} />}
          {span.children.length ? <button type="button" onClick={() => toggle(span.id)} aria-label={`${isCollapsed ? '展开' : '收起'} ${span.name}`} aria-expanded={!isCollapsed}
            className="rounded-sm p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRightIcon className={cn('size-3 transition-transform duration-200 motion-reduce:transition-none',!isCollapsed && 'rotate-90')} />
          </button> : <span className="w-4 shrink-0" />}
          <button type="button" aria-label={`查看 ${span.name} 详情`} aria-controls={detailId} aria-pressed={selected?.id === span.id} onClick={() => setSelectedId(span.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-start outline-none focus-visible:ring-2 focus-visible:ring-ring" title={`${span.name} · ${labels[span.status]} · ${ms(duration)} · ${cost(span)}`}>
            <Icon className="text-muted-foreground size-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate text-xs">{span.name}</span>
            {span.id === slowest?.id && <span data-trace-slowest aria-label="最慢调用" title="最慢调用" className="text-muted-foreground inline-flex h-4 shrink-0 items-center gap-0.5 rounded-sm border border-border/60 bg-muted/50 px-0.5 text-[9px] leading-none">
              <Clock3Icon className="size-2.5" aria-hidden="true" /><span className="hidden sm:inline">最慢</span>
            </span>}
            <span className={cn('size-1.5 shrink-0 rounded-full',span.status === 'error' ? 'bg-destructive' : span.status === 'complete' ? 'bg-emerald-500' : span.status === 'running' ? 'bg-sky-500' : 'bg-muted-foreground/50')} aria-label={labels[span.status]} />
          </button>
        </div>
        <button type="button" onClick={() => setSelectedId(span.id)} aria-label={`${span.name} 时间 ${ms(duration)}，${cost(span)}`}
          data-trace-lane data-trace-start={span.start ?? ''} data-trace-end={end ?? ''}
          data-trace-duration-only={!known ? '' : undefined}
          className="relative h-8 min-w-0 overflow-hidden rounded-sm text-start outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {hasTimeline && <span className="absolute inset-0 border-s border-border/30 bg-[linear-gradient(to_right,transparent_calc(50%-1px),var(--border)_50%,transparent_calc(50%+1px))] opacity-40" aria-hidden="true" />}
          {known ? <span data-trace-bar aria-hidden="true" className={cn('absolute top-1/2 h-2 -translate-y-1/2 cursor-pointer rounded-[2px] transition-[width,left] duration-200 ease-out motion-reduce:transition-none',hues[span.kind],span.status === 'error' && 'bg-destructive',span.status === 'cancelled' && 'opacity-50')}
            style={{left: x,width}} /> : <span className="text-muted-foreground relative ps-2 text-[11px]">—</span>}
        </button>
        <TimelineRowMetrics durationText={ms(duration)} costText={span.cost === null && span.knownCost === undefined ? undefined : cost(span)} />
      </div>
      {span.children.length > 0 && <div className={cn('grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none',isCollapsed ? 'invisible grid-rows-[0fr]' : 'visible grid-rows-[1fr]')} inert={isCollapsed} aria-hidden={isCollapsed}>
        <div className="min-h-0 overflow-hidden"><ol className="m-0 p-0">{span.children.map(child => row(child,depth+1))}</ol></div>
      </div>}
    </li>
  }
  return <section aria-labelledby={titleId} aria-label="运行瀑布图" className="bg-background/70 min-w-0 overflow-hidden rounded-lg border border-border/60 text-foreground" data-slot="trace-waterfall">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
      <h3 id={titleId} className="flex items-center gap-1.5 text-xs font-medium"><GitBranchIcon className="text-muted-foreground size-3.5" aria-hidden="true" />运行瀑布图</h3>
      <span data-trace-clock className="text-muted-foreground font-mono text-[11px] tabular-nums">{labels[trace.root.status]} · {ms(elapsed ?? trace.root.durationMs)}</span>
    </div>
    <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-[11px] tabular-nums">
      <span>输入 {tokens(trace.root.tokensIn)}</span><span>输出 {tokens(trace.root.tokensOut)}</span><span>{cost(trace.root)}</span>
      <span className="ms-auto">{all.length} 个步骤</span>
    </div>
    <div data-trace-viewport className="max-h-80 overflow-y-auto [scrollbar-gutter:stable]">
      <div className={cn(rowColumns,'bg-background text-muted-foreground sticky top-0 z-10 border-y border-border/40 px-2 py-1 text-[10px]')}>
        <span className="ps-1">步骤</span><div ref={rail} data-trace-axis={hasTimeline ? '' : undefined} data-trace-axis-end={hasTimeline ? maxEnd : undefined} className="relative flex min-w-0 justify-between whitespace-nowrap font-mono tabular-nums">{hasTimeline && <><span>0 ms</span><span>{ms(maxEnd)}</span></>}</div>
        <span className="pe-1 text-end">耗时 / 费用</span>
      </div>
      <ol className="m-0 px-2 py-1">{row(trace.root,0)}</ol>
    </div>
    <div id={detailId} className="border-t border-border/50 px-3 py-3 text-xs">
      {selected ? <div className="grid gap-2">
        <div className="flex flex-wrap justify-between gap-1"><h4 className="font-medium">{selected.name}</h4><span className="text-muted-foreground">{kindLabels[selected.kind]} · {labels[selected.status]}</span></div>
        {selected.model && <p className="text-muted-foreground break-all">{selected.model}</p>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground tabular-nums">
          <div><dt className="inline">开始 </dt><dd className="inline">{ms(selected.start)}</dd></div><div><dt className="inline">结束 </dt><dd className="inline">{ms(selected.end)}</dd></div>
          <div><dt className="inline">输入 tokens </dt><dd className="inline">{tokens(selected.tokensIn)}</dd></div><div><dt className="inline">输出 tokens </dt><dd className="inline">{tokens(selected.tokensOut)}</dd></div>
          <div><dt className="inline">耗时 </dt><dd className="inline">{ms(selected.durationMs)}</dd></div><div><dt className="sr-only">费用</dt><dd>{cost(selected)}</dd></div>
        </dl>
        {selected.kind === 'tool' && selected.detail && <p className="text-muted-foreground break-words">{selected.detail}</p>}
        {!!(selected.input?.length || selected.output) && <div className="grid gap-2 pt-1 sm:grid-cols-2">
          {!!selected.input?.length && <div><h5 className="mb-1 font-medium">输入</h5><dl className="grid gap-1">{selected.input.map((field,index) => <div key={index}><dt className="text-muted-foreground">{field.label}</dt><dd className="whitespace-pre-wrap break-words">{field.value}</dd></div>)}</dl></div>}
          {selected.output && <div><h5 className="mb-1 font-medium">结果</h5><p className="text-muted-foreground whitespace-pre-wrap break-words">{selected.output}</p></div>}
        </div>}
      </div> : <p className="text-muted-foreground">选择步骤查看耗时、用量与详情。</p>}
    </div>
    {trace.truncated && <p className="px-3 pb-2 text-[10px] text-muted-foreground">仅显示部分步骤。</p>}
  </section>
}
