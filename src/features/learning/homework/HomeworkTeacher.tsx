import { useCallback, useEffect, useId, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { userFacingError } from '@/lib/userFacingError'
import { homeworkApi } from './api'
import { type Homework, type HomeworkDetail, type HomeworkLearner, homeworkStatus, localDeadline } from './contracts'
import { HomeworkSubmissionView } from './HomeworkReport'

export function HomeworkTeacher({ homework, canReview, canEdit, onUpdated }: { homework: Homework; canReview: boolean; canEdit: boolean; onUpdated(detail: HomeworkDetail): void }) {
  const id = useId()
  const [learners, setLearners] = useState<HomeworkLearner[]>([]), [nextOffset, setNextOffset] = useState<number | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [closing, setClosing] = useState(false)
  const [dueAt, setDueAt] = useState(localDeadline(homework.dueAt))
  const load = useCallback(async (offset = 0) => {
    setBusy(true); setError('')
    try {
      const result = await homeworkApi.learners(homework.courseId, homework.id, offset)
      setLearners(previous => offset ? [...previous, ...result.items] : result.items); setNextOffset(result.nextOffset)
    } catch (reason) { setError(userFacingError(reason, '学生进度暂时无法加载，请重试。')) }
    finally { setBusy(false) }
  }, [homework.courseId, homework.id])
  useEffect(() => { void load() }, [load])
  return <div className="space-y-6">
    {canEdit && <section aria-label="作业安排" className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">作业安排</h3>
      <p className="text-sm text-muted-foreground">已发布的要求保持不变。需要调整要求时，请关闭这份作业，再与助手拟定新作业。</p>
      {homework.dueAt && <form className="flex flex-wrap items-end gap-2" onSubmit={async event => {
        event.preventDefault(); if (busy || !dueAt) return
        setBusy(true); setError('')
        try { onUpdated(await homeworkApi.deadline(homework.courseId, homework.id, { expectedRevision: homework.revision, dueAt: new Date(dueAt).toISOString() })) }
        catch (reason) { setError(userFacingError(reason, '截止时间未能更新，请重试。')) }
        finally { setBusy(false) }
      }}>
        <div className="min-w-0 space-y-2"><Label htmlFor={`${id}-deadline`}>截止时间</Label><Input id={`${id}-deadline`} type="datetime-local" value={dueAt} min={localDeadline(homework.dueAt)} disabled={busy} onChange={event => setDueAt(event.target.value)} /></div>
        <Button type="submit" variant="outline" disabled={busy || !dueAt || dueAt === localDeadline(homework.dueAt)}>延长截止时间</Button>
      </form>}
      {homework.status !== 'CLOSED' && (!closing ? <Button variant="outline" disabled={busy} onClick={() => setClosing(true)}>关闭作业</Button> : <div className="space-y-3">
        <p className="text-sm">关闭后停止接收提交。被教师退回的学生仍可按意见补交一次修订；已有记录会保留。</p>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setClosing(false)}>暂不关闭</Button><Button disabled={busy} onClick={async () => {
          setBusy(true); setError('')
          try { onUpdated(await homeworkApi.close(homework.courseId, homework.id, homework.revision)); setClosing(false) }
          catch (reason) { setError(userFacingError(reason, '作业未能关闭，请重试。')) }
          finally { setBusy(false) }
        }}>确认关闭</Button></div>
      </div>)}
    </section>}
    <section aria-label="学生进度与验收" className="space-y-4" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">学生进度与验收</h3><Button variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>刷新进度</Button></div>
      <p className="text-sm text-muted-foreground">提交前可查看进度和待核实要求。作答、报告在学生正式提交后显示，报告会保留尚未掌握、需要帮助和待核实的情况。</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!learners.length && !busy && !error && <p className="text-sm text-muted-foreground">还没有学生进度。</p>}
      {learners.map(learner => <Learner key={learner.learnerId} learner={learner} homework={homework} canReview={canReview} onChanged={load} />)}
      {nextOffset !== null && <Button variant="outline" disabled={busy} onClick={() => void load(nextOffset)}>更多学生</Button>}
    </section>
  </div>
}

function Learner({ learner, homework, canReview, onChanged }: { learner: HomeworkLearner; homework: Homework; canReview: boolean; onChanged(): Promise<void> }) {
  const id = useId()
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const submission = learner.latestSubmission
  const act = async (work: () => Promise<unknown>) => {
    if (busy || !canReview) return
    setBusy(true); setError('')
    try { await work(); setReason(''); await onChanged() }
    catch (cause) { setError(userFacingError(cause, '验收未能保存，请刷新进度后重试。')) }
    finally { setBusy(false) }
  }
  return <article aria-label={learner.learnerName} className="space-y-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium">{learner.learnerName}</h4><Badge variant="secondary">{homeworkStatus[learner.status]}</Badge></div>
    {learner.missingCriteria.length > 0 && <div className="space-y-1 text-sm"><p className="font-medium">待核实或待巩固</p><ul className="list-disc space-y-1 ps-5 text-muted-foreground">{learner.missingCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></div>}
    {submission && <details className="space-y-3"><summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">查看作答和报告</summary><HomeworkSubmissionView submission={submission} /></details>}
    {submission && canReview && <form className="space-y-3" onSubmit={event => event.preventDefault()}>
      <div className="space-y-2"><Label htmlFor={`${id}-reason`}>验收意见</Label><Textarea id={`${id}-reason`} value={reason} required maxLength={4000} disabled={busy} placeholder="说明通过的依据，或需要改进的内容" onChange={event => setReason(event.target.value)} /></div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy || !reason.trim() || submission.reviewStatus === 'RETURNED'} onClick={() => void act(() => homeworkApi.review(homework.courseId, homework.id, { learnerId: learner.learnerId, expectedSubmissionId: submission.id, decision: 'RETURNED', reason: reason.trim() }))}>退回</Button>
        <Button type="button" disabled={busy || !reason.trim() || submission.reviewStatus !== 'PENDING'} onClick={() => void act(() => homeworkApi.review(homework.courseId, homework.id, { learnerId: learner.learnerId, expectedSubmissionId: submission.id, decision: 'PASSED', reason: reason.trim() }))}>通过</Button>
      </div>
    </form>}
    {learner.manualReview && <details className="space-y-3"><summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">已分享的复核证据</summary>
      <p className="text-xs text-muted-foreground">学生分享于 {new Date(learner.manualReview.sharedAt).toLocaleString('zh-CN')}</p>
      {learner.manualReview.evidence.map((text, index) => <blockquote key={index} className="whitespace-pre-wrap border-s-2 ps-3 text-sm">{text}</blockquote>)}
    </details>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </article>
}
