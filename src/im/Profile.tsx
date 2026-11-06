import { type AgentActionProps, useOpenAgent } from '@/features/agents/useOpenAgent'
import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { IMail } from '@/components/icons'
import { cn } from '@/lib/utils'
import { useMe } from '@/stores/auth'
import { useParticipants } from '@/features/agents/state'
import { participantRoleZh } from '@/lib/participantRole'

const STATUS_LABEL: Record<string, string> = {
  avail: '可用',
  working: '工作中',
  thinking: '思考中',
  waiting: '等待你确认',
  resting: '休息中',
}

const STATUS_COLOR: Record<string, string> = {
  avail: '#1F8A5B',
  working: '#2B8A9E',
  thinking: '#3B6FD8',
  waiting: '#B7791F',
  resting: '#56606C',
}
const TOOL_TONE = ['#2B8A9E', '#1F8A5B', '#7B5CC9', '#D2652A']

/** Participant profile for the responsive Web/Desktop shell. */
export function ParticipantProfile({
  participantId,
  onClose,
  ...actions
}: {
  participantId: string
  onClose: () => void
} & AgentActionProps) {
  const participant = useParticipants((state) => state.byId[participantId])
  const meId = useMe()
  const { opening, error, retryingRefresh, actionLabel, open, chooseWorkspace } = useOpenAgent(participant, actions, onClose)
  const [copied, setCopied] = useState(false)

  if (!participant) return null
  const isAgent = participant.kind === 'agent'
  const isManaged=participant.managed===true
  const isSelf = participant.id === meId
  const statusColor = STATUS_COLOR[participant.status] ?? 'var(--resting)'
  const roleLabel = participantRoleZh(participant) ?? (isAgent ? '智能助教' : '学习区成员')
  const toolLabels = [...new Set((participant.tools ?? []).map((tool) => tool === 'ipython' ? '数据分析' : '扩展能力'))]

  const copyEmail = async () => {
    if (!participant.email) return
    try {
      await navigator.clipboard.writeText(participant.email)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard permissions are not guaranteed in every webview.
    }
  }

  return (
    <div className="im-profile relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-[18px] py-[22px]">
        <div className="flex items-center gap-3.5">
          <Avatar p={participant} size={56} ringColor="var(--background)" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="m-0 truncate text-lg font-semibold text-foreground">{participant.name}</h2>
            <span className="inline-flex h-6 w-fit items-center gap-1.5 rounded-full px-2.5 text-xs font-medium" style={{ background: `color-mix(in srgb, ${statusColor} 10%, transparent)`, color: statusColor }}>
              <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: statusColor }} />
              {STATUS_LABEL[participant.status] ?? '空闲'}
            </span>
          </div>
        </div>
        <p className="m-0 text-[13px] leading-[1.7] text-fg2">{participant.bio || roleLabel}</p>
        {participant.email && <div className="flex h-9 items-center gap-2 rounded-[9px] bg-formula ps-2.5 pe-1">
          <IMail className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[13px]">{participant.email}</span>
          <button type="button" onClick={() => void copyEmail()} aria-label={copied ? '已复制邮箱' : '复制邮箱'} title={copied ? '已复制' : '复制'}
            className={cn('grid size-7 place-items-center rounded-lg hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring', copied ? 'text-brand' : 'text-muted-foreground')}>
            {copied ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="m5 12 5 5 9-10" /></svg>
              : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
          </button>
        </div>}
        {isAgent && toolLabels.length > 0 && <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">可用工具与扩展能力</span>
          <div className="flex flex-wrap gap-1.5">
            {toolLabels.map((tool, index) => <span key={tool} className="inline-flex h-7 items-center gap-1.5 rounded-full pe-2.5 ps-1 text-[12.5px] shadow-[inset_0_0_0_1px_var(--border)]">
              <span aria-hidden="true" className="grid size-5 place-items-center rounded-md" style={{ background: `color-mix(in srgb, ${TOOL_TONE[index % TOOL_TONE.length]} 12%, transparent)`, color: TOOL_TONE[index % TOOL_TONE.length] }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-2.4z" /></svg>
              </span>{tool}
            </span>)}
          </div>
        </div>}
        {!isSelf && (isAgent ? <div className="flex flex-col gap-2 pt-1">
          <button type="button" onClick={() => void open()} disabled={opening} data-agent-action={isManaged ? 'teaching' : 'conversation'}
            className="h-9 rounded-[10px] bg-brand text-[13.5px] font-medium text-brand-foreground hover:bg-[color-mix(in_srgb,var(--brand)_90%,var(--foreground))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 max-md:min-h-11">
            {opening ? '正在打开…' : retryingRefresh ? '重试刷新' : actionLabel}
          </button>
          {error && <p role="alert" className="m-0 text-xs text-destructive">{error}</p>}
          {error && !retryingRefresh && actions.onChooseWorkspace && <button type="button" onClick={chooseWorkspace}
            className="h-9 rounded-[10px] bg-card text-[13.5px] font-medium shadow-[inset_0_0_0_1px_var(--input)] hover:bg-accent">选择工作区</button>}
        </div> : <p className="m-0 rounded-[10px] bg-formula px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">请在所属课程或学习任务中与该成员联系。</p>)}
        <div className="h-[max(8px,env(safe-area-inset-bottom))]" />
      </div>
    </div>
  )
}
