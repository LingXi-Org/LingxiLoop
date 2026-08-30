import { useState } from 'react'
import { ApprovalCard } from '@/components/tool-ui/approval-card'
import { Plan } from '@/components/tool-ui/plan'
import { ProgressTracker } from '@/components/tool-ui/progress-tracker'
import { Tool, type ToolPart } from '@/components/prompt-kit/tool'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { agentsApi } from '@/features/agents/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import type { ApprovalPayload, Message } from '@/types'

function progressStatus(status?: string): 'pending' | 'in-progress' | 'completed' | 'failed' {
  const value = status?.toLowerCase() ?? ''
  if (/fail|error|blocked|reject/.test(value)) return 'failed'
  if (/done|complete|success|sent|approved|accept/.test(value)) return 'completed'
  if (/run|work|progress|execut|stream/.test(value)) return 'in-progress'
  return 'pending'
}

function approvalTitle(approval: ApprovalPayload) {
  return ({ external_communication: '确认外部沟通', sensitive_or_destructive_action: '确认敏感操作', financial_or_irreversible_action: '确认不可逆操作', course_management: '确认课程管理操作', learning_evaluation: '确认学习评估' } satisfies Record<ApprovalPayload['kind'], string>)[approval.kind]
}

function toolPresentation(tool: NonNullable<Message['tool']>) {
  const identity = `${tool.name} ${tool.icon ?? ''}`.toLowerCase()
  if (/figma|design|canvas|image|media/.test(identity)) return { label: '处理设计资源', scopeLabel: '设计与媒体', tone: 'design' as const }
  if (/mail|email|calendar|message|notify|send/.test(identity)) return { label: '执行协作操作', scopeLabel: '沟通与协作', tone: 'communication' as const }
  if (/github|git|code|repo|shell|terminal|command|build|test/.test(identity)) return { label: '执行开发任务', scopeLabel: '开发与代码', tone: 'code' as const }
  if (/database|\bdb\b|sql|knowledge|document|file|storage/.test(identity)) return { label: '查询知识与数据', scopeLabel: '知识与数据', tone: 'data' as const }
  if (/web|browser|search|crawl|fetch|http/.test(identity)) return { label: '检索网页信息', scopeLabel: '网页与检索', tone: 'web' as const }
  return { label: '执行自动化任务', scopeLabel: '自动化能力', tone: 'automation' as const }
}

function approvalArgs(approval: ApprovalPayload): Record<string, unknown> {
  const args = approval.payload.args
  return args && typeof args === 'object' && !Array.isArray(args) ? args as Record<string, unknown> : approval.payload
}

