const dateTimeFormat = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function ConversationStart({ createdAt }: { createdAt?: Date }) {
  if (!createdAt || !Number.isFinite(createdAt.getTime())) return null

  return (
    <div className="flex w-full items-center gap-3 text-xs text-muted-foreground" data-slot="day-separator">
      <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-border" />
      <span className="shrink-0">
        <time dateTime={createdAt.toISOString()}>{dateTimeFormat.format(createdAt)}</time>
        {' · 会话开始'}
      </span>
      <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-border" />
    </div>
  )
}
