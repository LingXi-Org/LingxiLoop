const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })
const timeFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** 11 月 4 日 周三 21:21 */
export function conversationStartLabel(createdAt: Date) {
  const parts = Object.fromEntries(dateFormat.formatToParts(createdAt).map(part => [part.type, part.value]))
  return `${parts.month} 月 ${parts.day} 日 ${parts.weekday} ${timeFormat.format(createdAt)}`
}

export function ConversationStart({ createdAt, timestampMissing }: { createdAt?: Date; timestampMissing?: boolean }) {
  if (timestampMissing || !createdAt || !Number.isFinite(createdAt.getTime()) || createdAt.getTime() <= 0) return null

  return (
    <div className="flex w-full items-center gap-3 text-xs text-muted-foreground" data-slot="day-separator">
      <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-border" />
      <span className="shrink-0 tabular-nums">
        <span className="sr-only">会话开始于 </span>
        <time dateTime={createdAt.toISOString()}>{conversationStartLabel(createdAt)}</time>
      </span>
      <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-border" />
    </div>
  )
}
