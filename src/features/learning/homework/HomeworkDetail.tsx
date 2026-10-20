import { ForumBody } from '../forum/ForumBody'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { userFacingError } from '@/lib/userFacingError'
import type { LearningSpace } from '../contracts'
import type { ForumItem } from '../forum/contracts'
import { homeworkApi } from './api'
import type { HomeworkDetail as Detail, HomeworkSubmission } from './contracts'
import { HomeworkSubmissionView } from './HomeworkReport'
import { HomeworkStudent } from './HomeworkStudent'
import { HomeworkTeacher } from './HomeworkTeacher'

export function HomeworkDetail({ space, item, onChanged }: { space: LearningSpace; item: ForumItem; onChanged(): void }) {
  const [detail, setDetail] = useState<Detail | null>(null), [error, setError] = useState('')
  const epoch = useRef(0)
  const load = useCallback(async () => {
    const request = ++epoch.current
    try {
      const next = await homeworkApi.detail(space.courseId!, item.id)
      if (request === epoch.current) { setDetail(next); setError('') }
    } catch (reason) { if (request === epoch.current) setError(userFacingError(reason, '作业暂时无法加载，请重试。')) }
  }, [space.courseId, item.id])
  useEffect(() => { void load(); return () => { epoch.current++ } }, [load])
  useEffect(() => {
    if (detail?.student?.reportStatus !== 'PENDING') return
    const timer = setInterval(() => { void load() }, 3000)
    return () => clearInterval(timer)
  }, [detail?.student?.reportStatus, load])
  const homework = detail?.homework
  return <div className="space-y-5 pt-5 [overflow-wrap:anywhere]">
    {error && <p role="alert" className="text-sm text-destructive">{error}<Button variant="link" onClick={() => void load()}>重新加载</Button></p>}
    {!detail && !error && <p role="status">正在加载作业…</p>}
    {homework && <>
      <section aria-label="作业要求" className="space-y-4">
        <div className="space-y-2"><h3 className="font-semibold">验收标准</h3><>{homework.criteriaDocument ? <ForumBody content={homework.criteria.join("\n")} document={homework.criteriaDocument}/> : <ol className="list-decimal space-y-2 ps-5 text-sm">{homework.criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ol>}</></div>
        {homework.dueAt && <p className="text-sm text-muted-foreground">截止：{new Date(homework.dueAt).toLocaleString('zh-CN')}。截止后仍可学习，提交会标记为迟交。</p>}
        {homework.status === 'CLOSED' && <Badge variant="outline">已关闭</Badge>}
      </section>
      {detail.teacher ? <HomeworkTeacher homework={homework} canReview={space.canReview} canEdit={space.canEditContent} onUpdated={next => { epoch.current++; setDetail(next); onChanged() }} />
        : detail.student && <HomeworkStudent key={homework.id} homework={homework} student={detail.student} space={space} onUpdated={student => { epoch.current++; setDetail(previous => previous ? { ...previous, student } : previous) }} onSubmitted={async () => { await load(); onChanged() }} onUploading={() => {}} onRefresh={load} />}
      {!detail.teacher && <History key={detail.student?.latestSubmission?.id} courseId={homework.courseId} homeworkId={homework.id} teacher={detail.teacher} />}
    </>}
  </div>
}

function History({ courseId, homeworkId, teacher }: { courseId: string; homeworkId: string; teacher: boolean }) {
  const [items, setItems] = useState<HomeworkSubmission[]>([]), [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const load = async (offset = 0) => {
    setBusy(true); setError('')
    try { const page = await homeworkApi.submissions(courseId, homeworkId, offset); setItems(previous => offset ? [...previous, ...page.items] : page.items); setNextOffset(page.nextOffset); setLoaded(true) }
    catch (reason) { setError(userFacingError(reason, '提交记录加载失败，请重试。')) }
    finally { setBusy(false) }
  }
  return <section aria-label="提交历史" className="space-y-3 border-t pt-4">
    <Button variant="outline" disabled={busy} onClick={() => void load()}>{loaded ? '刷新提交历史' : '查看提交历史'}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loaded && !items.length && <p className="text-sm text-muted-foreground">还没有提交记录。</p>}
    {items.map(submission => <details key={submission.id} className="space-y-3"><summary className="cursor-pointer rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-ring">{teacher ? `${submission.learnerName} · ` : ''}第 {submission.version} 次提交 · {new Date(submission.submittedAt).toLocaleString('zh-CN')}</summary><HomeworkSubmissionView submission={submission} /></details>)}
    {nextOffset !== null && <Button variant="outline" disabled={busy} onClick={() => void load(nextOffset)}>更多提交记录</Button>}
  </section>
}
