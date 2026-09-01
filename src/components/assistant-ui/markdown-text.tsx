"use client"

import { useAuiState } from '@assistant-ui/react'
import { type StreamdownTextComponents, StreamdownTextPrimitive } from '@assistant-ui/react-streamdown'
import { memo, type ReactNode, useMemo, useState } from 'react'
import { type ConfidenceClaim, ConfidenceMarker } from '@/components/confidence-marker'
import type { KnowledgeCitation } from '@/features/knowledge/contracts'
import { useKnowledgeSources } from '@/features/knowledge/state'

const CITATION_LINK = /^#cite-(S\d+(?:,S\d+)*)$/

interface EvidenceClaim extends ConfidenceClaim, KnowledgeCitation {}

function readClaims(value: unknown): EvidenceClaim[] {
  if (value === undefined) return []
  if (!value || typeof value !== 'object' || !Array.isArray((value as { claims?: unknown }).claims)) {
    throw new Error('cite_claims result must contain a claims array')
  }
  const seen = new Set<string>()
  return (value as { claims: unknown[] }).claims.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('cite_claims contains an invalid claim')
    const claim = item as Record<string, unknown>
    if (
      typeof claim.id !== 'string'
      || !/^S\d+$/.test(claim.id)
      || seen.has(claim.id)
      || claim.text !== ''
      || claim.confidence !== 'grounded'
      || typeof claim.basis !== 'string'
      || !claim.basis.trim()
      || typeof claim.sourceId !== 'string'
      || !claim.sourceId.trim()
      || typeof claim.sourceTitle !== 'string'
      || !claim.sourceTitle.trim()
      || typeof claim.excerpt !== 'string'
      || !claim.excerpt.trim()
      || claim.basis !== `${claim.sourceTitle} · ${claim.excerpt}`
      || (claim.sourceUrl !== undefined && typeof claim.sourceUrl !== 'string')
      || typeof claim.position !== 'number'
      || !Number.isSafeInteger(claim.position)
      || claim.position < 0
    ) throw new Error('cite_claims contains an invalid grounded evidence claim')
    seen.add(claim.id)
    return {
      id: claim.id,
      text: '',
      basis: claim.basis,
      confidence: 'grounded',
      sourceId: claim.sourceId,
      sourceTitle: claim.sourceTitle,
      excerpt: claim.excerpt,
      ...(claim.sourceUrl ? { sourceUrl: claim.sourceUrl } : {}),
      position: claim.position,
      marker: claim.id,
    }
  })
}

function useConfidenceClaims(): EvidenceClaim[] {
  const result = useAuiState((state) => {
    if (state.message.role !== 'assistant') return undefined
    const part = state.message.content.find((value): value is Extract<typeof value, { type: 'tool-call' }> => (
      value.type === 'tool-call' && value.toolName === 'cite_claims'
    ))
    return part?.result
  })
  return useMemo(() => readClaims(result), [result])
}

function CitationLink(rawProps: object) {
  const props = rawProps as Record<string, unknown>
  const properties = (props.node as { properties?: Record<string, unknown> } | undefined)?.properties
  const href = typeof properties?.href === 'string' ? properties.href : undefined
  const title = typeof properties?.title === 'string' ? properties.title : undefined
  const children = props.children as ReactNode
  const claims = useConfidenceClaims()
  const isAssistant = useAuiState((state) => state.message.role === 'assistant')
  const openCitation = useKnowledgeSources((state) => state.openCitation)
  const [hoveredId, setHoveredId] = useState('')
  if (!isAssistant || !href?.startsWith('#cite-')) return <a href={href} title={title}>{children}</a>
  const match = CITATION_LINK.exec(href)
  if (!match) throw new Error(`Invalid confidence citation link: ${href}`)
  const ids = match[1]!.split(',')
  const byId = new Map(claims.map((claim) => [claim.id, claim]))
  const evidence = ids.map((id) => {
    const claim = byId.get(id)
    if (!claim) throw new Error(`Confidence citation ${id} has no cite_claims result`)
    return claim
  })
  const claim: ConfidenceClaim = {
    id: ids.join(','),
    text: '',
    confidence: 'grounded',
    basis: evidence.map(({ sourceTitle, excerpt }) => `${sourceTitle}\n${excerpt}`).join('\n\n'),
  }
  return <ConfidenceMarker
    variant="inline"
    claims={[claim]}
    hoveredId={hoveredId}
    onHover={setHoveredId}
    onActivate={() => void openCitation(evidence[0]!)}
  >{children}</ConfidenceMarker>
}

const components: StreamdownTextComponents = { a: CitationLink }

const MarkdownTextImpl = ({ segmented = false }: { segmented?: boolean; text?: string }) => (
  <div className="im-bubble-markdown-host" data-find-content>
    <StreamdownTextPrimitive
      mode="streaming"
      controls
      animated
      components={components}
      className={segmented ? 'im-bubble-markdown im-bubble-markdown-agent' : 'im-bubble-markdown'}
    />
  </div>
)

export const MarkdownText = memo(MarkdownTextImpl)
