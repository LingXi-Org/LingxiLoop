import {
  Archive02Icon,
  ArrowRight01Icon,
  BookOpen01Icon,
  Building03Icon,
  Copy01Icon,
  Delete02Icon,
  File01Icon,
  PlusSignIcon,
  UserAdd01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { companiesApi } from '@/features/companies/api'
import type { ApiCompanyMember, ApiCompanyProfile } from '@/features/companies/contracts'
import { useConversations } from '@/features/conversations/store'
import { EducationIntegrationCapabilities } from '@/features/education/components/EducationIntegrationCapabilities'
import { EnterpriseIntegrationCapabilities } from '@/features/education/components/EnterpriseIntegrationCapabilities'
import { knowledgeApi } from '@/features/knowledge/api'
import { learningApi } from '@/features/learning/api'
import { CourseAvatar } from '@/features/learning/components/CourseAvatar'
import type { ApiCourse, ApiCourseMember, ApiProjectInvitation } from '@/features/learning/contracts'
import { projectLifecycleApi } from '@/features/projects/api'
import { notifyAction, toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { InvitePeopleModal } from './InvitePeopleModal'

export type CourseManagementSection = 'courses' | 'organization' | 'projects'

export function CompanyCourseManagement({ section }: { section: CourseManagementSection }) {
  const companyId = useAuth((state) => state.activeCompanyId)
  const companyRole = useAuth((state) => state.companies.find((company) => company.id === state.activeCompanyId)?.role ?? 'member')
  const isAdmin = companyRole === 'owner' || companyRole === 'admin'
  const activeSection = isAdmin ? section : 'courses'
  const [profile, setProfile] = useState<ApiCompanyProfile | null>(null)
  const [courses, setCourses] = useState<ApiCourse[]>([])
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof knowledgeApi.listProjects>>>([])
  const [members, setMembers] = useState<ApiCompanyMember[]>([])
  const [selectedCourse, setSelectedCourse] = useState<ApiCourse | null>(null)
  const [courseMembers, setCourseMembers] = useState<ApiCourseMember[]>([])
  const [invitations, setInvitations] = useState<ApiProjectInvitation[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createdLink, setCreatedLink] = useState<string | null>(null)
  const [companyInviteOpen, setCompanyInviteOpen] = useState(false)
  const canCreateCourse = isAdmin || courses.some((course) => course.status === 'ACTIVE' && course.courseRole === 'teacher')

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [courseRows, projectRows, company] = await Promise.all([
        learningApi.listCourses(), knowledgeApi.listProjects(), companiesApi.getCompany(companyId),
      ])
      setCourses(courseRows)
      setProjects(projectRows)
      setProfile(company)
      setMembers(isAdmin ? await companiesApi.listCompanyMembers(companyId) : [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [companyId, isAdmin])

  useEffect(() => { void load() }, [load])

  const openCourse = async (course: ApiCourse) => {
    setSelectedCourse(course)
    setCreatedLink(null)
    setError(null)
    if (!course.canManage) {
      setCourseMembers([])
      setInvitations([])
      return
    }
    try {
      const [memberRows, invitationRows] = await Promise.all([
        learningApi.listCourseMembers(course.id), learningApi.listProjectInvitations(course.projectId),
      ])
      setCourseMembers(memberRows)
      setInvitations(invitationRows)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const enterCourse = async (course: ApiCourse) => {
    if (!companyId) return
    setWorkspaceSession({ companyId, projectId: course.projectId })
    await useConversations.getState().reload()
    useApp.getState().selectConversation(course.studyRoomId)
    useApp.getState().setView('conversations')
  }

  const createCourse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = event.currentTarget
    const data = new FormData(form)
    try {
      const course = await toastAction(learningApi.createCourse({
        name: String(data.get('name') ?? ''),
        description: String(data.get('description') ?? ''),
      }), {
        loading: '正在创建课程与 Study Room', success: '课程已创建', error: '创建课程失败',
      })
      form.reset()
      await load()
      await openCourse(course)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const createInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedCourse) return
    setBusy(true)
    setError(null)
    const form = event.currentTarget
    const data = new FormData(form)
    try {
      const invitation = await toastAction(learningApi.createProjectInvitation(selectedCourse.projectId, {
        email: String(data.get('email') ?? '').trim() || null,
        note: String(data.get('note') ?? '').trim() || null,
        expiresInDays: Number(data.get('expiresInDays') ?? 7),
        maxUses: Number(data.get('maxUses') ?? 1),
      }), {
        loading: '正在创建课程邀请', success: '课程邀请已创建', error: '创建课程邀请失败',
      })
      setCreatedLink(invitation.url)
      form.reset()
      await openCourse(selectedCourse)
      setCreatedLink(invitation.url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const updateCourseMemberRole = async (member: ApiCourseMember, role: 'teacher' | 'learner') => {
    if (!selectedCourse || role === member.role) return
    if (!await confirmSensitiveAction({
      title: '更改课程成员角色？',
      description: `${member.name} 的课程权限将从 ${member.role} 调整为 ${role}。`,
      confirmLabel: '更改角色',
      tone: 'warning',
    })) return
    try {
      await toastAction(learningApi.updateCourseMember(selectedCourse.id, member.id, role), {
        loading: '正在更新课程角色', success: '课程角色已更新', error: '更新课程角色失败', description: member.name,
      })
      await openCourse(selectedCourse)
    } catch { /* toast owns the visible error state */ }
  }

  const updateCompanyMemberRole = async (member: ApiCompanyMember, role: 'admin' | 'member') => {
    if (!profile || role === member.role) return
    if (!await confirmSensitiveAction({
      title: '更改组织成员角色？',
      description: `${member.name} 的组织权限将从 ${member.role} 调整为 ${role}。`,
      confirmLabel: '更改角色',
      tone: 'warning',
    })) return
    try {
      await toastAction(companiesApi.updateCompanyMember(profile.id, member.id, role), {
        loading: '正在更新组织角色', success: '组织角色已更新', error: '更新组织角色失败', description: member.name,
      })
      await load()
    } catch { /* toast owns the visible error state */ }
  }

  const removeCourseMemberWithConfirmation = async (member: ApiCourseMember) => {
    if (!selectedCourse) return
    if (!await confirmSensitiveAction({
      title: '移除课程成员？',
      description: `${member.name} 将失去这门课程及 Study Room 的访问权限。`,
      confirmLabel: '移除成员',
      tone: 'destructive',
    })) return
    try {
      await toastAction(learningApi.removeCourseMember(selectedCourse.id, member.id), {
        loading: '正在移除课程成员', success: '课程成员已移除', error: '移除课程成员失败', description: member.name,
      })
      await openCourse(selectedCourse)
    } catch { /* toast owns the visible error state */ }
  }

  const removeCompanyMemberWithConfirmation = async (member: ApiCompanyMember) => {
    if (!profile) return
    if (!await confirmSensitiveAction({
      title: '移除组织成员？',
      description: `${member.name} 将失去该组织及其工作区的访问权限。`,
      confirmLabel: '移除成员',
      tone: 'destructive',
    })) return
    try {
      await toastAction(companiesApi.removeCompanyMember(profile.id, member.id), {
        loading: '正在移除组织成员', success: '组织成员已移除', error: '移除组织成员失败', description: member.name,
      })
      await load()
    } catch { /* toast owns the visible error state */ }
  }

  const advanceCourseLifecycleWithConfirmation = async () => {
    if (!selectedCourse) return
    const next = selectedCourse.status === 'ACTIVE'
      ? { label: '结束课程', description: `“${selectedCourse.name}”将停止新邀请、新活动和新 Case。`, run: projectLifecycleApi.end }
      : selectedCourse.status === 'COURSE_ENDED'
        ? { label: '进入只读', description: `“${selectedCourse.name}”将仅允许读取、导出和生命周期操作。`, run: projectLifecycleApi.enterReadOnly }
        : selectedCourse.status === 'READ_ONLY'
          ? { label: '归档课程', description: `“${selectedCourse.name}”将归档，历史内容继续保留。`, run: projectLifecycleApi.archive }
          : null
    if (!next) return
    if (!await confirmSensitiveAction({
      title: `${next.label}？`,
      description: next.description,
      confirmLabel: next.label,
      tone: selectedCourse.status === 'READ_ONLY' ? 'destructive' : 'warning',
    })) return
    try {
      await toastAction(next.run(selectedCourse.projectId), {
        loading: `正在${next.label}`, success: `${next.label}成功`, error: `${next.label}失败`,
      })
      setSelectedCourse(null)
      await load()
    } catch { /* toast owns the visible error state */ }
  }

  const revokeProjectInvitationWithConfirmation = async (invitation: ApiProjectInvitation) => {
    if (!selectedCourse) return
    if (!await confirmSensitiveAction({
      title: '撤销课程邀请？',
      description: `${invitation.email ?? '公开邀请链接'} 将立即失效。`,
      confirmLabel: '撤销邀请',
      tone: 'destructive',
    })) return
    try {
      await toastAction(learningApi.revokeProjectInvitation(selectedCourse.projectId, invitation.id), {
        loading: '正在撤销课程邀请', success: '课程邀请已撤销', error: '撤销课程邀请失败',
      })
      await openCourse(selectedCourse)
    } catch { /* toast owns the visible error state */ }
  }

  const saveCompany = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!profile) return
    const data = new FormData(event.currentTarget)
    try {
      await toastAction(companiesApi.updateCompany(profile.id, {
        name: String(data.get('name')),
        description: String(data.get('description')),
      }), {
        loading: '正在保存组织资料', success: '组织资料已保存', error: '保存组织资料失败',
      })
      await load()
    } catch { /* toast owns the visible error state */ }
  }

  return (
    <div className="@container/course flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--im-divider-weak)] px-4">
        <div className="min-w-0">
          <h1 className="truncate font-heading text-sm font-medium">
            {activeSection === 'courses' ? '课程' : activeSection === 'projects' ? 'Projects' : '组织'}
          </h1>
        </div>
        {activeSection === 'organization' && isAdmin && profile && (
          <Button type="button" size="sm" onClick={() => setCompanyInviteOpen(true)}>
            <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={2} data-icon="inline-start" />组织邀请
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 @min-[48rem]/course:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {error && <Alert variant="destructive"><AlertTitle>课程管理暂不可用</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

          {loading && courses.length === 0 ? (
            <div className="grid gap-4 @min-[48rem]/course:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-40 rounded-4xl" />)}
            </div>
          ) : activeSection === 'courses' ? (
            <div className="grid items-start gap-6 @min-[48rem]/course:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <div className="space-y-4">
                {canCreateCourse && (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />新建课程</CardTitle>
                      <CardDescription>创建课程时会同时建立专属 Study Room。</CardDescription>
                    </CardHeader>
                    <form onSubmit={createCourse}>
                      <CardContent>
                        <FieldGroup className="gap-4">
                          <Field><FieldLabel htmlFor="course-name">课程名称</FieldLabel><Input id="course-name" name="name" required maxLength={80} /></Field>
                          <Field><FieldLabel htmlFor="course-description">课程说明</FieldLabel><Textarea id="course-description" name="description" rows={2} /><FieldDescription>可选，最多描述课程主题与目标。</FieldDescription></Field>
                        </FieldGroup>
                      </CardContent>
                      <CardFooter className="mt-4"><Button disabled={busy} className="w-full">创建课程与 Study Room</Button></CardFooter>
                    </form>
                  </Card>
                )}

                {courses.length === 0 ? (
                  <Empty className="border">
                    <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={BookOpen01Icon} strokeWidth={2} /></EmptyMedia><EmptyTitle>还没有课程</EmptyTitle><EmptyDescription>创建课程后，它会出现在这里。</EmptyDescription></EmptyHeader>
                  </Empty>
                ) : (
                  <ItemGroup className="gap-3">
                    {courses.map((course) => {
                      const active = selectedCourse?.id === course.id
                      return (
                        <Item
                          key={course.id}
                          variant="outline"
                          role="button"
                          tabIndex={0}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => void openCourse(course)}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return
                            event.preventDefault()
                            void openCourse(course)
                          }}
                          className={active ? 'border-ring bg-sidebar-accent' : 'cursor-pointer hover:bg-sidebar-accent'}
                        >
                          <ItemMedia><CourseAvatar courseId={course.id} title={course.name} /></ItemMedia>
                          <ItemContent className="min-w-0">
                            <ItemTitle className="w-full justify-between"><span className="truncate">{course.name}</span><Badge variant="outline">{course.status}</Badge></ItemTitle>
                            <ItemDescription>{course.description || '暂无说明'}</ItemDescription>
                            <p className="text-xs text-muted-foreground">{course.courseRole ?? course.companyRole} · {course.memberCount} 位成员</p>
                          </ItemContent>
                          <ItemActions>
                            <Button type="button" size="sm" onClick={(event) => { event.stopPropagation(); void enterCourse(course) }}>
                              进入 Study Room<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} data-icon="inline-end" />
                            </Button>
                          </ItemActions>
                        </Item>
                      )
                    })}
                  </ItemGroup>
                )}
              </div>

              <Card className="min-h-64">
                {!selectedCourse ? (
                  <Empty className="border-0">
                    <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} /></EmptyMedia><EmptyTitle>选择一门课程</EmptyTitle><EmptyDescription>查看成员、邀请和课程生命周期。</EmptyDescription></EmptyHeader>
                  </Empty>
                ) : (
                  <>
                    <CardHeader>
                      <div className="flex min-w-0 items-center gap-3">
                        <CourseAvatar courseId={selectedCourse.id} title={selectedCourse.name} size="lg" />
                        <div className="min-w-0"><CardTitle className="truncate">{selectedCourse.name}</CardTitle><CardDescription className="truncate">Project: {selectedCourse.projectId}</CardDescription></div>
                      </div>
                      {selectedCourse.canManage && ['ACTIVE', 'COURSE_ENDED', 'READ_ONLY'].includes(selectedCourse.status) && (
                        <CardAction><Button type="button" variant="outline" size="icon-sm" aria-label="推进课程生命周期" onClick={() => void advanceCourseLifecycleWithConfirmation()}><HugeiconsIcon icon={Archive02Icon} strokeWidth={2} /></Button></CardAction>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {selectedCourse.canManage && (
                        <>
                          <section className="space-y-3" aria-labelledby="course-members-title">
                            <h2 id="course-members-title" className="text-sm font-medium">课程成员</h2>
                            <ItemGroup className="gap-2">
                              {courseMembers.map((member) => (
                                <Item key={member.id} size="sm" variant="muted">
                                  <ItemContent className="min-w-0"><ItemTitle>{member.name}</ItemTitle><ItemDescription>{member.email}</ItemDescription></ItemContent>
                                  <ItemActions>
                                    <Select value={member.role} onValueChange={(role) => void updateCourseMemberRole(member, role as 'teacher' | 'learner')}>
                                      <SelectTrigger aria-label={`更改 ${member.name} 的课程角色`} className="w-28"><SelectValue /></SelectTrigger>
                                      <SelectContent><SelectItem value="teacher">teacher</SelectItem><SelectItem value="learner">learner</SelectItem></SelectContent>
                                    </Select>
                                    <Button type="button" variant="destructive" size="icon-sm" aria-label={`移除 ${member.name}`} onClick={() => void removeCourseMemberWithConfirmation(member)}><HugeiconsIcon icon={Delete02Icon} strokeWidth={2} /></Button>
                                  </ItemActions>
                                </Item>
                              ))}
                            </ItemGroup>
                          </section>

                          {selectedCourse.status === 'ACTIVE' && (
                            <form onSubmit={createInvite} className="space-y-4 border-t border-[var(--im-divider-weak)] pt-5">
                              <div><h2 className="text-sm font-medium">创建 Student Project 邀请</h2><p className="mt-1 text-sm text-muted-foreground">可限制邮箱、有效期和使用次数。</p></div>
                              <FieldGroup className="gap-4">
                                <Field><FieldLabel htmlFor="course-invite-email">限制邮箱</FieldLabel><Input id="course-invite-email" name="email" type="email" placeholder="可选" /></Field>
                                <div className="grid grid-cols-2 gap-3">
                                  <Field><FieldLabel htmlFor="course-invite-days">有效天数</FieldLabel><Input id="course-invite-days" name="expiresInDays" type="number" min="1" max="30" defaultValue="7" /></Field>
                                  <Field><FieldLabel htmlFor="course-invite-uses">使用次数</FieldLabel><Input id="course-invite-uses" name="maxUses" type="number" min="1" max="100" defaultValue="1" /></Field>
                                </div>
                                <Field><FieldLabel htmlFor="course-invite-note">备注</FieldLabel><Input id="course-invite-note" name="note" placeholder="可选" /></Field>
                              </FieldGroup>
                              <Button disabled={busy} className="w-full"><HugeiconsIcon icon={UserAdd01Icon} strokeWidth={2} data-icon="inline-start" />生成邀请链接</Button>
                            </form>
                          )}

                          {createdLink && (
                            <Button type="button" variant="secondary" className="w-full justify-start" onClick={() => void navigator.clipboard.writeText(createdLink).then(() => notifyAction({ title: '邀请链接已复制' }))}>
                              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} data-icon="inline-start" /><span className="truncate">{createdLink}</span>
                            </Button>
                          )}

                          <ItemGroup className="gap-2">
                            {invitations.map((invitation) => (
                              <Item key={invitation.id} size="xs" variant="muted">
                                <ItemContent><ItemTitle>{invitation.email ?? '公开链接'}</ItemTitle><ItemDescription>{invitation.role} · {invitation.useCount}/{invitation.maxUses}</ItemDescription></ItemContent>
                                <Badge variant="outline">{invitation.status}</Badge>
                                {invitation.status === 'active' && <Button type="button" variant="destructive" size="xs" onClick={() => void revokeProjectInvitationWithConfirmation(invitation)}>撤销</Button>}
                              </Item>
                            ))}
                          </ItemGroup>
                        </>
                      )}
                    </CardContent>
                  </>
                )}
              </Card>
            </div>
          ) : activeSection === 'projects' ? (
            projects.length === 0 ? (
              <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={File01Icon} strokeWidth={2} /></EmptyMedia><EmptyTitle>还没有 Projects</EmptyTitle><EmptyDescription>工作区项目创建后会显示在这里。</EmptyDescription></EmptyHeader></Empty>
            ) : (
              <div className="grid gap-4 @min-[40rem]/course:grid-cols-2">
                {projects.map((project) => (
                  <Card key={project.id} size="sm">
                    <CardHeader><CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={File01Icon} strokeWidth={2} />{project.name}</CardTitle><CardDescription>{project.description || ({ PERSONAL_LEARNING: '个人学习 Project', TEACHING: '教学 Project', INSTITUTIONAL_COURSE: '学校课程 Project' } as const)[project.kind]}</CardDescription><CardAction><Badge variant="outline">{project.status}</Badge></CardAction></CardHeader>
                    <CardContent className="text-sm text-muted-foreground">{project.conversationCount} conversations</CardContent>
                  </Card>
                ))}
              </div>
            )
          ) : isAdmin && profile ? (
            <div className="space-y-6">
              <div className="grid items-start gap-6 @min-[48rem]/course:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={Building03Icon} strokeWidth={2} />组织资料</CardTitle><CardDescription>更新组织名称和对成员可见的说明。</CardDescription></CardHeader>
                  <form onSubmit={saveCompany}>
                    <CardContent><FieldGroup className="gap-4"><Field><FieldLabel htmlFor="company-name">组织名称</FieldLabel><Input id="company-name" name="name" defaultValue={profile.name} /></Field><Field><FieldLabel htmlFor="company-slug">组织标识</FieldLabel><Input id="company-slug" value={profile.slug} readOnly /></Field><Field><FieldLabel htmlFor="company-description">组织说明</FieldLabel><Textarea id="company-description" name="description" rows={4} defaultValue={profile.description} /></Field></FieldGroup></CardContent>
                    <CardFooter className="mt-5"><Button className="w-full">保存</Button></CardFooter>
                  </form>
                </Card>
                <Card>
                  <CardHeader><CardTitle>组织成员</CardTitle><CardDescription>{members.length} 位成员</CardDescription></CardHeader>
                  <CardContent>
                    <ItemGroup className="gap-2">
                      {members.map((member) => (
                        <Item key={member.id} size="sm" variant="muted">
                          <ItemContent className="min-w-0"><ItemTitle>{member.name}</ItemTitle><ItemDescription>{member.email} · {member.courses.length} courses</ItemDescription></ItemContent>
                          {member.role === 'owner' ? <Badge>owner</Badge> : (
                            <ItemActions>
                              <Select value={member.role} onValueChange={(role) => void updateCompanyMemberRole(member, role as 'admin' | 'member')}>
                                <SelectTrigger aria-label={`更改 ${member.name} 的组织角色`} className="w-28"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="admin">admin</SelectItem><SelectItem value="member">member</SelectItem></SelectContent>
                              </Select>
                              <Button type="button" variant="destructive" size="icon-sm" aria-label={`移除 ${member.name}`} onClick={() => void removeCompanyMemberWithConfirmation(member)}><HugeiconsIcon icon={Delete02Icon} strokeWidth={2} /></Button>
                            </ItemActions>
                          )}
                        </Item>
                      ))}
                    </ItemGroup>
                  </CardContent>
                </Card>
              </div>
              <EducationIntegrationCapabilities />
              <EnterpriseIntegrationCapabilities />
            </div>
          ) : null}
        </div>
      </div>
      {companyInviteOpen && profile && <InvitePeopleModal companyId={profile.id} companyName={profile.name} onClose={() => setCompanyInviteOpen(false)} />}
    </div>
  )
}
