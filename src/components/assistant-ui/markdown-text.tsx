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

export function confidenceCopyText(text: string, claims: readonly MarkdownConfidenceClaim[] = []): string {
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
  return claim ? <ConfidenceMarkerInline claim={claim}>{children}</ConfidenceMarkerInline> : <span {...props}>{children}</span>
}
const confidenceComponents = { span: ConfidenceSpan }

const MarkdownTextImpl = ({
  segmented = false,
  confidenceClaims,
}: {
  segmented?: boolean
  confidenceClaims?: readonly MarkdownConfidenceClaim[]
}) => {
  const [hoveredId, setHoveredId] = useState('')
  const hasClaims = Boolean(confidenceClaims?.length)
  const rehypePlugins = useMemo<StreamdownTextPrimitiveProps['rehypePlugins']>(() => {
    if (!confidenceClaims?.length) return undefined
    const byStart = new Map(confidenceClaims.map(claim => [claim.start, claim]))
    return [...Object.values(defaultRehypePlugins), () => (tree: Root) => {
      visit(tree, 'element', (node) => {
        const claim = byStart.get(node.position?.start.offset ?? -1)
        if (node.tagName !== 'a' || !claim || node.position?.end.offset !== claim.end
          || node.properties.href !== `#cite-${claim.markers.join(',')}`) return
        // Only parsed, source-backed Markdown links become markers. Raw HTML and code remain untouched.
        node.tagName = 'span'
        node.properties = {}
        node.data = { ...node.data, confidenceClaim: claim }
      })
      if (segmented) tree.children = tree.children.map(node => node.type === 'element'
        ? { type: 'element', tagName: 'div', properties: { className: ['im-markdown-bubble'] }, children: [node] } : node)
    }]
  }, [confidenceClaims, segmented])

  const markdown = <div className="im-bubble-markdown-host" data-find-content>
    <StreamdownTextPrimitive
      // Committed citations use whole-document offsets; drafts retain incremental block rendering.
      mode={hasClaims ? 'static' : 'streaming'}
      smooth={false}
      BlockComponent={segmented && !hasClaims ? BubbleBlock : undefined}
      controls
      rehypePlugins={rehypePlugins}
      components={hasClaims ? confidenceComponents : undefined}
      className={segmented ? 'im-bubble-markdown im-bubble-markdown-agent' : 'im-bubble-markdown'}
    />
  </div>
  return hasClaims ? <ConfidenceMarker claims={confidenceClaims!} hoveredId={hoveredId} onHover={setHoveredId}>
    {markdown}
  </ConfidenceMarker> : markdown
}

export const MarkdownText = memo(MarkdownTextImpl)
