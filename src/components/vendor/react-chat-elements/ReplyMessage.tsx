// Adapted directly from Detaysoft/react-chat-elements ReplyMessage (MIT).
// Upstream snapshot, commit and adaptation list: third_party/react-chat-elements/reply-message.
import type { ReactNode } from 'react'
import classNames from 'clsx'

interface ReplyMessageProps {
  title: string
  message: ReactNode
  onClick?: () => void
  label?: string
}

export default function ReplyMessage({ onClick, label, ...props }: ReplyMessageProps) {
  const Root = onClick ? 'button' : 'div'
  return (
    <Root
      className={classNames('lingxi-reply-message', 'rce-mbox-reply', 'rce-mbox-reply-border')}
      type={onClick ? 'button' : undefined}
      aria-label={label}
      data-quote-preview=""
      onClick={onClick}
    >
      <span className="rce-mbox-reply-left">
        <span className="rce-mbox-reply-owner">{props.title || '引用消息'}</span>
        <span className="rce-mbox-reply-message">{props.message || '原消息不可用'}</span>
      </span>
    </Root>
  )
}
