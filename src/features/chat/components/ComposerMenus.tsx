import { Avatar } from '@/components/Avatar'
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
      <div className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-300">
        快捷命令 {query ? `· "/${query}"` : ''}
      </div>
      {commands.map((command, index) => {
        const active = index === activeIndex
        return (
          <button key={command.id} type="button" onMouseEnter={() => onHover(index)} onClick={() => onPick(command)} className={cn('app-menu-item', active && 'is-active')}>
            <span className={cn('inline-flex h-[26px] w-[26px] items-center justify-center rounded-full font-mono text-[12px] font-semibold', active ? 'bg-skype-deep text-cloud' : 'bg-sky2-100 text-skype-deep')}>/</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-ink-900">{command.label}</div>
              <div className="truncate text-[10.5px] text-ink-500">{command.hint}</div>
            </div>
            <span className="text-[10px] tabular-nums tracking-wide text-ink-300">/{command.id}</span>
          </button>
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
      <div className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-300">
        提及成员 {query ? `· "${query}"` : ''}
      </div>
      {entries.map((entry, index) => {
        const active = index === activeIndex
        if (entry.kind === 'all') {
          return (
            <button key="__all" type="button" onMouseEnter={() => onHover(index)} onClick={() => onPick(entry)} className={cn('app-menu-item', active && 'is-active')}>
              <Avatar p={EVERYONE_BLOUB_PARTICIPANT} size={28} ringColor="transparent" showStatus={false} animated={false} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-ink-900">所有人</div>
                <div className="truncate text-[10.5px] text-ink-500">通知会话中的全部成员</div>
              </div>
            </button>
          )
        }
        const participant = entry.p
        return (
          <button key={participant.id} type="button" onMouseEnter={() => onHover(index)} onClick={() => onPick(entry)} className={cn('app-menu-item', active && 'is-active')}>
            <Avatar p={participant} size={26} ringColor="var(--cloud)" showStatus={false} animated={false} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-ink-900">{participant.name}</div>
              <div className="truncate text-[10.5px] text-ink-500">@{participant.id}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
