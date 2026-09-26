"use client"

import { StreamdownTextPrimitive, type StreamdownTextPrimitiveProps } from '@assistant-ui/react-streamdown'
import { useMessagePartText } from '@assistant-ui/react'
import { defaultRehypePlugins } from 'streamdown'
import { createContext, memo, useContext, useEffect, useMemo, useState } from 'react'
import type { Root } from 'hast'
import { visit } from 'unist-util-visit'
import { MessageFooterContents } from './message-footer'
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

const BubbleEntryContext = createContext(false)
const BubbleDiv: NonNullable<StreamdownTextPrimitiveProps['components']>['div'] = ({ node, children, ...props }) => {
  const canAnimate = useContext(BubbleEntryContext)
  // Capture entry only; later tokens and citation metadata must not replay it.
  const [animate] = useState(canAnimate)
  return <div {...props} data-bubble-enter={node?.properties['dataBubble'] && animate ? '' : undefined}>
    {node?.properties['dataLastBubble'] ? <MessageFooterContents inset={false}>{children}</MessageFooterContents> : children}
  </div>
}

const ConfidenceSpan: NonNullable<StreamdownTextPrimitiveProps['components']>['span'] = ({ node, children, ...props }) => {
  const claim = node?.data?.confidenceClaim
  const marker = claim ? <ConfidenceMarkerInline claim={claim}>{children}</ConfidenceMarkerInline> : children
  return claim && node?.properties['data-citation-start'] === undefined ? marker : <span {...props}>{marker}</span>
}
const confidenceComponents = { span: ConfidenceSpan, div: BubbleDiv }

function rehypeConfidence({ claims, segmented, inlineCitations, holdTail, paragraphClosed }: {
  claims: readonly MarkdownConfidenceClaim[]; segmented: boolean; inlineCitations: boolean; holdTail: boolean; paragraphClosed: boolean
}) {
  const byStart = new Map(claims.map(claim => [claim.start, claim]))
  return (tree: Root) => {
    if (segmented && holdTail) {
      const last = [...tree.children].reverse().find(node => node.type === 'element')
      // A blank line closes a paragraph. Lists, tables, quotes and fences may
      // continue after blank lines, so wait for a following block or completion.
      if (last?.type === 'element' && !(last.tagName === 'p' && paragraphClosed)) {
        tree.children = tree.children.slice(0, tree.children.indexOf(last))
      }
    }
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
    if (segmented) {
      tree.children = tree.children.map(node => node.type === 'element'
        ? { type: 'element', tagName: 'div', properties: { className: ['im-markdown-bubble'], dataBubble: true }, children: [node] } : node)
      const lastBubble = [...tree.children].reverse().find(node => node.type === 'element')
      if (lastBubble?.type === 'element') lastBubble.properties.dataLastBubble = true
    }
  }
}

const MarkdownTextImpl = ({
  segmented = false,
  confidenceClaims,
  inlineCitations = false,
  interrupted = false,
  animateEntry = false,
}: {
  segmented?: boolean
  confidenceClaims?: readonly MarkdownConfidenceClaim[]
  inlineCitations?: boolean
  interrupted?: boolean
  animateEntry?: boolean
}) => {
  const { text, status } = useMessagePartText()
  const [hoveredId, setHoveredId] = useState('')
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const wholeDocument = segmented || Boolean(confidenceClaims?.length) || inlineCitations
  const holdTail = status.type === 'running' || interrupted
  const paragraphClosed = /\r?\n[\t ]*\r?\n[\t\r\n ]*$/.test(text)
  const rehypePlugins = useMemo<StreamdownTextPrimitiveProps['rehypePlugins']>(() => {
    if (!wholeDocument) return undefined
    // Streamdown caches processors by plugin name and serialized options, not closure identity.
    return [...Object.values(defaultRehypePlugins), [rehypeConfidence, { claims: confidenceClaims ?? [], segmented, inlineCitations, holdTail, paragraphClosed }]]
  }, [confidenceClaims, segmented, inlineCitations, wholeDocument, holdTail, paragraphClosed])

  const markdown = <div className="im-bubble-markdown-host" data-find-content>
    <StreamdownTextPrimitive
      // Citation rendering and copy actions share original whole-document offsets.
      mode={wholeDocument ? 'static' : 'streaming'}
      smooth={false}
      controls
      rehypePlugins={rehypePlugins}
      components={wholeDocument ? confidenceComponents : undefined}
      className={segmented ? 'im-bubble-markdown im-bubble-markdown-agent' : 'im-bubble-markdown'}
    />
  </div>
  return <BubbleEntryContext.Provider value={animateEntry || mounted}>
    <ConfidenceMarker claims={confidenceClaims ?? []} hoveredId={hoveredId} onHover={setHoveredId}
    floatingBasis={inlineCitations}>
    {markdown}
    </ConfidenceMarker>
  </BubbleEntryContext.Provider>
}

export const MarkdownText = memo(MarkdownTextImpl)
