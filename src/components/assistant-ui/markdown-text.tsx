"use client"

import { StreamdownTextPrimitive, type StreamdownTextPrimitiveProps } from '@assistant-ui/react-streamdown'
import { code } from '@streamdown/code'
import { createMathPlugin } from '@streamdown/math'
import 'katex/dist/katex.min.css'
import { createMermaidPlugin } from '@streamdown/mermaid'
import { Block, type BlockProps, defaultRehypePlugins, parseMarkdownIntoBlocks } from 'streamdown'
import { useAuiState, useMessagePartText } from '@assistant-ui/react'
import { createContext, memo, useContext, useMemo, useState } from 'react'
import type { Root } from 'hast'
import { SKIP, visit } from 'unist-util-visit'
import { rehypeStreamingWords, useStreamingTail } from './streaming-text'
import {
  ConfidenceMarker, ConfidenceMarkerInline,
} from '@/components/assistant-ui/elements/confidence-marker'

import type { MarkdownConfidenceClaim } from '@/lib/agentRunSnapshot'
import type { MentionTarget } from '@/lib/mentions'
import { activityAnnotation } from '@/lib/runActivity'
export type { MarkdownConfidenceClaim } from '@/lib/agentRunSnapshot'

const plugins = { code, math: createMathPlugin({ singleDollarTextMath: true }), mermaid: createMermaidPlugin({ config: { securityLevel: 'strict', startOnLoad: false } }) }
const translations = {
  close: '关闭', copied: '已复制', copyCode: '复制代码', copyLink: '复制链接', copyTable: '复制表格',
  copyTableAsCsv: '复制为 CSV', copyTableAsMarkdown: '复制为 Markdown', copyTableAsTsv: '复制为 TSV',
  downloadDiagram: '下载图表', downloadDiagramAsMmd: '下载图表源文件', downloadDiagramAsPng: '下载 PNG 图片', downloadDiagramAsSvg: '下载 SVG 图片',
  downloadFile: '下载文件', downloadImage: '下载图片', downloadTable: '下载表格', downloadTableAsCsv: '下载 CSV 表格', downloadTableAsMarkdown: '下载 Markdown 表格',
  exitFullscreen: '退出全屏', externalLinkWarning: '即将打开外部网站，请确认链接。', imageNotAvailable: '图片暂时无法显示',
  mermaidFormatMmd: '图表源文件', mermaidFormatPng: 'PNG 图片', mermaidFormatSvg: 'SVG 图片', openExternalLink: '打开外部链接', openLink: '打开链接',
  resetView: '重置视图', tableFormatCsv: 'CSV 表格', tableFormatMarkdown: 'Markdown 表格', tableFormatTsv: 'TSV 表格',
  viewFullscreen: '全屏查看', zoomIn: '放大', zoomOut: '缩小',
}
const mermaidOptions = { config: { securityLevel: 'strict', startOnLoad: false }, errorComponent: ({ chart }: { chart: string }) => <div>
  <p role="status">图表暂时无法显示。</p><details><summary>查看图表源代码</summary><pre className="overflow-auto">{chart}</pre></details>
</div> }

declare module 'hast' {
  interface ElementData { confidenceClaim?: MarkdownConfidenceClaim }
}

export function confidenceCopyText(text: string, claims: readonly Pick<MarkdownConfidenceClaim, 'start' | 'end' | 'text'>[] = []): string {
  let offset = 0
  let result = ''
  for (const claim of claims) {
    result += text.slice(offset, claim.start) + claim.text
    offset = claim.end
  }
  return result + text.slice(offset)
}

const ConfidenceSpan: NonNullable<StreamdownTextPrimitiveProps['components']>['span'] = ({ node, children, ...props }) => {
  const claim = node?.data?.confidenceClaim
  const marker = claim ? <ConfidenceMarkerInline claim={claim}>{children}</ConfidenceMarkerInline> : children
  return claim && node?.properties['data-citation-start'] === undefined ? marker : <span {...props}>{marker}</span>
}
const confidenceComponents = { span: ConfidenceSpan }

function rehypeMentionNames({ targets }: { targets: readonly MentionTarget[] }) {
  const names = new Map(targets.map(target => [target.id, target.name]))
  names.set('all', '所有人')
  return (tree: Root) => {
    visit(tree, node => {
      if (node.type === 'element' && ['a', 'code', 'pre'].includes(node.tagName)) return SKIP
      if (node.type !== 'text') return
      node.value = node.value.replace(/(^|[^A-Za-z0-9_@])@([\p{L}\p{N}_-]+)(?![\p{L}\p{N}_-]|\.[\p{L}\p{N}])/gu,
        (match, prefix: string, id: string) => names.has(id) ? `${prefix}@${names.get(id)}` : match)
    })
  }
}

