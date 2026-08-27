import { useMemo, useState, type FormEvent } from 'react'
import { useAuiState } from '@assistant-ui/react'
import { BarChart3Icon } from 'lucide-react'
import { messagesApi } from '@/api/messages'
import type { LingxiImMessageCustom } from '@/im/assistantMessage'
import { useMe } from '@/stores/auth'
import { useParticipants } from '@/stores/participants'
import type { PollTally } from '@/types'
import { Avatar } from './Avatar'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card'
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from './ui/questionnaire'

interface Props { zh?: boolean }

function timeRemaining(iso: string | null): string | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return '已过期'
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return '不足 1 分钟'
  if (mins < 60) return `${mins} 分钟`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时`
  return `${Math.floor(hours / 24)} 天`
}

export function PollBubble({ zh: _zh = false }: Props) {
  const { message } = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  const meId = useMe()
  const byId = useParticipants((state) => state.byId)
  const poll = message.poll
  const tallies = useMemo(() => message.pollTallies ?? [], [message.pollTallies])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tallyByOption = useMemo(() => {
    const map = new Map<string, PollTally>()
    for (const tally of tallies) map.set(tally.optionId, tally)
    return map
  }, [tallies])
  const myVotes = useMemo(() => new Set(
    meId ? tallies.filter((tally) => tally.voterIds.includes(meId)).map((tally) => tally.optionId) : [],
  ), [meId, tallies])

  if (!poll) return null

  const isClosed = Boolean(poll.closedAt)
  const totalVotes = tallies.reduce((sum, tally) => sum + tally.count, 0)
  const remaining = isClosed ? null : timeRemaining(poll.expiresAt)
  const author = byId[message.authorId]
  const formKey = `${message.id}:${Array.from(myVotes).sort().join(',')}:${isClosed ? 'closed' : 'open'}`
  const itemDefinitions = [{
    name: 'poll_vote',
    required: !isClosed,
    choices: poll.options.map((option) => ({ value: option.id, disabled: isClosed })),
  }]

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isClosed || submitting) return
    const optionIds = new FormData(event.currentTarget).getAll('poll_vote').map(String)
    setSubmitting(true)
    setError(null)
    void messagesApi.castPollVote(message.id, optionIds)
      .catch((reason) => setError(reason instanceof Error ? reason.message : '投票失败'))
      .finally(() => setSubmitting(false))
  }

  return (
    <Questionnaire key={formKey} items={itemDefinitions} shortcuts="letters" onSubmit={submit} className="mt-2 max-w-xl">
      <Card data-poll-state={isClosed ? 'closed' : 'open'} className="w-full" size="sm">
        <CardHeader className="grid-cols-[1fr_auto]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <BarChart3Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle>投票</CardTitle>
              <p className="truncate text-xs text-muted-foreground">{author?.name ?? message.authorId}</p>
            </div>
          </div>
          <span className="col-start-2 row-start-1 text-xs text-muted-foreground tabular-nums">
            {isClosed ? (poll.closedReason === 'expired' ? '已过期' : '已结束') : (remaining ? `剩余 ${remaining}` : '进行中')}
          </span>
        </CardHeader>
        <CardContent>
          <QuestionnaireItem name="poll_vote" required={!isClosed} multiple={poll.mode === 'multi'}>
            <QuestionnaireTitle>{poll.question}</QuestionnaireTitle>
            <QuestionnaireChoices>
              {poll.options.map((option) => {
                const tally = tallyByOption.get(option.id)
                const count = tally?.count ?? 0
                const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
                return (
                  <QuestionnaireChoice
                    key={option.id}
                    value={option.id}
                    defaultChecked={myVotes.has(option.id)}
                    disabled={isClosed || submitting}
                  >
                    <span>{option.text}</span>
                    <QuestionnaireChoiceDescription className="flex items-center justify-between gap-3">
                      <span>{count} 票 · {percentage}%</span>
                      {tally?.voterIds.length ? <VoterStack voterIds={tally.voterIds} /> : null}
                    </QuestionnaireChoiceDescription>
                  </QuestionnaireChoice>
                )
              })}
            </QuestionnaireChoices>
            <QuestionnaireError>请选择至少一个选项。</QuestionnaireError>
          </QuestionnaireItem>
        </CardContent>
        <CardFooter className="justify-between gap-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            {totalVotes ? `${totalVotes} 票${myVotes.size ? ' · 你已投票' : ''}` : '暂无投票'}
            {error ? <span className="ml-2 text-destructive">{error}</span> : null}
          </span>
          {!isClosed ? (
            <QuestionnaireActions className="min-h-0 w-auto grid-cols-[auto]">
              <QuestionnaireSubmit className="col-start-1" size="sm" disabled={submitting}>
                {submitting ? '提交中…' : (myVotes.size ? '更新投票' : '提交投票')}
              </QuestionnaireSubmit>
            </QuestionnaireActions>
          ) : null}
        </CardFooter>
      </Card>
    </Questionnaire>
  )
}

function VoterStack({ voterIds }: { voterIds: string[] }) {
  const byId = useParticipants((state) => state.byId)
  const shown = voterIds.slice(0, 3)
  const extra = voterIds.length - shown.length
  return (
    <span className="flex items-center -space-x-1">
      {shown.map((id) => {
        const participant = byId[id]
        return participant ? (
          <span key={id} className="inline-flex rounded-full ring-1 ring-card" title={participant.name}>
            <Avatar p={participant} size={16} showStatus={false} ringColor="var(--card)" />
          </span>
        ) : <span key={id} className="size-4 rounded-full bg-muted ring-1 ring-card" title={id} />
      })}
      {extra > 0 ? (
        <span className="grid size-4 place-items-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground ring-1 ring-card">+{extra}</span>
      ) : null}
    </span>
  )
}
