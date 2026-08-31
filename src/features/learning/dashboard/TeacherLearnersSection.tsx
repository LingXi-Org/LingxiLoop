import { SearchIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress, ProgressLabel } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { userFacingError } from '@/lib/userFacingError'
import { learningApi } from '../api'
import type { LearningAttemptDetail, TeacherLearnerDetail, TeacherLearnerSummary } from '../contracts'
import { ASSISTANCE_LABELS, statusLabel } from '../components/learningDisplay'

const PAGE_SIZE = 20

function dateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('zh-CN') : '尚无记录'
}

export function TeacherLearnersSection({ projectId }: { projectId: string }) {
  const [learners, setLearners] = useState<TeacherLearnerSummary[]>([])
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const searchRef = useRef('')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [learnerId, setLearnerId] = useState<string | null>(null)

  useEffect(() => {
    setCursorStack([undefined])
    setPageIndex(0)
    setLearnerId(null)
    setQuery('')
    setSearch('')
    searchRef.current = ''
    setAttentionOnly(false)
  }, [projectId])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextSearch = query.trim()
      if (searchRef.current === nextSearch) return
      searchRef.current = nextSearch
      setSearch(nextSearch)
      setCursorStack([undefined])
      setPageIndex(0)
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void learningApi.listLearners(projectId, {
      cursor: cursorStack[pageIndex], limit: PAGE_SIZE, attentionOnly, search: search || undefined,
    })
      .then((page) => {
        if (!active) return
        setLearners(page.data)
        setNextCursor(page.nextCursor)
      })
      .catch((reason) => {
        if (active) setError(userFacingError(reason, '学习者列表暂时无法加载，请稍后重试。'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [attentionOnly, cursorStack, pageIndex, projectId, search])

  const nextPage = () => {
    if (!nextCursor) return
    setCursorStack((current) => [...current.slice(0, pageIndex + 1), nextCursor])
    setPageIndex((current) => current + 1)
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Card>
        <CardHeader><CardTitle>课程学习者</CardTitle><CardDescription>掌握等级、复习与尝试均来自学习者的真实学习记录。</CardDescription></CardHeader>
        <CardContent>
          {loading ? <ResourceSkeleton variant="table" count={6} label="正在加载课程学习者" /> : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="relative min-w-56 flex-1">
                  <HugeiconsIcon icon={SearchIcon} strokeWidth={2} className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索全部学习者" aria-label="搜索全部学习者" className="ps-9" />
                </div>
                <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-3xl bg-input/50 px-3 text-sm">
                  <Checkbox checked={attentionOnly} onCheckedChange={(checked) => { setAttentionOnly(checked === true); setCursorStack([undefined]); setPageIndex(0) }} />
                  只看需要关注
                </label>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>学习者</TableHead>
                    <TableHead>掌握等级</TableHead>
                    <TableHead>已验证目标</TableHead>
                    <TableHead>到期复习</TableHead>
                    <TableHead>证据尝试</TableHead>
                    <TableHead>最近尝试</TableHead>
                    <TableHead><span className="sr-only">操作</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {learners.map((learner) => (
                    <TableRow key={learner.learnerId}>
                      <TableCell><p className="font-medium">{learner.displayName}</p><p className="text-xs text-muted-foreground">{learner.email}</p>{learner.attentionReasons.length > 0 && <Badge variant="outline" className="mt-1">需要关注</Badge>}</TableCell>
                      <TableCell className="tabular-nums">掌握等级 {learner.averageLevel.toFixed(1)}</TableCell>
                      <TableCell className="tabular-nums">{learner.verifiedObjectives}</TableCell>
                      <TableCell className="tabular-nums">{learner.dueReviews}</TableCell>
                      <TableCell className="tabular-nums">{learner.attemptCount}</TableCell>
                      <TableCell>{dateTime(learner.lastAttemptAt)}</TableCell>
                      <TableCell><Button type="button" variant="outline" size="sm" onClick={() => setLearnerId(learner.learnerId)}>查看</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {learners.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{search || attentionOnly ? '没有找到符合条件的学习者。' : '这门课程还没有学习者记录。'}</p>}
              <Pagination className="mt-5">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious href="#" aria-disabled={pageIndex === 0} className={pageIndex === 0 ? 'pointer-events-none opacity-50' : undefined} onClick={(event) => { event.preventDefault(); if (pageIndex > 0) setPageIndex((current) => current - 1) }} />
                  </PaginationItem>
                  <PaginationItem><span className="px-3 text-sm text-muted-foreground">第 {pageIndex + 1} 页</span></PaginationItem>
                  <PaginationItem>
                    <PaginationNext href="#" aria-disabled={!nextCursor} className={!nextCursor ? 'pointer-events-none opacity-50' : undefined} onClick={(event) => { event.preventDefault(); nextPage() }} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </>
          )}
        </CardContent>
      </Card>
      {learnerId && <LearnerDetail projectId={projectId} learnerId={learnerId} onClose={() => setLearnerId(null)} />}
    </div>
  )
}

function LearnerDetail({ projectId, learnerId, onClose }: { projectId: string; learnerId: string; onClose(): void }) {
  const [detail, setDetail] = useState<TeacherLearnerDetail | null>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setDetail(null)
    setAttemptId(null)
    setLoading(true)
    setError('')
    void learningApi.getLearner(projectId, learnerId)
      .then((next) => { if (active) setDetail(next) })
      .catch((reason) => { if (active) setError(userFacingError(reason, '学习者详情暂时无法加载，请稍后重试。')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [learnerId, projectId])

  if (loading) return <Card><CardContent><ResourceSkeleton variant="detail" label="正在加载学习者详情" /></CardContent></Card>
  if (error || !detail) return <Alert variant="destructive"><AlertDescription>{error || '学习者详情暂不可用。'}</AlertDescription></Alert>

  return (
    <Card>
      <CardHeader>
        <CardTitle>{detail.learner.displayName}</CardTitle>
        <CardDescription>{detail.learner.email} · 加入于 {dateTime(detail.learner.joinedAt)}</CardDescription>
        <div className="justify-self-end"><Button type="button" variant="ghost" size="sm" onClick={onClose}>收起详情</Button></div>
      </CardHeader>
      <CardContent className="space-y-6">
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
              <TableBody>{detail.states.map((state) => <TableRow key={state.knowledgeUnitId}><TableCell className="font-medium">{state.title}</TableCell><TableCell>掌握等级 {state.level}</TableCell><TableCell><Badge variant="outline">{statusLabel(state.status)}</Badge></TableCell><TableCell>{dateTime(state.nextReviewAt)}</TableCell><TableCell>{dateTime(state.lastEvidenceAt)}</TableCell></TableRow>)}</TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">暂无学习目标状态。</p>}
        </section>
        <section className="space-y-3" aria-labelledby="learner-missions-title">
          <h3 id="learner-missions-title" className="font-heading text-base font-medium">学习任务</h3>
          {detail.missions.map((mission) => {
            const value = mission.totalSteps > 0 ? mission.completedSteps / mission.totalSteps * 100 : 0
            return <div key={mission.missionId} className="space-y-2 rounded-2xl bg-muted p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{mission.goal}</p><Badge variant="secondary">{statusLabel(mission.status)}</Badge></div><p className="text-xs text-muted-foreground">{mission.completedSteps}/{mission.totalSteps} 步</p><Progress value={value} aria-label={`${mission.goal} 已完成 ${mission.completedSteps}/${mission.totalSteps} 步`}><ProgressLabel className="sr-only">{mission.goal}</ProgressLabel></Progress></div>
          })}
          {detail.missions.length === 0 && <p className="text-sm text-muted-foreground">暂无学习任务记录。</p>}
        </section>
        <section className="space-y-3" aria-labelledby="learner-attempts-title">
          <h3 id="learner-attempts-title" className="font-heading text-base font-medium">学习证据</h3>
          {detail.attempts.map((attempt) => <div key={attempt.attemptId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3"><div><p className="font-medium">{attempt.title}</p><p className="mt-1 text-xs text-muted-foreground">{dateTime(attempt.submittedAt)} · {ASSISTANCE_LABELS[attempt.assistance] ?? '辅助方式待同步'} · {statusLabel(attempt.status)}</p></div><Button type="button" size="sm" variant="outline" onClick={() => setAttemptId(attempt.attemptId)}>查看证据</Button></div>)}
          {detail.attempts.length === 0 && <p className="text-sm text-muted-foreground">暂无学习证据记录。</p>}
        </section>
        {attemptId && <AttemptDetail projectId={projectId} attemptId={attemptId} onClose={() => setAttemptId(null)} />}
      </CardContent>
    </Card>
  )
}

function DetailMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl bg-muted p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-heading text-xl font-medium tabular-nums">{value}</p></div>
}

function AttemptDetail({ projectId, attemptId, onClose }: { projectId: string; attemptId: string; onClose(): void }) {
  const [detail, setDetail] = useState<LearningAttemptDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setDetail(null)
    setError('')
    void learningApi.getAttempt(projectId, attemptId)
      .then((next) => { if (active) setDetail(next) })
      .catch((reason) => { if (active) setError(userFacingError(reason, '证据详情暂时无法加载，请稍后重试。')) })
    return () => { active = false }
  }, [attemptId, projectId])

  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  if (!detail) return <ResourceSkeleton variant="detail" label="正在加载证据详情" />

  return (
    <div className="space-y-4 rounded-3xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-heading font-medium">{detail.source?.title ?? '学习证据'}</h4><p className="mt-1 text-xs text-muted-foreground">{dateTime(detail.submittedAt)} · {ASSISTANCE_LABELS[detail.assistance] ?? '辅助方式待同步'}</p></div><Button type="button" variant="ghost" size="sm" onClick={onClose}>收起证据</Button></div>
      {detail.evidence && <p className="text-sm text-muted-foreground">证据已于 {dateTime(detail.evidence.createdAt)} 记录。</p>}
      {detail.evaluations.map((evaluation) => <div key={evaluation.evaluationId} className="rounded-2xl bg-muted p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">评价结果：掌握等级 {evaluation.demonstratedLevel}</p><Badge variant="secondary">{statusLabel(evaluation.status)}</Badge></div>{evaluation.feedback && <p className="mt-2 text-sm text-muted-foreground">{evaluation.feedback}</p>}</div>)}
      {detail.evaluations.length === 0 && <p className="text-sm text-muted-foreground">这条证据还没有评价记录。</p>}
    </div>
  )
}
