import { WebSearch } from '@/components/assistant-ui/elements/web-search'
import { toolDisplaySchema } from '@/lib/runActivity'
import type { RunView } from '@lyyzka/lingxios/ui'
import { Citation } from '@/components/tool-ui/citation'
import { LinkPreview } from '@/components/tool-ui/link-preview'
import type { HarnessToolPart } from '../runtime/model'
import type { ResearchSource } from '@/lib/researchSources'

function sourceLocation(source: ResearchSource) {
  return [source.sourceVersion ? `版本 ${source.sourceVersion}` : undefined,
    source.page ? `第 ${source.page} 页` : source.pageNumbers?.length ? `第 ${source.pageNumbers.join('、')} 页` : undefined]
    .filter(Boolean).join(' · ')
}

export function ResearchSources({ calls, lifecycle }: { calls: readonly HarnessToolPart[]; lifecycle: RunView['lifecycle'] }) {
  return <>{calls.filter(call => call.toolName === 'research.search').map(call => {
    const fields = toolDisplaySchema.shape.input.safeParse(call.args.fields)
    const query = fields.success ? fields.data?.find(field => field.label === '查找内容')?.value : undefined
    const result = call.result as { status?: string; sources?: ResearchSource[] | null } | undefined
    if (!call.isError && result?.status === 'completed' && Array.isArray(result.sources)) {
      if (!result.sources.length) return null
      const source = result.sources[0]!
      return <section key={call.toolCallId} aria-label="联网搜索来源" className="grid min-w-0 gap-2">
        <WebSearch query={query ?? '公开资料'} results={result.sources.map(source => ({ title: source.title, domain: new URL(source.url).hostname, url: source.url }))} visibleResults={0} summaryOnly searching={false} cycle={0} />
        {result.sources.length === 1 ? <div className="grid min-w-0 gap-1"><LinkPreview id={`${call.toolCallId}:source:0`}
          href={source.url} title={source.title} description={source.snippet} domain={new URL(source.url).hostname.replace(/^www\./, '')}
          image={source.image} locale="zh-CN" className="min-w-0 max-w-none break-words" />
          {sourceLocation(source) && <p className="text-xs text-muted-foreground">{sourceLocation(source)}</p>}</div>
          : result.sources.map((source, index) => <div key={`${call.toolCallId}:source:${index}`} className="grid min-w-0 gap-1"><Citation id={`${call.toolCallId}:source:${index}`}
          href={source.url} title={source.title} snippet={source.snippet} locale="zh-CN" type="webpage"
          className="min-w-0 max-w-none break-words" />
          {sourceLocation(source) && <p className="text-xs text-muted-foreground">{sourceLocation(source)}</p>}</div>)}
      </section>
    }
    if (!result && ['queued', 'leased'].includes(lifecycle ?? '')) return <WebSearch key={call.toolCallId} query={query ?? '公开资料'} results={[]} visibleResults={0} searching cycle={0} />
    const label = result?.status === 'unknown' ? '搜索结果待核对。'
      : result?.status === 'cancelled' || lifecycle === 'cancelled' ? '搜索已取消。'
      : result !== undefined ? '搜索失败，请稍后重试。'
      : ['queued', 'leased', 'waiting'].includes(lifecycle ?? '') ? '正在搜索国内网络资源…' : '搜索未完成。'
    return <p key={call.toolCallId} role="status" className="text-xs text-muted-foreground">{label}</p>
  })}</>
}
