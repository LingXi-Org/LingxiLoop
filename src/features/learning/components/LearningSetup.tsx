import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useApp } from '@/stores/app'
import { learningApi } from '../api'
import type { LearningCourse, LearningObjective } from '../contracts'

export function Onboarding({ onCreated }: { onCreated: () => Promise<void> }) {
  const [title, setTitle] = useState('我的学习课程')
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai')
  const [quietStart, setQuietStart] = useState('22:00')
  const [quietEnd, setQuietEnd] = useState('08:00')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      const course = await learningApi.createCourse({ name: title })
      await learningApi.setNotificationPreferences({
        projectId: course.projectId, timezone, dailyTime: '19:00', weeklyDay: 1, quietStart, quietEnd,
        inAppEnabled: true, emailEnabled: false,
      })
      await onCreated()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl items-center px-5 py-10">
      <Card className="w-full">
        <CardHeader>
          <p className="text-xs font-medium text-primary">学习中心</p>
          <CardTitle className="text-2xl">建立你的第一个课程空间</CardTitle>
          <CardDescription className="max-w-xl leading-6">
            课程把学习目标、学习室、练习证据与掌握度连成一个闭环。教学智能体可以协助规划并开展形成性评价，发布内容与确认高阶掌握仍由教师负责。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="课程名称" className="md:col-span-2"><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
            <Field label="时区" className="md:col-span-2"><Input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></Field>
            <Field label="安静时段开始"><Input type="time" value={quietStart} onChange={(event) => setQuietStart(event.target.value)} /></Field>
            <Field label="安静时段结束"><Input type="time" value={quietEnd} onChange={(event) => setQuietEnd(event.target.value)} /></Field>
          </div>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-xs text-muted-foreground">应用内提醒默认开启；邮件可稍后自行订阅。课程会自动创建一对一项目与 Study Room。</p>
            <Button disabled={busy || !title.trim()} onClick={() => void create()}>{busy ? '正在创建…' : '创建课程'}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function TeacherComposer({ course, objectives, onChanged }: {
  course: LearningCourse
  objectives: LearningObjective[]
  onChanged: () => Promise<void>
}) {
  const [objectiveTitle, setObjectiveTitle] = useState('')
  const [criteria, setCriteria] = useState('')
  const [activityTitle, setActivityTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [error, setError] = useState('')
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card size="sm" className="xl:col-span-2">
        <CardHeader><CardTitle>课程成员</CardTitle><CardDescription>教师与学习者统一通过 canonical Course 邀请和成员管理维护。</CardDescription></CardHeader>
        <CardContent><Button variant="secondary" onClick={() => useApp.getState().setView('management')}>打开课程管理</Button></CardContent>
      </Card>
      <Card size="sm">
        <CardHeader><CardTitle>新增学习目标</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input value={objectiveTitle} onChange={(event) => setObjectiveTitle(event.target.value)} placeholder="目标标题" />
          <Textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} placeholder="可检查的成功标准" className="min-h-20" />
          <Button disabled={!course.courseId} onClick={() => course.courseId && void learningApi.createObjectives(course.courseId, [{ title: objectiveTitle, successCriteria: criteria, targetLevel: 3 }]).then(async () => {
            setObjectiveTitle(''); setCriteria(''); await onChanged()
          }).catch((reason) => setError(String(reason)))}>保存目标</Button>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader><CardTitle>创建活动草稿</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input value={activityTitle} onChange={(event) => setActivityTitle(event.target.value)} placeholder="活动标题" />
          <Textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="学习者任务说明" className="min-h-20" />
          <Button disabled={!course.courseId} onClick={() => course.courseId && void learningApi.createActivity(course.courseId, {
            title: activityTitle, instructions, type: 'PRACTICE', evaluationMode: 'AGENT_FORMATIVE',
            targetLevel: 3, rubric: [], objectiveIds: objectives[0] ? [objectives[0].id] : [],
          }).then(async () => {
            setActivityTitle(''); setInstructions(''); await onChanged()
          }).catch((reason) => setError(String(reason)))}>保存草稿</Button>
        </CardContent>
      </Card>
      {error && <Alert variant="destructive" className="xl:col-span-2"><AlertDescription>{error}</AlertDescription></Alert>}
    </div>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`grid gap-2 text-sm font-medium ${className ?? ''}`}>{label}{children}</label>
}
