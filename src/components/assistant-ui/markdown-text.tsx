"use client"

import { StreamdownTextPrimitive, type StreamdownTextPrimitiveProps } from '@assistant-ui/react-streamdown'
import { memo, type ComponentProps, useMemo } from 'react'
import {
  type ConfidenceClaim,
  ConfidenceMarkerInline,
} from '@/components/assistant-ui/elements/confidence-marker'

export type MarkdownConfidenceClaim = ConfidenceClaim & { markers: readonly string[] }

const MarkdownTextImpl = ({
  segmented = false,
  confidenceClaims,
}: {
  segmented?: boolean
  confidenceClaims?: readonly MarkdownConfidenceClaim[]
}) => {
  const components = useMemo<StreamdownTextPrimitiveProps['components']>(() => {
    if (!confidenceClaims) return undefined
    return {
      a: ({ href, children }: ComponentProps<'a'>) => {
        const claim = confidenceClaims.find((item) => href === `#cite-${item.markers.join(',')}`)
        if (!claim) throw new Error('置信标记与 Markdown 引用不一致')
        return <ConfidenceMarkerInline claim={claim}>{children}</ConfidenceMarkerInline>
      },
    }
  }, [confidenceClaims])

  return <div className="im-bubble-markdown-host" data-find-content>
    <StreamdownTextPrimitive
      mode="streaming"
      controls
      components={components}
      className={segmented ? 'im-bubble-markdown im-bubble-markdown-agent' : 'im-bubble-markdown'}
    />
  </div>
}

export const MarkdownText = memo(MarkdownTextImpl)
