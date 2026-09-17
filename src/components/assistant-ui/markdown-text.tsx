"use client"

import { StreamdownTextPrimitive, type StreamdownTextPrimitiveProps } from '@assistant-ui/react-streamdown'
import { Block, defaultRehypePlugins, type BlockProps } from 'streamdown'
import { memo, useMemo, useState } from 'react'
import type { Root } from 'hast'
import { visit } from 'unist-util-visit'
import {
  type ConfidenceClaim, ConfidenceMarker, ConfidenceMarkerInline,
} from '@/components/assistant-ui/elements/confidence-marker'

export type MarkdownConfidenceClaim = ConfidenceClaim & { markers: readonly string[]; start: number; end: number }

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

const BubbleBlock = memo((props: BlockProps) => props.content.trim() ? (
  <div className="im-markdown-bubble"><Block {...props} /></div>
) : null)

const ConfidenceSpan: NonNullable<StreamdownTextPrimitiveProps['components']>['span'] = ({ node, children, ...props }) => {
  const claim = node?.data?.confidenceClaim
  const marker = claim ? <ConfidenceMarkerInline claim={claim}>{children}</ConfidenceMarkerInline> : children
  return claim && node?.properties['data-citation-start'] === undefined ? marker : <span {...props}>{marker}</span>
}
const confidenceComponents = { span: ConfidenceSpan }

function rehypeConfidence({ claims, segmented, inlineCitations }: {
  claims: readonly MarkdownConfidenceClaim[]; segmented: boolean; inlineCitations: boolean
}) {
  const byStart = new Map(claims.map(claim => [claim.start, claim]))
  return (tree: Root) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'a') return
      const href = node.properties.href
      const claim = byStart.get(node.position?.start.offset ?? -1)
      const matched = claim && node.position?.end.offset === claim.end && (inlineCitations
        ? typeof href === 'string' && href.startsWith('#cite-') && [...new Set(href.slice('#cite-'.length).split(','))].join(',') === claim.markers.join(',')
        : href === `#cite-${claim.markers.join(',')}`)
      if (!matched && !(inlineCitations && typeof href === 'string' && href.startsWith('#cite-'))) return
      // Internal links never reach Link's navigation handler. Only committed matches become markers.
      node.tagName = 'span'
      node.properties = inlineCitations ? {
        'data-citation-start': node.position?.start.offset,
        'data-citation-end': node.position?.end.offset,
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
    if (segmented) tree.children = tree.children.map(node => node.type === 'element'
      ? { type: 'element', tagName: 'div', properties: { className: ['im-markdown-bubble'] }, children: [node] } : node)
  }
}

const MarkdownTextImpl = ({
  segmented = false,
  confidenceClaims,
  inlineCitations = false,
}: {
  segmented?: boolean
  confidenceClaims?: readonly MarkdownConfidenceClaim[]
  inlineCitations?: boolean
}) => {
  const [hoveredId, setHoveredId] = useState('')
  const hasClaims = Boolean(confidenceClaims?.length)
  const wholeDocument = hasClaims || inlineCitations
  const rehypePlugins = useMemo<StreamdownTextPrimitiveProps['rehypePlugins']>(() => {
    if (!confidenceClaims?.length && !inlineCitations) return undefined
    // Streamdown caches processors by plugin name and serialized options, not closure identity.
    return [...Object.values(defaultRehypePlugins), [rehypeConfidence, { claims: confidenceClaims ?? [], segmented, inlineCitations }]]
  }, [confidenceClaims, segmented, inlineCitations])

  const markdown = <div className="im-bubble-markdown-host" data-find-content>
    <StreamdownTextPrimitive
      // Citation rendering and copy actions share original whole-document offsets.
      mode={wholeDocument ? 'static' : 'streaming'}
      smooth={false}
      BlockComponent={segmented && !wholeDocument ? BubbleBlock : undefined}
      controls
      rehypePlugins={rehypePlugins}
      components={wholeDocument ? confidenceComponents : undefined}
      className={segmented ? 'im-bubble-markdown im-bubble-markdown-agent' : 'im-bubble-markdown'}
    />
  </div>
  return hasClaims ? <ConfidenceMarker claims={confidenceClaims!} hoveredId={hoveredId} onHover={setHoveredId}
    floatingBasis={inlineCitations}>
    {markdown}
  </ConfidenceMarker> : markdown
}

export const MarkdownText = memo(MarkdownTextImpl)
