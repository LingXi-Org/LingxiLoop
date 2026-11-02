// Layout follows shadcn/ui dashboard-01 (section cards, chart card, data table), MIT © shadcn.
import { ArrowRightIcon, RefreshCwIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useApp } from '@/stores/app'
import type { LearningSpace } from '../contracts'
import type { ForumItem } from '../forum/contracts'
import { homeworkStatus } from '../homework/contracts'
import { OverviewSkeleton } from './LearningSkeletons'
import { OverviewBarChart } from './OverviewChartCard'
import { useCourseOverview } from './useCourseOverview'

const overviewStatus = { ...homeworkStatus, SUBMITTED: '已提交', FEEDBACK: '已有反馈' }
type OverviewStatus = keyof typeof overviewStatus
const statusTone: Partial<Record<OverviewStatus, string>> = {
  PASSED: 'border-success/30 text-success',
  PENDING: 'border-warning/30 text-warning',
  RETURNED: 'border-destructive/30 text-destructive',
}
const dateLabel = (value: string) => new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })

function openItem(item: ForumItem) {
  useApp.getState().setView('forum')
  const url = new URL(window.location.href)
  url.searchParams.set('post', item.id)
  url.searchParams.set('type', item.targetType)
  window.history.replaceState(null, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function StatusBadge({ status }: { status: OverviewStatus }) {
  return <Badge variant="outline" className={cn('font-normal', statusTone[status])}>{overviewStatus[status]}</Badge>
}

/** One KPI tile: label, figure, a short hint badge and a footer explaining the figure. */
function StatCard({ label, value, hint, footer, onSelect }: { label: string; value: number; hint?: string; footer: string; onSelect?: () => void }) {
  return <Card className="@container/card gap-3 py-5">
    <CardHeader className="px-5">
      <CardDescription>{label}</CardDescription>
      <CardTitle className="font-heading text-2xl font-semibold tabular-nums @[15rem]/card:text-3xl">{value}</CardTitle>
      {hint ? <CardAction><Badge variant="outline" className="font-normal text-muted-foreground">{hint}</Badge></CardAction> : null}
    </CardHeader>
    <CardFooter className="justify-between gap-2 px-5 text-sm text-muted-foreground">
      <span className="min-w-0 truncate">{footer}</span>
      {onSelect ? <Button variant="ghost" size="icon-sm" className="-me-2 shrink-0" aria-label={`查看${label}`} onClick={onSelect}><ArrowRightIcon /></Button> : null}
    </CardFooter>
  </Card>
}

function ListCard({ title, description, empty, children, action }: { title: string; description: string; empty: boolean; children: ReactNode; action?: ReactNode }) {
  return <Card className="min-w-0 gap-0 py-0">
    <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
      <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
      {action ? <CardAction>{action}</CardAction> : null}
    </CardHeader>
    <CardContent className="p-0">
      {empty ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">暂无记录，新的课程内容会显示在这里。</p> : <ul className="divide-y">{children}</ul>}
    </CardContent>
  </Card>
}

function ListRow({ title, meta, trailing, onSelect }: { title: string; meta?: string; trailing?: ReactNode; onSelect(): void }) {
  return <li>
    <button type="button" onClick={onSelect} className="flex w-full min-w-0 items-center gap-3 px-5 py-3 text-start transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {meta ? <span className="block truncate text-xs text-muted-foreground">{meta}</span> : null}
      </span>
      {trailing}
    </button>
  </li>
}

export function CourseOverviewDashboard({ space }: { space: LearningSpace }) {
  const { data, loading, error, refresh } = useCourseOverview(space)
  const teacher = space.perspective === 'teacher'
  if (loading && !data) return <OverviewSkeleton perspective={space.perspective} />
  if (!data) return <Alert><AlertDescription className="flex flex-wrap items-center gap-3">{error || '当前工作区还没有关联课程。'}<Button variant="outline" size="sm" onClick={refresh}>重新加载</Button></AlertDescription></Alert>

  const assignments = data.items.filter(item => item.kind === 'assignment')
  const shares = data.items.filter(item => item.kind === 'share')
  const records = data.homeworks.flatMap(({ item, detail: homework, learners }) => teacher
    ? learners.map(learner => ({ item, name: learner.learnerName, status: learner.status as OverviewStatus, submission: learner.latestSubmission }))
    : homework?.student ? [{ item, name: '我', status: homework.student.status as OverviewStatus, submission: homework.student.latestSubmission }] : [])
  const forumRecords = data.submissions.map(({ item, submission }) => ({ item, name: submission.learnerName, status: (submission.feedback.length ? 'FEEDBACK' : 'SUBMITTED') as OverviewStatus, submission }))
  const allRecords = [...records, ...forumRecords]
  const pending = allRecords.filter(row => row.status === 'PENDING')
  const attention = records.filter(row => row.status === 'RETURNED' || row.status === 'NOT_STARTED')
  const submitted = allRecords.filter(row => row.submission)
  const passed = records.filter(row => row.status === 'PASSED')
  const distribution = (Object.keys(overviewStatus) as OverviewStatus[]).map(status => ({ label: overviewStatus[status], count: allRecords.filter(row => row.status === status).length }))
  const students = data.members.filter(member => member.role === 'learner')
  const due = assignments.filter(item => item.status !== 'CLOSED' && item.dueAt && Date.parse(item.dueAt) >= Date.now()).sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!))
  const forum = () => useApp.getState().setView('forum')

  const stats = teacher ? [
    { label: '课程学生', value: students.length, footer: `${data.members.length - students.length} 位教师与助教`, onSelect: space.canManage ? () => useApp.getState().setView('course-members') : undefined },
    { label: '待审核', value: pending.length, hint: pending.length ? '需处理' : '已清空', footer: '等待验收的作业提交', onSelect: forum },
    { label: '需要关注', value: attention.length, footer: '已退回或尚未开始', onSelect: forum },
    { label: '课程内容', value: data.items.length, footer: `${assignments.length} 项作业 · ${shares.length} 条分享`, onSelect: forum },
  ] : [
    { label: '课程作业', value: assignments.length, footer: `${due.length} 项尚未截止`, onSelect: forum },
    { label: '即将截止', value: due.length, hint: due[0]?.dueAt ? `最近 ${dateLabel(due[0].dueAt)}` : undefined, footer: '按截止时间排序', onSelect: forum },
    { label: '已提交', value: submitted.length, footer: '包含作答与讨论提交', onSelect: forum },
    { label: '已通过', value: passed.length, footer: '教师验收通过的作业', onSelect: forum },
  ]

  const tableRows = (teacher ? allRecords : records).slice(0, 8)
  return <div className="ui-enter space-y-4" data-testid={teacher ? 'teacher-overview-dashboard' : 'learner-overview-dashboard'} aria-busy={loading}>
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{teacher ? '教学概况' : '学习概况'}</h2>
      <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}><RefreshCwIcon className={loading ? 'animate-spin motion-reduce:animate-none' : undefined} />刷新</Button>
    </div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

    <div className="grid gap-4 @min-[36rem]/learning-grid:grid-cols-2 @min-[64rem]/learning-grid:grid-cols-4">
      {stats.map(stat => <StatCard key={stat.label} {...stat} />)}
    </div>

    <div className="grid gap-4 @min-[56rem]/learning-grid:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card className="min-w-0 gap-4">
        <CardHeader className="px-5">
          <CardTitle className="text-sm font-semibold">作业状态分布</CardTitle>
          <CardDescription>{teacher ? '所有学生的作业与讨论提交' : '你的作业与讨论提交'} · 共 {allRecords.length} 条</CardDescription>
        </CardHeader>
        <CardContent className="px-5"><OverviewBarChart data={distribution} /></CardContent>
      </Card>
      {teacher
        ? <ListCard title="待审核" description="最早提交的作业优先处理" empty={!pending.length} action={pending.length ? <Button variant="ghost" size="sm" onClick={forum}>全部</Button> : undefined}>
            {pending.slice(0, 5).map(row => <ListRow key={`${row.item.id}:${row.name}`} title={row.item.title} meta={row.name} trailing={<StatusBadge status={row.status} />} onSelect={() => openItem(row.item)} />)}
          </ListCard>
        : <ListCard title="即将截止" description="按截止时间排序" empty={!due.length} action={due.length ? <Button variant="ghost" size="sm" onClick={forum}>全部</Button> : undefined}>
            {due.slice(0, 5).map(item => <ListRow key={item.id} title={item.title} meta={item.authorName} trailing={<span className="shrink-0 text-xs tabular-nums text-muted-foreground">{dateLabel(item.dueAt!)}</span>} onSelect={() => openItem(item)} />)}
          </ListCard>}
    </div>

    <Card className="min-w-0 gap-0 py-0">
      <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
        <CardTitle className="text-sm font-semibold">{teacher ? '最近提交' : '我的作业'}</CardTitle>
        <CardDescription>{teacher ? '学生作业与讨论的最新状态' : '每项作业的当前进展'}</CardDescription>
        <CardAction><Button variant="outline" size="sm" onClick={forum}>前往论坛</Button></CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {tableRows.length ? <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              {teacher ? <TableHead className="ps-5">成员</TableHead> : null}
              <TableHead className={teacher ? undefined : 'ps-5'}>作业</TableHead>
              <TableHead className="w-28">状态</TableHead>
              <TableHead className="w-24 pe-5 text-end"><span className="sr-only">操作</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableRows.map(row => <TableRow key={`${row.item.id}:${row.name}`}>
              {teacher ? <TableCell className="ps-5 font-medium">{row.name}</TableCell> : null}
              <TableCell className={cn('max-w-0 truncate', !teacher && 'ps-5 font-medium')}>{row.item.title}</TableCell>
              <TableCell><StatusBadge status={row.status} /></TableCell>
              <TableCell className="pe-5 text-end"><Button variant="ghost" size="sm" onClick={() => openItem(row.item)}>查看</Button></TableCell>
            </TableRow>)}
          </TableBody>
        </Table> : <p className="px-5 py-10 text-center text-sm text-muted-foreground">暂无记录，新的课程内容会显示在这里。</p>}
      </CardContent>
    </Card>
  </div>
}
