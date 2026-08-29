import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/button'
import { EVERYONE_BLOUB_PARTICIPANT } from '@/lib/agentVisualState'
import { cn } from '@/lib/utils'
import type { Participant } from '@/types'

export type MentionEntry = { kind: 'all' } | { kind: 'participant'; p: Participant }

export interface ComposerCommand {
  id: string
  label: string
  hint: string
  keywords: string[]
  run: () => void
}

export function ComposerCommandMenu({ query, commands, activeIndex, onHover, onPick }: {
  query: string
  commands: ComposerCommand[]
  activeIndex: number
  onHover: (index: number) => void
  onPick: (command: ComposerCommand) => void
}) {
  if (commands.length === 0) return null
  return (
    <div className="app-menu-surface absolute bottom-full left-0 z-20 mb-2 min-w-[280px] p-1 animate-rise" onMouseDown={(event) => event.preventDefault()}>
      <div className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        快捷命令 {query ? `· "/${query}"` : ''}
      </div>
      {commands.map((command, index) => {
        const active = index === activeIndex
        return (
          <Button key={command.id} variant="ghost" type="button" onMouseEnter={() => onHover(index)} onClick={() => onPick(command)} className={cn('app-menu-item h-auto w-full justify-start', active && 'is-active bg-muted')}>
            <span className={cn('inline-flex size-7 items-center justify-center rounded-full font-mono text-xs font-semibold', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-primary')}>/</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-foreground">{command.label}</div>
              <div className="truncate text-[10.5px] text-muted-foreground">{command.hint}</div>
            </div>
            <span className="text-[10px] tabular-nums tracking-wide text-muted-foreground">/{command.id}</span>
          </Button>
        )
      })}
    </div>
  )
}

export function ComposerMentionMenu({ query, entries, activeIndex, onHover, onPick }: {
  query: string
  entries: MentionEntry[]
  activeIndex: number
  onHover: (index: number) => void
  onPick: (entry: MentionEntry) => void
}) {
  if (entries.length === 0) return null
  return (
    <div className="app-menu-surface absolute bottom-full left-0 z-20 mb-2 min-w-[240px] p-1 animate-rise" onMouseDown={(event) => event.preventDefault()}>
      <div className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        提及成员 {query ? `· "${query}"` : ''}
      </div>
      {entries.map((entry, index) => {
        const active = index === activeIndex
        if (entry.kind === 'all') {
          return (
            <Button key="__all" variant="ghost" type="button" onMouseEnter={() => onHover(index)} onClick={() => onPick(entry)} className={cn('app-menu-item h-auto w-full justify-start', active && 'is-active bg-muted')}>
              <Avatar p={EVERYONE_BLOUB_PARTICIPANT} size={28} ringColor="transparent" animated={false} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-foreground">所有人</div>
                <div className="truncate text-[10.5px] text-muted-foreground">通知会话中的全部成员</div>
              </div>
            </Button>
          )
        }
        const participant = entry.p
        return (
          <Button key={participant.id} variant="ghost" type="button" onMouseEnter={() => onHover(index)} onClick={() => onPick(entry)} className={cn('app-menu-item h-auto w-full justify-start', active && 'is-active bg-muted')}>
            <Avatar p={participant} size={26} ringColor="transparent" animated={false} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-foreground">{participant.name}</div>
              <div className="truncate text-[10.5px] text-muted-foreground">@{participant.id}</div>
            </div>
          </Button>
        )
      })}
    </div>
  )
}
