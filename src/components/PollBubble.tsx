import { useMemo, useState } from 'react'
import { useAuiState } from '@assistant-ui/react'
import type { PollTally } from '@/types'
import { api } from '@/api/client'
import { useParticipants } from '@/stores/participants'
import { useMe } from '@/stores/auth'
import { Avatar } from './Avatar'
import { cn } from '@/lib/utils'
import { OptionList, type OptionListSelection } from './tool-ui/option-list'
import type { LingxiImMessageCustom } from '@/im/assistantMessage'

/**
 * Poll bubble. Renders a kind='poll' message — question + clickable options
 * with live progress bars, voter avatar stacks, and a status footer.
 *
 * Visual language inherits the existing artifact cards (email, document):
 *   - rounded-[12px] border-ink-100 bg-cloud container
 *   - sky2 family for the "selected / counted" hue
 *   - ink-50/100/300/500 for ambient text + dividers
 *
 * Multi-choice mode buffers picks locally and commits on "Submit" so a 3-of-3
 * vote doesn't fire three HTTP requests. Single-choice commits immediately —
 * one click = one vote = instant feedback.
 */

interface Props {
  zh?: boolean
}

function timeRemaining(iso: string | null): string | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return '< 1m'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function PollBubble({ zh = false }: Props) {
  const { message: msg } = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  const meId = useMe()
  const byId = useParticipants((s) => s.byId)
  const poll = msg.poll
  const tallies = useMemo(() => msg.pollTallies ?? [], [msg.pollTallies])
  const tallyByOption = useMemo(() => {
    const map = new Map<string, PollTally>()
    for (const t of tallies) map.set(t.optionId, t)
    return map
  }, [tallies])

  const myCurrentVotes = useMemo(() => {
    const out = new Set<string>()
    if (!meId) return out
    for (const t of tallies) {
      if (t.voterIds.includes(meId)) out.add(t.optionId)
    }
    return out
  }, [tallies, meId])

  // For multi mode we buffer picks until the user hits "Submit".
  // For single mode pendingPicks is just a 1-element overlay during the
  // optimistic flash before the WS echo lands.
  const [pendingPicks, setPendingPicks] = useState<Set<string> | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ALL hooks have to live above the conditional return below, otherwise
  // React sees a different hook count between renders (a poll arriving via
  // WS as bare metadata first, then patched with the full payload, would
  // crash the conversation). Keep this useMemo here, not under the early
  // exit.
  const hasUnsavedDelta = useMemo(() => {
    if (!pendingPicks) return false
    if (pendingPicks.size !== myCurrentVotes.size) return true
    for (const id of pendingPicks) if (!myCurrentVotes.has(id)) return true
    return false
  }, [pendingPicks, myCurrentVotes])

  if (!poll) return null

  const isClosed = !!poll.closedAt
  const totalVotes = tallies.reduce((s, t) => s + t.count, 0)
  const author = byId[msg.authorId]

  const displayedPicks = pendingPicks ?? myCurrentVotes

  const commit = async (optionIds: string[]) => {
    setSubmitting(true)
    setErrorMsg(null)
    try {
      await api.castPollVote(msg.id, optionIds)
      // The WS echo will repaint via the messages store; clear the local
      // overlay so we render from the canonical tallies.
      setPendingPicks(null)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'vote failed')
    } finally {
      setSubmitting(false)
    }
  }

  const onSubmitMulti = () => {
    if (!pendingPicks) return
    void commit(Array.from(pendingPicks))
  }
  const onResetMulti = () => setPendingPicks(null)

  const winner = isClosed && tallies.length > 0
    ? tallies.reduce((best, t) => (t.count > best.count ? t : best), tallies[0])
    : null

  const remaining = !isClosed ? timeRemaining(poll.expiresAt) : null
  const optionListOptions = poll.options.map((option) => {
    const tally = tallyByOption.get(option.id)
    const count = tally?.count ?? 0
    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
    const isWinner = winner?.optionId === option.id && count > 0
    return {
      id: option.id,
      label: `${option.text}${isWinner ? ' ★' : ''}`,
      description: `${count} ${zh ? '票' : count === 1 ? 'vote' : 'votes'} · ${pct}%`,
      icon: (tally?.voterIds.length ?? 0) > 0 ? <VoterStack voterIds={tally?.voterIds ?? []} /> : undefined,
      disabled: isClosed || submitting,
    }
  })
  const optionListValue: OptionListSelection = poll.mode === 'single'
    ? (Array.from(displayedPicks)[0] ?? null)
    : Array.from(displayedPicks)
  const onOptionListChange = (selection: OptionListSelection) => {
    const ids = selection == null ? [] : typeof selection === 'string' ? [selection] : selection
    if (poll.mode === 'single') {
      setPendingPicks(new Set(ids))
      void commit(ids)
      return
    }
    setPendingPicks(new Set(ids))
  }

  return (
    <div
      className={cn(
        'mt-2 w-full max-w-[min(100%,580px)] rounded-[12px] border bg-cloud',
        isClosed ? 'border-ink-100 opacity-90' : 'border-ink-100',
        'shadow-[0_1px_0_rgba(15,23,42,0.02)]',
      )}
    >
      {/* Header strip */}
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-1.5 text-[11.5px] text-ink-500">
        <span aria-hidden className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky2-50 text-skype-deep">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="4" height="9" rx="1" />
            <rect x="10" y="6" width="4" height="14" rx="1" />
            <rect x="17" y="14" width="4" height="6" rx="1" />
          </svg>
        </span>
        <span className="font-semibold text-ink-700">{zh ? '投票' : "民意调查"}</span>
        <span className="text-ink-300">·</span>
        <span>{author?.name ?? msg.authorId}</span>
        {poll.mode === 'multi' && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-ink-50 text-ink-500 text-[10px] tracking-wide uppercase">{zh ? '多选' : "多"}</span>
        )}
        <span className="ml-auto text-ink-400 tabular-nums">
          {isClosed
            ? (poll.closedReason === 'expired' ? (zh ? '已过期' : "已过期\n使用") : (zh ? '已结束' : "已关闭"))
            : (remaining ? (zh ? `剩余 ${remaining}` : `${remaining} left`) : (zh ? '进行中' : "打开"))}
        </span>
      </div>

      {/* Question */}
      <div className="px-3.5 pb-2 text-[14px] font-semibold text-ink-900 leading-snug">
        {poll.question}
      </div>

      <OptionList
        id={`poll-options-${msg.id}`}
        role="decision"
        className="px-3 pb-2 [&_[data-slot=option-list]]:max-w-none"
        options={optionListOptions}
        selectionMode={poll.mode}
        minSelections={0}
        value={optionListValue}
        onChange={onOptionListChange}
        actions={!isClosed && poll.mode === 'multi' && hasUnsavedDelta ? [
          { id: 'reset', label: zh ? '重置' : 'Reset', variant: 'ghost', disabled: submitting },
          { id: 'submit', label: submitting ? (zh ? '保存中…' : 'Saving…') : (zh ? '提交' : 'Submit'), disabled: submitting },
        ] : undefined}
        onAction={(actionId) => {
          if (actionId === 'reset') onResetMulti()
          if (actionId === 'submit') onSubmitMulti()
        }}
      />

      {/* Footer / multi-choice submit */}
      <div className="px-3.5 pb-3 pt-1 flex items-center gap-2 text-[11.5px] text-ink-500 min-h-[28px]">
        <span className="tabular-nums">
          {totalVotes === 0
            ? (zh ? '暂无投票' : "还没有投票")
            : (zh ? `${totalVotes} 票` : `${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'}`)}
        </span>
        {!isClosed && myCurrentVotes.size > 0 && (
          <>
            <span className="text-ink-300">·</span>
            <span>{zh ? '你已投票' : "你投票了"}</span>
          </>
        )}
        {errorMsg && (
          <span className="text-coral-deep">· {errorMsg}</span>
        )}
      </div>
    </div>
  )
}

function VoterStack({ voterIds }: { voterIds: string[] }) {
  const byId = useParticipants((s) => s.byId)
  const MAX = 3
  const shown = voterIds.slice(0, MAX)
  const extra = voterIds.length - shown.length
  return (
    <span className="flex items-center -space-x-1">
      {shown.map((id) => {
        const p = byId[id]
        if (!p) return (
          <span
            key={id}
            className="inline-flex w-4 h-4 rounded-full bg-ink-200 ring-1 ring-cloud"
            title={id}
          />
        )
        return (
          <span key={id} className="inline-flex ring-1 ring-cloud rounded-full" title={p.name}>
            <Avatar p={p} size={16} showStatus={false} ringColor="var(--cloud)" />
          </span>
        )
      })}
      {extra > 0 && (
        <span
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-ink-100 text-[9px] font-semibold text-ink-600 ring-1 ring-cloud tabular-nums"
          title={`+${extra} more`}
        >
          +{extra}
        </span>
      )}
    </span>
  )
}
