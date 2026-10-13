"use client"

import { StreamdownTextPrimitive, type StreamdownTextPrimitiveProps } from '@assistant-ui/react-streamdown'
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
export type { MarkdownConfidenceClaim } from '@/lib/agentRunSnapshot'

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
  return <Block {...props} rehypePlugins={rehypePlugins} />
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
    .reduce((offset, part) => offset + (part.type === 'text' ? part.text.length + 1 : 0), 0))
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
