import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useMe } from '@/stores/auth'
import { toggleReaction } from '@/features/chat/state/messages'
import { useParticipants } from '@/features/agents/state'
import type { ReactionEntry } from '@/types'
import { TwEmoji } from '../TwEmoji'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export const QUICK_REACTIONS = ['👀', '👍', '✅', '❤️', '😂', '🎉', '👏', '🔥', '💡', '🤔', '🎯', '🙌']

export function ReactionPill({ msgId, reaction }: { msgId: string; reaction: ReactionEntry }) {
  const byId = useParticipants((state) => state.byId)
  const meId = useMe()
  const [burst, setBurst] = useState(0)
  const names = (reaction.users ?? []).reduce<string[]>((result, userId) => {
    if (userId === meId) result.push('You')
    else if (byId[userId]?.name) result.push(byId[userId].name)
    return result
  }, [])
  const orderedNames = [
    ...names.filter((name) => name === 'You'),
    ...names.filter((name) => name !== 'You').sort((a, b) => a.localeCompare(b)),
  ]
  return <Tooltip>
    <TooltipTrigger asChild>
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={() => {
        if (!reaction.mine) setBurst((value) => value + 1)
        void toggleReaction(msgId, reaction.emoji)
      }}
      data-mine={reaction.mine ? 'true' : 'false'}
      className={cn(
        'reaction-control reaction-pill h-6 rounded-full px-2 text-[11px]',
        reaction.mine
          ? 'border-primary/30 bg-primary/10 font-semibold text-primary'
          : 'text-muted-foreground',
      )}
    >
      <span className="reaction-emoji inline-flex"><TwEmoji emoji={reaction.emoji} size={14} /></span>
      <span className="reaction-count">{reaction.count}</span>
      {burst > 0 && <ReactionBurst key={burst} />}
    </Button>
    </TooltipTrigger>
    {orderedNames.length > 0 && <TooltipContent side="top"><TwEmoji emoji={reaction.emoji} size={14} />{orderedNames.join(', ')}</TooltipContent>}
  </Tooltip>
}

function ReactionBurst() {
  return <span className="reaction-burst" aria-hidden="true"><span /><span /><span /><span /></span>
}
