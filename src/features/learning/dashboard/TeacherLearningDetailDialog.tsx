import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Progress, ProgressLabel } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { learningApi } from '../api'
import { ASSISTANCE_LABELS, statusLabel } from '../components/learningDisplay'
import type { LearningAttemptDetail, LearningReview, TeacherLearnerDetail } from '../contracts'

export type TeacherDetailView =
  | { kind: 'learner'; learnerId: string }
  | { kind: 'attempt'; attemptId: string; backToLearnerId?: string }
  | { kind: 'review'; review: LearningReview }

interface TeacherLearningDetailDialogProps {
  projectId: string
  canReview: boolean
  view: TeacherDetailView | null
  onViewChange(view: TeacherDetailView | null): void
  onReviewed(): Promise<void>
}

function dateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('zh-CN') : '尚无记录'
}

export function TeacherLearningDetailDialog({
  projectId,
  canReview,
  view,
  onViewChange,
  onReviewed,
}: TeacherLearningDetailDialogProps) {
  return (
    <Dialog
      open={view !== null}
      onOpenChange={(open) => {
        if (!open) onViewChange(null)
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <div className="@container/learning-grid min-h-0 overflow-y-auto p-6">
          {view?.kind === 'learner' && (
            <LearnerView
              key={view.learnerId}
              projectId={projectId}
              learnerId={view.learnerId}
              onOpenAttempt={(attemptId) =>
                onViewChange({ kind: 'attempt', attemptId, backToLearnerId: view.learnerId })
              }
            />
          )}
          {view?.kind === 'attempt' && (
            <AttemptView
              key={view.attemptId}
              projectId={projectId}
              attemptId={view.attemptId}
              backToLearnerId={view.backToLearnerId}
              onOpenLearner={(learnerId) => onViewChange({ kind: 'learner', learnerId })}
            />
          )}
          {view?.kind === 'review' && (
            <ReviewView
              key={view.review.id}
              projectId={projectId}
              canReview={canReview}
              review={view.review}
              onOpenLearner={() => onViewChange({ kind: 'learner', learnerId: view.review.learner_id })}
              onReviewed={onReviewed}
              onClose={() => onViewChange(null)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function LearnerView({ projectId, learnerId, onOpenAttempt }: {
  projectId: string
  learnerId: string
  onOpenAttempt(attemptId: string): void
}) {
  const [detail, setDetail] = useState<TeacherLearnerDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void learningApi.getLearner(projectId, learnerId)
      .then((next) => { if (active) setDetail(next) })
      .catch((reason) => {
        if (active) setError(userFacingError(reason, '学习者详情暂时无法加载，请稍后重试。'))
      })
    return () => { active = false }
  }, [learnerId, projectId])

  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  if (!detail) return <ResourceSkeleton variant="detail" label="正在加载学习者详情" />

  return (
    <div className="space-y-6">
      <DialogHeader className="pe-10">
        <DialogTitle>{detail.learner.displayName}</DialogTitle>
        <DialogDescription>{detail.learner.email} · 加入于 {dateTime(detail.learner.joinedAt)}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 @min-[38rem]/learning-grid:grid-cols-2 @min-[62rem]/learning-grid:grid-cols-5">
        <DetailMetric label="平均掌握等级" value={`掌握等级 ${detail.summary.averageLevel.toFixed(1)}`} />
        <DetailMetric label="已验证目标" value={detail.summary.verifiedObjectives} />
        <DetailMetric label="到期复习" value={detail.summary.dueReviews} />
        <DetailMetric label="证据尝试" value={detail.summary.attemptCount} />
        <DetailMetric label="进行中任务" value={detail.summary.activeMissions} />
      </div>
      <section className="space-y-3" aria-labelledby="learner-mastery-title">
        <h3 id="learner-mastery-title" className="font-heading text-base font-medium">学习目标状态</h3>
        {detail.states.length > 0 ? (
          <Table>
            <TableHeader><TableRow><TableHead>学习目标</TableHead><TableHead>掌握等级</TableHead><TableHead>状态</TableHead><TableHead>下次复习</TableHead><TableHead>最近证据</TableHead></TableRow></TableHeader>
            <TableBody>{detail.states.map((state) => (
              <TableRow key={state.knowledgeUnitId}>
                <TableCell className="font-medium">{state.title}</TableCell>
                <TableCell>掌握等级 {state.level}</TableCell>
                <TableCell><Badge variant="outline">{statusLabel(state.status)}</Badge></TableCell>
                <TableCell>{dateTime(state.nextReviewAt)}</TableCell>
                <TableCell>{dateTime(state.lastEvidenceAt)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        ) : <p className="text-sm text-muted-foreground">暂无学习目标状态。</p>}
      </section>
      <section className="space-y-3" aria-labelledby="learner-missions-title">
        <h3 id="learner-missions-title" className="font-heading text-base font-medium">学习任务</h3>
        {detail.missions.map((mission) => {
          const value = mission.totalSteps > 0 ? mission.completedSteps / mission.totalSteps * 100 : 0
          return (
            <div key={mission.missionId} className="space-y-2 rounded-2xl bg-muted p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{mission.goal}</p><Badge variant="secondary">{statusLabel(mission.status)}</Badge></div>
              <p className="text-xs text-muted-foreground">{mission.completedSteps}/{mission.totalSteps} 步</p>
              <Progress value={value} aria-label={`${mission.goal} 已完成 ${mission.completedSteps}/${mission.totalSteps} 步`}><ProgressLabel className="sr-only">{mission.goal}</ProgressLabel></Progress>
            </div>
          )
        })}
        {detail.missions.length === 0 && <p className="text-sm text-muted-foreground">暂无学习任务记录。</p>}
      </section>
      <section className="space-y-3" aria-labelledby="learner-attempts-title">
        <h3 id="learner-attempts-title" className="font-heading text-base font-medium">学习证据</h3>
        {detail.attempts.map((attempt) => (
          <div key={attempt.attemptId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3">
            <div><p className="font-medium">{attempt.title}</p><p className="mt-1 text-xs text-muted-foreground">{dateTime(attempt.submittedAt)} · {ASSISTANCE_LABELS[attempt.assistance] ?? '辅助方式待同步'} · {statusLabel(attempt.status)}</p></div>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenAttempt(attempt.attemptId)}>查看证据</Button>
          </div>
        ))}
        {detail.attempts.length === 0 && <p className="text-sm text-muted-foreground">暂无学习证据记录。</p>}
      </section>
    </div>
  )
}

function AttemptView({ projectId, attemptId, backToLearnerId, onOpenLearner }: {
  projectId: string
  attemptId: string
  backToLearnerId?: string
  onOpenLearner(learnerId: string): void
}) {
  const { detail, error } = useAttemptDetail(projectId, attemptId)

  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  if (!detail) return <ResourceSkeleton variant="detail" label="正在加载证据详情" />

  return (
    <div className="space-y-5">
      <DialogHeader className="pe-10">
        <DialogTitle>{detail.source?.title ?? '学习证据'}</DialogTitle>
        <DialogDescription>{detail.learner.displayName} · {dateTime(detail.submittedAt)} · {ASSISTANCE_LABELS[detail.assistance] ?? '辅助方式待同步'}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenLearner(backToLearnerId ?? detail.learner.learnerId)}
        >
          {backToLearnerId ? '返回学员' : '查看学习者'}
        </Button>
        {detail.evidence && <Badge variant="secondary">证据记录于 {dateTime(detail.evidence.createdAt)}</Badge>}
      </div>
      <AttemptEvidence detail={detail} />
    </div>
  )
}

function ReviewView({ projectId, canReview, review, onOpenLearner, onReviewed, onClose }: {
  projectId: string
  canReview: boolean
  review: LearningReview
  onOpenLearner(): void
  onReviewed(): Promise<void>
  onClose(): void
}) {
  const { detail, error: attemptError } = useAttemptDetail(projectId, review.attempt_id)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (decision: 'accept' | 'reject') => {
    const reviewReason = reason.trim()
    if (!canReview || !detail || busy) return
    if (!reviewReason) {
      setError('请填写审核说明。')
      return
    }
    const accepted = decision === 'accept'
    const confirmed = await confirmSensitiveAction({
      title: accepted ? '接受这条评价？' : '退回这条评价？',
      description: accepted ? '评价结果将写入学习者的掌握状态。' : '评价将退回，等待补充学习证据。',
      confirmLabel: accepted ? '接受评价' : '退回评价',
      tone: accepted ? 'warning' : 'destructive',
    })
    if (!confirmed) return
    setBusy(true)
    setError('')
    try {
      await toastAction(learningApi.reviewEvaluation(projectId, review.id, { decision, reason: reviewReason }), {
        loading: accepted ? '正在接受评价' : '正在退回评价',
        success: accepted ? '评价已接受' : '评价已退回',
        error: accepted ? '接受评价失败，请稍后重试' : '退回评价失败，请稍后重试',
      })
      await onReviewed()
      onClose()
    } catch (reason) {
      setError(userFacingError(reason, '评价审核未完成，请稍后重试。'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <DialogHeader className="pe-10">
        <DialogTitle>{review.activity_title ?? '学习评价'}</DialogTitle>
        <DialogDescription>建议掌握等级 {review.demonstrated_level} · 置信度 {Math.round(review.confidence * 100)}%</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onOpenLearner}>查看学习者</Button>
        <Badge variant={review.verifier_verdict === 'supported' ? 'secondary' : 'outline'}>
          {review.verifier_verdict === 'supported' ? '独立复核支持' : review.verifier_verdict === 'rejected' ? '独立复核冲突' : '等待课程创建者判断'}
        </Badge>
      </div>
      {review.feedback && <p className="rounded-2xl bg-muted p-4 text-sm">{review.feedback}</p>}
      {attemptError ? (
        <Alert variant="destructive"><AlertDescription>{attemptError}</AlertDescription></Alert>
      ) : detail ? (
        <AttemptEvidence detail={detail} />
      ) : (
        <ResourceSkeleton variant="detail" label="正在加载对应证据与评价标准" />
      )}
      {canReview ? (
        <div className="space-y-2">
          <Label htmlFor={`review-reason-${review.id}`}>审核说明</Label>
          <Textarea id={`review-reason-${review.id}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明接受或退回的依据" required aria-invalid={Boolean(error) || undefined} />
          <p className="text-xs text-muted-foreground">审核说明会随本次决定一起保存。</p>
        </div>
      ) : <Alert><AlertDescription>当前课程状态下不能处理评价审核。</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {canReview && (
        <DialogFooter className="sticky bottom-0 z-10 -mx-6 -mb-6 border-t bg-popover px-6 pb-6 pt-4">
          <Button type="button" variant="secondary" disabled={busy || !detail} onClick={() => void submit('reject')}>退回</Button>
          <Button type="button" disabled={busy || !detail} onClick={() => void submit('accept')}>接受评价</Button>
        </DialogFooter>
      )}
    </div>
  )
}

function DetailMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl bg-muted p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-heading text-xl font-medium tabular-nums">{value}</p></div>
}

function useAttemptDetail(projectId: string, attemptId: string) {
  const [detail, setDetail] = useState<LearningAttemptDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setDetail(null)
    setError('')
    void learningApi.getAttempt(projectId, attemptId)
      .then((next) => {
        if (active) setDetail(next)
      })
      .catch((reason) => {
        if (active) setError(userFacingError(reason, '证据详情暂时无法加载，请稍后重试。'))
      })
    return () => {
      active = false
    }
  }, [attemptId, projectId])

  return { detail, error }
}

function AttemptEvidence({ detail }: { detail: LearningAttemptDetail }) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="font-heading text-base font-medium">原始证据</h3>
        {detail.evidence ? (
          <StructuredText value={detail.evidence.data} />
        ) : (
          <p className="text-sm text-muted-foreground">这次尝试没有保存原始证据。</p>
        )}
      </section>
      <section className="space-y-3">
        <h3 className="font-heading text-base font-medium">评价记录</h3>
        {detail.evaluations.map((evaluation) => (
          <div key={evaluation.evaluationId} className="space-y-3 rounded-2xl bg-muted p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">掌握等级 {evaluation.demonstratedLevel}</p>
              <Badge variant="secondary">{statusLabel(evaluation.status)}</Badge>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">评价标准结果</p>
              <StructuredText value={evaluation.rubricResults} />
            </div>
            {evaluation.feedback && <p className="text-sm text-muted-foreground">{evaluation.feedback}</p>}
            {evaluation.reviewReason && (
              <p className="text-xs text-muted-foreground">审核说明：{evaluation.reviewReason}</p>
            )}
          </div>
        ))}
        {detail.evaluations.length === 0 && (
          <p className="text-sm text-muted-foreground">这条证据还没有评价记录。</p>
        )}
      </section>
    </div>
  )
}

function StructuredText({ value }: { value: unknown }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? String(value)
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-2xl border bg-background p-3 font-mono text-xs leading-relaxed">
      {text}
    </pre>
  )
}
