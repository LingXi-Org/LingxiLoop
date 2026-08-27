"use client"

import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import { memo } from 'react'
import remarkGfm from 'remark-gfm'

const MarkdownTextImpl = () => (
  <MarkdownTextPrimitive
    remarkPlugins={[remarkGfm]}
    className="typeset typeset-chat"
    data-typeset-preset="chat"
    defer
  />
)

export const MarkdownText = memo(MarkdownTextImpl)
