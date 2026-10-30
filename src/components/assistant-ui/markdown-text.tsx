"use client"

import { TextOffsetContext } from '@/features/chat/visualize/TextOffsetContext'

import { StreamdownTextPrimitive, type StreamdownTextPrimitiveProps } from '@assistant-ui/react-streamdown'
import { code } from '@streamdown/code'
import { createMathPlugin } from '@streamdown/math'
import { createMermaidPlugin } from '@streamdown/mermaid'
import { Block, type BlockProps, StreamdownContext, defaultRehypePlugins, parseMarkdownIntoBlocks } from 'streamdown'
import { useAuiState, useMessagePartText } from '@assistant-ui/react'
import { createContext, memo, useContext, useMemo, useState, useSyncExternalStore } from 'react'
import type { Root, ElementContent } from 'hast'
import { SKIP, visit } from 'unist-util-visit'
import {
  ConfidenceMarker, ConfidenceMarkerInline,
} from '@/components/assistant-ui/elements/confidence-marker'

import { StreamingLeaf, createStreamingWordTokenizer, rehypeStreamingText } from './markdown-streaming'
import { StreamingBlock, StreamingPart, useStreamingBlock } from './streaming-tail'

import type { MarkdownConfidenceClaim } from '@/lib/agentRunSnapshot'
import { activityAnnotation } from '@/lib/runActivity'
import { answerTextOffset } from '@/lib/answerSegment'
import { scanVisibleMentions, standaloneVisibleMention, isMemberIdColumn, isExplicitMemberIdColumn, memberIdTarget } from '@/lib/mentions'
import { participantDisplayName } from '@/lib/participantDisplayName'
import type { Participant } from '@/types'
import { MentionBadge } from '@/components/MentionBadge'
import { EVERYONE_BLOUB_PARTICIPANT } from '@/lib/agentVisualState'
export type { MarkdownConfidenceClaim } from '@/lib/agentRunSnapshot'

const plugins = { code, math: createMathPlugin({ singleDollarTextMath: true }), mermaid: createMermaidPlugin({ config: { securityLevel: 'strict', startOnLoad: false } }) }
const smooth = { minCommitMs: 32 }
const motionQuery = '(prefers-reduced-motion: reduce)'
const readReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.(motionQuery).matches
const serverReducedMotion = () => false
function subscribeReducedMotion(notify: () => void) {
  const media = window.matchMedia?.(motionQuery)
  media?.addEventListener('change', notify)
  return () => media?.removeEventListener('change', notify)
}
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
  interface ElementData { confidenceClaim?: MarkdownConfidenceClaim; mentionId?: string }
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

const MentionTargets = createContext<readonly Participant[]>([])

const ConfidenceSpan: NonNullable<StreamdownTextPrimitiveProps['components']>['span'] = ({ node, children, ...props }) => {
  const targets = useContext(MentionTargets)
  if (node?.data?.streamingText) return <StreamingLeaf node={node} />
  const id = node?.data?.mentionId
  const target = id === 'all' ? EVERYONE_BLOUB_PARTICIPANT : targets.find(target => target.id === id)
  if (id && target) return <MentionBadge participant={target} id={id} />
  const claim = node?.data?.confidenceClaim
  const marker = claim ? <ConfidenceMarkerInline claim={claim}>{children}</ConfidenceMarkerInline> : children
  if (String(props.className ?? '').split(' ').includes('katex-display')) {
    return <span {...props} tabIndex={0} role="region" aria-label="数学公式">{children}</span>
  }
  return claim && node?.properties['data-citation-start'] === undefined ? marker : <span {...props}>{marker}</span>
}
const confidenceComponents = { span: ConfidenceSpan }
const emptyClaims: readonly MarkdownConfidenceClaim[] = []
const emptyMentionTargets: readonly Participant[] = []
const emptyCitationOffsets: number[] = []