function rehypeConfidence({ claims, offset, inlineCitations }: {
  claims: readonly MarkdownConfidenceClaim[]; offset: number; inlineCitations: boolean
}) {
  const byStart = new Map(claims.map(claim => [claim.start, claim]))
  return (tree: Root) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'a') return
      const href = node.properties.href
      const start = offset + (node.position?.start.offset ?? -1)
      const end = offset + (node.position?.end.offset ?? -1)
      const claim = byStart.get(start)
      const matched = claim && end === claim.end && (inlineCitations
        ? typeof href === 'string' && href.startsWith('#cite-') && [...new Set(href.slice('#cite-'.length).split(','))].join(',') === claim.markers.join(',')
        : href === `#cite-${claim.markers.join(',')}`)
      if (!matched && !(inlineCitations && typeof href === 'string' && href.startsWith('#cite-'))) return
      // Internal links never reach Link's navigation handler. Only committed matches become markers.
      node.tagName = 'span'
      node.properties = inlineCitations ? {
        'data-citation-start': start,
        'data-citation-end': end,
      } : {}
      if (matched) node.data = { ...node.data, confidenceClaim: claim }
      else {
        let label = ''
        visit(node, 'text', child => { label += child.value })
        if (/^[\s【】[\](),，S\d]+$/.test(label)) {
          node.children = []
          node.properties['data-citation-hidden'] = true
        }
      }
    })
  }
}

const CitationBlocks = createContext<{
  offsets: number[]; claims: readonly MarkdownConfidenceClaim[]; inlineCitations: boolean; agent: boolean; mentionTargets: readonly MentionTarget[]
}>({ offsets: [], claims: [], inlineCitations: false, agent: false, mentionTargets: [] })

function CitationBlock(props: BlockProps) {
  const { offsets, claims, inlineCitations, agent, mentionTargets } = useContext(CitationBlocks)
  const offset = offsets[props.index]
  const rehypePlugins = useMemo<StreamdownTextPrimitiveProps['rehypePlugins']>(() => [
    ...Object.values(defaultRehypePlugins), [rehypeConfidence, { claims, offset, inlineCitations }],
    [rehypeMentionNames, { targets: mentionTargets }],
    ...agent ? [rehypeStreamingWords] : [],
  ], [claims, offset, inlineCitations, agent, mentionTargets])
  return <Block {...props} rehypePlugins={[...rehypePlugins ?? [], plugins.math.rehypePlugin]} />
}

const MarkdownTextImpl = ({
  agent = false,
  confidenceClaims = [],
  inlineCitations = false,
  mentionTargets = [],
}: {
  agent?: boolean
  confidenceClaims?: readonly MarkdownConfidenceClaim[]
  inlineCitations?: boolean
  mentionTargets?: readonly MentionTarget[]
}) => {
  const [hoveredId, setHoveredId] = useState('')
  const { text, status } = useMessagePartText()
  // Citation spans use nativeText's joined-message coordinates, including between cards.
  const textOffset = useAuiState(state => state.message.parts.slice(0, state.message.parts.indexOf(state.part))
    .reduce((offset, part) => offset + (part.type === 'text' && activityAnnotation(part)?.kind !== 'commentary' ? part.text.length + 1 : 0), 0))
  const streaming = agent && status.type === 'running'
  const streamingRef = useStreamingTail(text, streaming)
  const hasCitations = Boolean(confidenceClaims.length) || inlineCitations
  // Use Streamdown's own blocks; only restore document coordinates for citations.
  const blocks = useMemo(() => hasCitations ? parseMarkdownIntoBlocks(text) : [], [hasCitations, text])
  const parseBlocks = useMemo(() => () => blocks, [blocks])
  const offsets = useMemo(() => {
    let offset = textOffset
    return blocks.map(block => { const start = offset; offset += block.length; return start })
  }, [blocks, textOffset])
  const citationBlocks = useMemo(() => ({ offsets, claims: confidenceClaims, inlineCitations, agent, mentionTargets }), [offsets, confidenceClaims, inlineCitations, agent, mentionTargets])
  const rehypePlugins = useMemo<StreamdownTextPrimitiveProps['rehypePlugins']>(() => [
    ...Object.values(defaultRehypePlugins), ...agent ? [rehypeStreamingWords] : [],
    [rehypeMentionNames, { targets: mentionTargets }],
  ], [agent, mentionTargets])
  return <ConfidenceMarker claims={confidenceClaims} hoveredId={hoveredId} onHover={setHoveredId} floatingBasis={inlineCitations}>
    <CitationBlocks.Provider value={citationBlocks}>
      <div ref={streamingRef} className="im-markdown-host" data-find-content data-streaming={streaming || undefined}>
        <StreamdownTextPrimitive
          plugins={plugins}
          translations={translations}
          mermaid={mermaidOptions}
          rehypePlugins={rehypePlugins}
          controls
          parseIncompleteMarkdown
          {...hasCitations ? { parseMarkdownIntoBlocksFn: parseBlocks, BlockComponent: CitationBlock, components: confidenceComponents } : {}}
          className={`im-markdown${agent ? ' im-markdown-agent' : ''}`}
        />
      </div>
    </CitationBlocks.Provider>
  </ConfidenceMarker>
}

export const MarkdownText = memo(MarkdownTextImpl)
