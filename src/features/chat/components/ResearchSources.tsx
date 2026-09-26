import type { RunView } from '@lyyzka/lingxios/ui'
import { Citation } from '@/components/tool-ui/citation'
import { LinkPreview } from '@/components/tool-ui/link-preview'
import type { HarnessToolPart } from '../runtime/model'
import type { ResearchSource } from '@/lib/researchSources'

export function ResearchSources({ calls, lifecycle }: { calls: readonly HarnessToolPart[]; lifecycle: RunView['lifecycle'] }) {
  return <>{calls.filter(call => call.toolName === 'research.search').map(call => {
    const result = call.result as { status?: string; sources?: ResearchSource[] | null } | undefined
    if (!call.isError && result?.status === 'completed' && Array.isArray(result.sources)) {
      if (!result.sources.length) return null
      const source = result.sources[0]!
      return <section key={call.toolCallId} aria-label="联网搜索来源" className="grid min-w-0 gap-2">
        {result.sources.length === 1 ? <LinkPreview id={`${call.toolCallId}:source:0`}
          href={source.url} title={source.title} description={source.snippet} domain={new URL(source.url).hostname.replace(/^www\./, '')}
          image={source.image} locale="zh-CN" className="min-w-0 max-w-none break-words" />
          : result.sources.map((source, index) => <Citation key={source.url} id={`${call.toolCallId}:source:${index}`}
          href={source.url} title={source.title} snippet={source.snippet} locale="zh-CN" type="webpage"
          className="min-w-0 max-w-none break-words" />)}
      </section>
    }
    const label = result !== undefined ? '搜索失败，请稍后重试。'
      : lifecycle === 'cancelled' ? '搜索已取消。'
      : ['queued', 'leased', 'waiting'].includes(lifecycle ?? '') ? '正在搜索国内网络资源…' : '搜索未完成。'
    return <p key={call.toolCallId} role="status" className="text-xs text-muted-foreground">{label}</p>
  })}</>
}