export function ApprovalPart({ message, addResult }: { message: Message; addResult: (result: { decision: 'approved' | 'denied'; persisted: true }) => void }) {
  const approval = message.approval
  const [busy, setBusy] = useState<'approved' | 'denied' | 'modify' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modifyOpen, setModifyOpen] = useState(false)
  const [summary, setSummary] = useState(approval?.summary ?? '')
  const [argsText, setArgsText] = useState(() => JSON.stringify(approval ? approvalArgs(approval) : {}, null, 2))
  if (!approval) throw new Error('Approval message is missing its native approval payload')
  const pending = approval.status === 'PENDING'
  const resolve = async (decision: 'approved' | 'denied') => {
    if (!pending || busy || confirming) return
    setConfirming(true)
    const confirmed = await confirmSensitiveAction({
      title: decision === 'approved' ? '批准并执行这项任务？' : '拒绝这项任务？',
      description: decision === 'approved' ? '系统将重新校验权限，并执行审批关联的高影响操作。' : '拒绝后当前审批将终止，关联任务不会执行。',
      confirmLabel: decision === 'approved' ? '批准并执行' : '确认拒绝',
      tone: decision === 'approved' ? 'warning' : 'destructive',
    })
    setConfirming(false)
    if (!confirmed) return
    setBusy(decision); setError(null)
    try {
      const result = await toastAction(agentsApi.resolveApproval(approval.id, decision === 'approved' ? 'approved' : 'rejected'), {
        loading: decision === 'approved' ? '正在批准任务' : '正在拒绝任务',
        success: (value) => decision === 'approved'
          ? value.ok ? '任务已批准并触发' : '审批已通过，但任务执行受阻'
          : '任务已拒绝，未触发执行',
        error: decision === 'approved' ? '批准任务失败' : '拒绝任务失败',
        description: approval.summary,
      })
      addResult({ decision, persisted: true })
      if (!result.ok && result.error) setError(result.error)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(null)
    }
  }
  const supersede = async () => {
    if (!pending || busy || confirming) return
    let args: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(argsText)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('执行参数必须是 JSON 对象')
      args = parsed as Record<string, unknown>
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '执行参数不是有效 JSON')
      return
    }
    setConfirming(true)
    const confirmed = await confirmSensitiveAction({ title: '提交修改后的审批？', description: '当前审批将被取消，并创建一条新的待审批消息；原审批不会被原地覆盖。', confirmLabel: '创建新审批', tone: 'warning' })
    setConfirming(false)
    if (!confirmed) return
    setBusy('modify'); setError(null)
    try {
      await toastAction(agentsApi.supersedeApproval(approval.id, { args, ...(summary.trim() ? { summary: summary.trim() } : {}) }), {
        loading: '正在提交修改', success: '已创建新的待审批任务', error: '修改审批失败', description: approval.summary,
      })
      setModifyOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(null)
    }
  }
  const choice = approval.status === 'APPROVED' || approval.status === 'EXECUTED' ? 'approved' : pending ? undefined : 'denied'
  return <div className="mt-2 max-w-[620px]" data-card-status={approval.status === 'REJECTED' || approval.status === 'CANCELLED' ? 'failed' : approval.status.toLowerCase()}>
    <ApprovalCard id={`approval-card-${approval.id}`} role="decision" title={approvalTitle(approval)} description={approval.summary} variant={approval.kind.includes('destructive') || approval.kind.includes('irreversible') ? 'destructive' : 'default'} metadata={[{ key: '状态', value: approval.status }, { key: '请求时间', value: new Date(approval.requestedAt).toLocaleString() }]} confirmLabel={busy === 'approved' ? '处理中…' : '批准'} cancelLabel={busy === 'denied' ? '处理中…' : '拒绝'} modifyLabel={busy === 'modify' ? '处理中…' : '修改'} choice={choice} onModify={() => setModifyOpen(true)} onConfirm={() => resolve('approved')} onCancel={() => resolve('denied')} />
    <Sheet open={modifyOpen} onOpenChange={setModifyOpen}><SheetContent className="sm:max-w-lg"><SheetHeader><SheetTitle>修改审批</SheetTitle><SheetDescription>修改会保留原审批记录，并创建新的审批身份。</SheetDescription></SheetHeader><div className="space-y-4 px-6"><label className="block space-y-1 text-sm"><span>摘要</span><Textarea value={summary} onChange={(event) => setSummary(event.target.value)} /></label><label className="block space-y-1 text-sm"><span>执行参数（JSON）</span><Textarea className="min-h-56 font-mono text-xs" value={argsText} onChange={(event) => setArgsText(event.target.value)} /></label></div><SheetFooter><Button type="button" onClick={() => void supersede()} disabled={busy !== null || confirming}>提交修改</Button></SheetFooter></SheetContent></Sheet>
    {(error || approval.error) && <p role="alert" className="mt-1 text-[11px] text-destructive">{error ?? approval.error}</p>}
  </div>
}

export function ToolActivityPart({ message }: { message: Message }) {
  const tool = message.tool
  if (!tool) throw new Error('Tool message is missing its native tool payload')
  const status = progressStatus(tool.status)
  const presentation = toolPresentation(tool)
  const state: ToolPart['state'] = status === 'completed' ? 'output-available' : status === 'failed' ? 'output-error' : status === 'in-progress' ? 'input-streaming' : 'input-available'
  return <Tool
    className="w-full max-w-md"
    defaultOpen={state === 'output-error'}
    toolPart={{
      type: presentation.label,
      service: presentation.tone,
      state,
      input: { operation: tool.name, code: tool.arg },
      output: state === 'output-available' && tool.detail ? { result: tool.detail } : undefined,
      errorText: state === 'output-error' ? tool.detail || tool.status : undefined,
      toolCallId: message.id,
    }}
  />
}

export function HandoffPart({ message }: { message: Message }) {
  const handoff = message.handoff
  if (!handoff) throw new Error('Handoff message is missing its native handoff payload')
  const status = progressStatus(handoff.status)
  return <ProgressTracker id={`progress-handoff-${handoff.id}`} role="state" className="mt-2 max-w-[580px]" steps={[{ id: `${handoff.id}-prepared`, label: handoff.title, description: handoff.note ?? undefined, status: 'completed' }, { id: `${handoff.id}-transfer`, label: `${handoff.fromAgentId} → ${handoff.toAgentId}`, description: [...handoff.sharedPaths, ...handoff.browserTargets].join('\n') || undefined, status }]} choice={status === 'completed' ? { outcome: 'success', summary: '交接已完成', at: message.createdAt ?? new Date().toISOString() } : status === 'failed' ? { outcome: 'failed', summary: '交接受阻', at: message.createdAt ?? new Date().toISOString() } : undefined} />
}

export function LearningMissionPart({ message }: { message: Message }) {
  const mission = message.learningMission
  if (!mission) throw new Error('Learning mission message is missing its native payload')
  const status = mission.status === 'COMPLETED' ? 'completed' : mission.status === 'CANCELLED' ? 'cancelled' : 'in_progress'
  return <Plan id={`plan-learning-${mission.missionId}`} role="composite" className="mt-2 max-w-[620px]" title={mission.goal} description="学习任务" todos={[{ id: `${mission.missionId}-success`, label: mission.successCriteria, description: `项目 ${mission.projectId}`, status }]} receipt={status === 'completed' ? { outcome: 'success', summary: '学习任务已完成', at: message.createdAt ?? new Date().toISOString() } : undefined} />
}
