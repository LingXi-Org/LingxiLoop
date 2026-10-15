import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LearningSpace } from '../contracts'
import type { ForumItem } from '../forum/contracts'
import { homeworkStatus } from '../homework/contracts'
import { useApp } from '@/stores/app'
import { OverviewSkeleton } from './LearningSkeletons'
import { OverviewBarChart, OverviewChartCard, OverviewDonutChart } from './OverviewChartCard'
import { useCourseOverview } from './useCourseOverview'

const overviewStatus = { ...homeworkStatus, SUBMITTED: '已提交', FEEDBACK: '已有反馈' }

function openItem(item: ForumItem) {
  useApp.getState().setView('forum')
  const url = new URL(window.location.href)
  url.searchParams.set('post', item.id)
  url.searchParams.set('type', item.targetType)
  window.history.replaceState(null, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
function ItemList({ items }: { items: ForumItem[] }) {
  return <div className="space-y-2">{items.length ? items.map(item => <Button key={`${item.targetType}:${item.id}`} variant="outline" className="h-auto w-full justify-between gap-3 p-3 text-start whitespace-normal" onClick={() => openItem(item)}>
    <span className="min-w-0 [overflow-wrap:anywhere]">{item.title}</span><span className="shrink-0 text-xs text-muted-foreground">{item.dueAt ? new Date(item.dueAt).toLocaleDateString('zh-CN') : '查看详情'}</span>
  </Button>) : <p className="py-6 text-sm text-muted-foreground">暂无记录，新的课程内容会显示在这里。</p>}</div>
}
export function CourseOverviewDashboard({ space }: { space: LearningSpace }) {
  const { data, loading, error, refresh } = useCourseOverview(space)
  const [detail, setDetail] = useState<string | null>(null)
  const teacher = space.perspective === 'teacher'
  if (loading && !data) return <OverviewSkeleton perspective={space.perspective} />
  if (!data) return <Alert><AlertDescription>{error || '当前工作区还没有关联课程。'}<Button variant="outline" size="sm" onClick={refresh}>重新加载</Button></AlertDescription></Alert>
  const assignments = data.items.filter(item => item.kind === 'assignment')
  const shares = data.items.filter(item => item.kind === 'share')
  const records = data.homeworks.flatMap(({ item, detail: homework, learners }) => teacher
    ? learners.map(learner => ({ item, name: learner.learnerName, status: learner.status, submission: learner.latestSubmission }))
    : homework.student ? [{ item, name: '我', status: homework.student.status, submission: homework.student.latestSubmission }] : [])
  const forumRecords = data.submissions.map(({ item, submission }) => ({ item, name: submission.learnerName, status: submission.feedback.length ? 'FEEDBACK' as const : 'SUBMITTED' as const, submission }))
  const allRecords = [...records, ...forumRecords]
  const pending = allRecords.filter(row => row.status === 'PENDING')
  const attention = records.filter(row => row.status === 'RETURNED' || row.status === 'NOT_STARTED')
  const submitted = allRecords.filter(row => row.submission)
  const distribution = Object.entries(overviewStatus).map(([status, label]) => ({ label, count: allRecords.filter(row => row.status === status).length }))
  const students = data.members.filter(member => member.role === 'learner')
  const due = assignments.filter(item => item.status !== 'CLOSED' && item.dueAt && Date.parse(item.dueAt) >= Date.now()).sort((a,b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!))
  const recordList = (rows: typeof allRecords) => <div className="space-y-2">{rows.length ? rows.map(row => <Button key={`${row.item.id}:${row.name}`} variant="outline" className="h-auto w-full justify-between gap-3 p-3 text-start whitespace-normal" onClick={() => openItem(row.item)}><span>{row.name} · {row.item.title}</span><Badge variant="secondary">{overviewStatus[row.status]}</Badge></Button>) : <p className="py-6 text-sm text-muted-foreground">暂无记录。</p>}</div>
  const chartProps = (key: string) => ({ open: detail === key, onOpenChange: (open: boolean) => setDetail(open ? key : null) })
  return <div className="ui-enter space-y-4 @min-[48rem]/learning-grid:space-y-6" data-testid={teacher ? 'teacher-overview-dashboard' : 'learner-overview-dashboard'} aria-busy={loading}>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="grid items-start gap-4 @min-[48rem]/learning-grid:grid-cols-3">
      <Card className="h-full"><CardHeader><CardTitle>{teacher ? '教学重点' : '接下来学什么'}</CardTitle></CardHeader><CardContent className="space-y-3">
        <Button variant="outline" className="w-full justify-between" onClick={() => setDetail(teacher ? 'reviews' : 'activities')}>{teacher ? '待审核作业' : '课程作业'}<Badge variant="secondary">{teacher ? pending.length : assignments.length}</Badge></Button>
        <Button variant="outline" className="w-full justify-between" onClick={() => useApp.getState().setView('forum')}>进入学习论坛<span>{data.items.length} 条内容</span></Button>
        <Button variant="ghost" onClick={refresh} disabled={loading}>刷新概览</Button>
      </CardContent></Card>
      <Card className="h-full"><CardHeader><CardTitle>{teacher ? '待审核评价' : '最近学习记录'}</CardTitle></CardHeader><CardContent>{recordList((teacher ? pending : submitted).slice(0, 3))}</CardContent></Card>
      <Card className="h-full"><CardHeader><CardTitle>{teacher ? '需要关注' : '即将截止'}</CardTitle></CardHeader><CardContent>{teacher ? recordList(attention.slice(0, 3)) : <ItemList items={due.slice(0, 3)} />}</CardContent></Card>
    </div>
    <div className="grid gap-4 @min-[48rem]/learning-grid:grid-cols-12">
      <OverviewChartCard title={teacher ? '评价审核' : '课程活动'} value={teacher ? `${pending.length} 项待审核` : `${assignments.length} 项作业`} description={teacher ? '查看作业验收与反馈' : '查看作业要求与完成进展'} className="@min-[48rem]/learning-grid:col-span-5" {...chartProps(teacher ? 'reviews' : 'activities')} chart={<OverviewDonutChart value={String(allRecords.length)} data={distribution} />}>
        {teacher ? recordList(allRecords) : <ItemList items={assignments} />}
      </OverviewChartCard>
      {teacher ? <OverviewChartCard title="课程学生" value={`${students.length} 名学生`} description="查看课程成员与作业进展" className="@min-[48rem]/learning-grid:col-span-7" {...chartProps('learners')} chart={<OverviewDonutChart value={String(students.length)} data={[{label:'学生',count:students.length},{label:'教师',count:data.members.length-students.length}]} />}>
        {students.length ? students.map(student => <div key={student.id} className="flex items-center justify-between border-b py-3"><span>{student.name}</span><Badge variant="outline">学生</Badge></div>) : <p>暂无学生。</p>}
        {space.canManage && <Button className="mt-4" onClick={() => useApp.getState().setView('course-members')}>管理成员与邀请</Button>}
      </OverviewChartCard> : <OverviewChartCard title="学习记录" value={`${submitted.length} 项已提交作业`} description="回顾作答、学习报告与教师反馈" className="@min-[48rem]/learning-grid:col-span-7" {...chartProps('evidence')} chart={<OverviewBarChart data={distribution} />}>{recordList(submitted)}</OverviewChartCard>}
      <OverviewChartCard title={teacher ? '学情分析' : '学习进展'} value={`${records.filter(row => row.status === 'PASSED').length} 项已通过`} description="当前作业的学习与验收状态" className="@min-[48rem]/learning-grid:col-span-7" {...chartProps('analysis')} chart={<OverviewBarChart layout="vertical" data={distribution} />}>{recordList(allRecords)}</OverviewChartCard>
      <OverviewChartCard title="课程内容" value={`${assignments.length} 项作业 · ${shares.length} 条分享`} description="查看课程作业与交流分享" className="@min-[48rem]/learning-grid:col-span-5" {...chartProps('content')} chart={<OverviewDonutChart value={String(data.items.length)} data={[{label:'作业',count:assignments.length},{label:'分享',count:shares.length}]} />}><ItemList items={data.items} /></OverviewChartCard>
    </div>
  </div>
}
