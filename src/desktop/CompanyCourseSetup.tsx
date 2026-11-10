import { BookOpen, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CourseCreateForm } from '@/features/learning/components/CourseCreateForm'
import { learningApi } from '@/features/learning/api'
import type { ApiCourse } from '@/features/learning/contracts'
import { useAuth } from '@/stores/auth'
import { authApi } from '@/auth/api'

export function CompanyCourseSetup({ companyName, companyId, onCreated }: {
  companyName: string; companyId: string; onCreated(course: ApiCourse): Promise<void>
}) {
  return <main className="h-dvh overflow-y-auto bg-background px-5 py-8 text-foreground sm:px-8 sm:py-14">
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <header className="flex items-center justify-between gap-4"><p className="min-w-0 break-words font-medium">{companyName}</p><Button variant="ghost" onClick={() => { useAuth.getState().clear(); void authApi.signOut().catch(() => undefined) }}><LogOut className="size-4" />退出登录</Button></header>
      <section className="space-y-6 rounded-2xl border bg-card p-5 sm:p-8">
        <div className="flex size-12 items-center justify-center rounded-xl bg-brand-surface text-brand"><BookOpen className="size-6" /></div>
        <div className="space-y-2"><h1 className="text-2xl font-semibold">先创建一门课程</h1><p className="text-sm leading-6 text-muted-foreground">你是公司管理员。创建课程后，即可安排教学内容、分配教师并邀请学生。</p></div>
        <ol className="grid gap-3 text-sm sm:grid-cols-3"><li>1. 填写课程信息</li><li>2. 添加课程教师</li><li>3. 邀请学生加入</li></ol>
        <CourseCreateForm create={input => learningApi.createCourse(input, companyId)} onCreated={onCreated} />
        <p className="text-sm leading-6 text-muted-foreground">创建后你会成为该课程的教师。其他教师加入公司后，可在课程的“成员与邀请”中添加；也可在公司后台“公司成员”中分别授权。</p>
      </section>
    </div>
  </main>
}
