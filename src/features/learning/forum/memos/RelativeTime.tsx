// Adapted from Memos RelativeTime at 8120a6c (MIT); language and tooltip use the host.
import '@github/relative-time-element'
import { createElement } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export default function RelativeTime({ date }: { date: Date }) {
  return <Tooltip><TooltipTrigger asChild><time dateTime={date.toISOString()} tabIndex={0} className="shrink-0 whitespace-nowrap rounded-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
    {createElement('relative-time', { datetime: date.toISOString(), lang: 'zh-CN', 'no-title': '' })}
  </time></TooltipTrigger><TooltipContent>{date.toLocaleString()}</TooltipContent></Tooltip>
}