function rehypeMentionNames({ targets }: { targets: readonly Participant[] }) {
  return (tree: Root) => {
    // Model/history member-ID columns use the same display contract as mentions.
    // Streamdown's official table copy/download controls read these DOM cells.
    visit(tree,'element',node=>{
      if (node.tagName !== 'table') return
      const rows: Extract<ElementContent,{type:'element'}>[] = []
      visit(node,'element',child=>{if(child.tagName==='tr') rows.push(child)})
      const cells = (row: (typeof rows)[number]) => row.children.filter((child):child is Extract<ElementContent,{type:'element'}>=>child.type==='element' && ['th','td'].includes(child.tagName))
      const text = (cell: (typeof rows)[number]) => cell.children.length === 1 && cell.children[0].type === 'text' ? cell.children[0].value : ''
      for(const [column,header] of (rows[0] ? cells(rows[0]) : []).entries()) {
        if (!isMemberIdColumn(text(header)) || !isExplicitMemberIdColumn(text(header)) && !rows.slice(1).some(row=>{const cell=cells(row)[column];return cell && memberIdTarget(text(cell),targets)})) continue
        header.children=[{type:'text',value:'成员'}]
        for(const row of rows.slice(1)) {
          const cell=cells(row)[column], target=cell && memberIdTarget(text(cell),targets)
          if(target || cell && /^[a-z0-9_-]+$/i.test(text(cell))) cell.children=[{type:'text',value:'@'+(target?participantDisplayName(target):'未识别成员')}]
        }
      }
    })
    visit(tree, (node, index, parent) => {
      if (node.type === 'element' && node.tagName === 'code'
        && node.position?.start.line === node.position?.end.line
        && node.children.length === 1 && node.children[0].type === 'text') {
        const mention = standaloneVisibleMention(node.children[0].value, targets)
        if (mention) {
          node.tagName = 'span'
          node.data = { ...node.data, mentionId: mention.id }
          node.children = [{type:'text',value:'@'+mention.label}]
          return SKIP
        }
      }
      if (node.type === 'element' && ['code', 'pre'].includes(node.tagName)) return SKIP
      if (node.type !== 'text' || !parent || index === undefined) return
      const mentions = scanVisibleMentions(node.value, targets, true)
      if (!mentions.length) return
      const parts: ElementContent[] = []
      let cursor = 0
      for (const mention of mentions) {
        if (mention.start > cursor) parts.push({ type: 'text', value: node.value.slice(cursor, mention.start) })
        parts.push({ type: 'element', tagName: 'span', properties: mention.id ? {} : {'aria-label':'未识别的成员提及'}, data: { mentionId: mention.id },
          children: [{ type: 'text', value: '@'+mention.label }] })
        cursor = mention.end
      }
      if (cursor < node.value.length) parts.push({ type: 'text', value: node.value.slice(cursor) })
      parent.children.splice(index, 1, ...parts)
      return index + parts.length
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
  offsets: number[]; claims: readonly MarkdownConfidenceClaim[]; inlineCitations: boolean; mentionTargets: readonly Participant[]; agent: boolean; animate: boolean
}>({ offsets: [], claims: [], inlineCitations: false, mentionTargets: [], agent: false, animate: false })

function CitationBlock(props: BlockProps) {
  const { offsets, ...context } = useContext(CitationBlocks)
  return <CitedBlock {...props} {...context} offset={offsets[props.index]} />
}

// New tail offsets must not reparse every already completed citation block.
const CitedBlock = memo(function CitedBlock({ offset, claims, inlineCitations, mentionTargets, agent, animate, ...props }: BlockProps & {
  offset: number; claims: readonly MarkdownConfidenceClaim[]; inlineCitations: boolean; mentionTargets: readonly Participant[]; agent: boolean; animate: boolean
}) {
  const { isAnimating } = useContext(StreamdownContext)
  const [initialContent] = useState(props.content)
  const [tokenize] = useState(createStreamingWordTokenizer)
  const [decorated, setDecorated] = useState(agent && isAnimating)
  if (!decorated && agent && isAnimating && props.content !== initialContent) setDecorated(true)
  const streamingBlock = useStreamingBlock(props.index, agent && isAnimating, decorated && animate)
  const rehypePlugins = useMemo<StreamdownTextPrimitiveProps['rehypePlugins']>(() => [
    ...(props.rehypePlugins ?? Object.values(defaultRehypePlugins)), [rehypeConfidence, { claims, offset, inlineCitations }],
    [rehypeMentionNames, { targets: mentionTargets }],
    ...decorated ? [[rehypeStreamingText, { tokenize }]] satisfies NonNullable<StreamdownTextPrimitiveProps['rehypePlugins']> : [],
  ], [props.rehypePlugins, claims, offset, inlineCitations, mentionTargets, agent, decorated, tokenize])
  return <StreamingBlock.Provider value={streamingBlock}><Block {...props} rehypePlugins={rehypePlugins} /></StreamingBlock.Provider>
})

const MarkdownTextImpl = ({
  agent = false,
  confidenceClaims = emptyClaims,
  inlineCitations = false,
  mentionTargets = emptyMentionTargets,
}: {
  agent?: boolean
  confidenceClaims?: readonly MarkdownConfidenceClaim[]
  inlineCitations?: boolean
  mentionTargets?: readonly Participant[]
}) => {
  const [hoveredId, setHoveredId] = useState('')
  const part = useMessagePartText()
  const { text } = part
  // Assistant-ui may reuse a message slot across thread switches. Give its
  // smooth queue and our Markdown leaf lifetime the actual text-part identity.
  const partKey = useAuiState(state => JSON.stringify([state.message.id,
    activityAnnotation(state.part)?.id ?? state.message.parts.indexOf(state.part)]))
  // Terminal messages expose all received text immediately. The independent
  // StreamingText color exit can finish without keeping a text reveal queue.
  const messageSettled = useAuiState(state => state.message.status?.type === 'complete' || state.message.status?.type === 'incomplete')
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverReducedMotion)
  const [motionLifetime, setMotionLifetime] = useState({ partKey, settled: reducedMotion })
  // Once this part has displayed its full text under reduced motion, never
  // resume its SDK queue's older prefix. A new part starts a fresh lifetime.
  const motionSettled = reducedMotion || motionLifetime.partKey === partKey && motionLifetime.settled
  if (motionLifetime.partKey !== partKey || reducedMotion && !motionLifetime.settled) {
    setMotionLifetime({ partKey, settled: reducedMotion })
  }
  // Citation spans use nativeText's joined-message coordinates, including between cards.
  const splitTextOffset = useContext(TextOffsetContext)
  const nativeTextOffset = useAuiState(state => answerTextOffset(state.message.parts,state.message.parts.indexOf(state.part)))
  const textOffset = splitTextOffset ?? nativeTextOffset
  const hasCitations = Boolean(confidenceClaims.length) || inlineCitations && text.includes('#cite-')
  // Complete block starts are identical in the raw text and its revealed prefix.
  const blocks = useMemo(() => hasCitations ? parseMarkdownIntoBlocks(text) : undefined, [hasCitations, text])
  const offsets = useMemo(() => {
    // Plain prose appends must keep the block context stable; no citation
    // consumer uses source offsets until this part actually has citations.
    if (!blocks?.length) return emptyCitationOffsets
    let offset = textOffset
    return blocks.map(block => { const start = offset; offset += block.length; return start })
  }, [blocks, textOffset])
  const citationBlocks = useMemo(() => ({ offsets, claims: confidenceClaims, inlineCitations, mentionTargets, agent, animate: !motionSettled }), [offsets, confidenceClaims, inlineCitations, mentionTargets, agent, motionSettled])
  const rehypePlugins = useMemo<StreamdownTextPrimitiveProps['rehypePlugins']>(() => [
    ...Object.values(defaultRehypePlugins),
    [rehypeMentionNames, { targets: mentionTargets }],
  ], [mentionTargets, agent])
  return <ConfidenceMarker claims={confidenceClaims} hoveredId={hoveredId} onHover={setHoveredId} floatingBasis={inlineCitations}>
    <MentionTargets.Provider value={mentionTargets}><CitationBlocks.Provider value={citationBlocks}>
      <div data-find-content>
        <StreamingPart key={partKey} offset={textOffset}>
        <StreamdownTextPrimitive
          key={partKey}
          smooth={agent && typeof window !== 'undefined' && !motionSettled && !messageSettled && part.status.type !== 'incomplete' ? smooth : false}
          animated={false}
          containerClassName="im-markdown-host"
          plugins={plugins}
          translations={translations}
          mermaid={mermaidOptions}
          rehypePlugins={rehypePlugins}
          components={confidenceComponents}
          controls
          parseIncompleteMarkdown
          {...hasCitations || agent ? { BlockComponent: CitationBlock } : {}}
          className={`im-markdown${agent ? ' im-markdown-agent' : ''}`}
        />
        </StreamingPart>
      </div>
    </CitationBlocks.Provider></MentionTargets.Provider>
  </ConfidenceMarker>
}

export const MarkdownText = memo(MarkdownTextImpl)
