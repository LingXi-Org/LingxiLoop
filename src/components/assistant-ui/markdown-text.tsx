"use client"

import { StreamdownTextPrimitive } from '@assistant-ui/react-streamdown'
import { memo } from 'react'

const MarkdownTextImpl = () => (
  <div className="typeset typeset-chat" data-typeset-preset="chat" data-find-content>
    <StreamdownTextPrimitive
      mode="streaming"
      caret="block"
      controls={false}
      smooth
      defer
    />
  </div>
)

export const MarkdownText = memo(MarkdownTextImpl)
