import { IconArchive, IconBook2, IconCopy, IconPlus, IconTrash, IconUsers } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { companiesApi } from '@/features/companies/api'
import type { ApiCourse, ApiCourseInvitation, ApiCourseMember } from '@/api/contracts'
import type { ApiCompanyMember, ApiCompanyProfile } from '@/features/companies/contracts'
import { learningApi } from '@/api/learning'
import { InvitePeopleModal } from './InvitePeopleModal'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { useConversations } from '@/features/conversations/store'

type Tab = 'courses' | 'organization' | 'projects'

const field = 'w-full rounded-xl border border-hairline bg-panel px-3 py-2 text-[13px] text-ink outline-none focus:border-accent'
const button = 'rounded-xl px-3 py-2 text-[12px] font-semibold transition hover:brightness-95 disabled:opacity-50'

export function CompanyCourseManagement() {
  const companyId = useAuth((state) => state.activeCompanyId)
  const companyRole = useAuth((state) => state.companies.find((company) => company.id === state.activeCompanyId)?.role ?? 'member')
  const isAdmin = companyRole === 'owner' || companyRole === 'admin'
  const [tab, setTab] = useState<Tab>('courses')
  const [profile, setProfile] = useState<ApiCompanyProfile | null>(null)
  const [courses, setCourses] = useState<ApiCourse[]>([])
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof learningApi.listProjects>>>([])
  const [members, setMembers] = useState<ApiCompanyMember[]>([])
  const [selectedCourse, setSelectedCourse] = useState<ApiCourse | null>(null)
  const [courseMembers, setCourseMembers] = useState<ApiCourseMember[]>([])
  const [invitations, setInvitations] = useState<ApiCourseInvitation[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdLink, setCreatedLink] = useState<string | null>(null)
  const [companyInviteOpen, setCompanyInviteOpen] = useState(false)
  const canCreateCourse = isAdmin || courses.some((course) => course.status === 'active' && course.courseRole === 'teacher')

  const load = useCallback(async () => {
    if (!companyId) return
    setError(null)
    try {
      const [courseRows, projectRows, company] = await Promise.all([
        learningApi.listCourses(), learningApi.listProjects(), companiesApi.getCompany(companyId),
      ])
      setCourses(courseRows); setProjects(projectRows); setProfile(company)
      if (isAdmin) setMembers(await companiesApi.listCompanyMembers(companyId))
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }, [companyId, isAdmin])

  useEffect(() => { void load() }, [load])

  const openCourse = async (course: ApiCourse) => {
    setSelectedCourse(course); setCreatedLink(null); setError(null)
    if (!course.canManage) { setCourseMembers([]); setInvitations([]); return }
    try {
      const [memberRows, invitationRows] = await Promise.all([learningApi.listCourseMembers(course.id), learningApi.listCourseInvitations(course.id)])
      setCourseMembers(memberRows); setInvitations(invitationRows)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const enterCourse = async (course: ApiCourse) => {
    if (!companyId) return
    setWorkspaceSession({ companyId, projectId: course.projectId })
    await useConversations.getState().reload()
    useApp.getState().selectConversation(course.studyRoomId)
    useApp.getState().setView('conversations')
  }

  const createCourse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(null)
    const data = new FormData(event.currentTarget)
    try {
      const course = await learningApi.createCourse({ name: String(data.get('name') ?? ''), description: String(data.get('description') ?? '') })
      event.currentTarget.reset(); await load(); await openCourse(course)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const createInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedCourse) return
    setBusy(true); setError(null)
    const data = new FormData(event.currentTarget)
    try {
      const invitation = await learningApi.createCourseInvitation(selectedCourse.id, {
        email: String(data.get('email') ?? '').trim() || null,
        role: data.get('role') === 'teacher' ? 'teacher' : 'learner',
        note: String(data.get('note') ?? '').trim() || null,
        expiresInDays: Number(data.get('expiresInDays') ?? 7),
        maxUses: Number(data.get('maxUses') ?? 1),
      })
      setCreatedLink(invitation.url); event.currentTarget.reset(); await openCourse(selectedCourse)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
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

  const toggleCourseArchiveWithConfirmation = async () => {
    if (!selectedCourse) return
    const archiving = selectedCourse.status !== 'archived'
    if (!await confirmSensitiveAction({
      title: archiving ? '归档课程？' : '恢复课程？',
      description: archiving
        ? `“${selectedCourse.name}”将停止活跃教学流程，但历史内容仍会保留。`
        : `“${selectedCourse.name}”将重新进入活跃状态。`,
      confirmLabel: archiving ? '归档课程' : '恢复课程',
      tone: archiving ? 'destructive' : 'warning',
    })) return
    try {
      await toastAction(learningApi.archiveCourse(selectedCourse.id, archiving), {
        loading: archiving ? '正在归档课程' : '正在恢复课程',
        success: archiving ? '课程已归档' : '课程已恢复',
        error: archiving ? '归档课程失败' : '恢复课程失败',
      })
      setSelectedCourse(null)
      await load()
    } catch { /* toast owns the visible error state */ }
  }

  const revokeCourseInvitationWithConfirmation = async (invitation: ApiCourseInvitation) => {
    if (!selectedCourse) return
    if (!await confirmSensitiveAction({
      title: '撤销课程邀请？',
      description: `${invitation.email ?? '公开邀请链接'} 将立即失效。`,
      confirmLabel: '撤销邀请',
      tone: 'destructive',
    })) return
    try {
      await toastAction(learningApi.revokeCourseInvitation(selectedCourse.id, invitation.id), {
        loading: '正在撤销课程邀请', success: '课程邀请已撤销', error: '撤销课程邀请失败',
      })
      await openCourse(selectedCourse)
    } catch { /* toast owns the visible error state */ }
  }

  return (
    <main className="h-full overflow-y-auto bg-app p-6 text-ink">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div><h1 className="text-[24px] font-semibold">Company & Courses</h1><p className="mt-1 text-[12px] text-ink-secondary">管理组织、课程、成员和专属 Study Room</p></div>
          <button className={`${button} bg-raised`} onClick={() => useApp.getState().setView('conversations')}>返回会话</button>
        </header>
        <nav className="flex gap-2 border-b border-hairline pb-3">
          {([['courses', '课程'], ...(isAdmin ? [['projects', 'Projects'] as const, ['organization', '组织'] as const] : [])] as Array<[Tab, string]>).map(([key, label]) => (
            <button key={key} className={`${button} ${tab === key ? 'bg-accent text-white' : 'bg-raised'}`} onClick={() => setTab(key)}>{label}</button>
          ))}
        </nav>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}

        {tab === 'courses' && <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
          <section className="space-y-3">
            {canCreateCourse && <form onSubmit={createCourse} className="space-y-2 rounded-2xl border border-hairline bg-panel p-4">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold"><IconPlus size={17}/>新建课程</h2>
              <Input className={field} name="name" required maxLength={80} placeholder="课程名称" />
              <Textarea className={field} name="description" rows={2} placeholder="课程说明（可选）" />
              <button disabled={busy} className={`${button} w-full bg-accent text-white`}>创建课程与 Study Room</button>
            </form>}
            {courses.map((course) => <article key={course.id} className={`rounded-2xl border bg-panel p-4 ${selectedCourse?.id === course.id ? 'border-accent' : 'border-hairline'}`}>
              <button className="w-full text-left" onClick={() => void openCourse(course)}>
                <div className="flex items-center justify-between"><strong className="text-[14px]">{course.name}</strong><span className="text-[10px] uppercase text-ink-secondary">{course.status}</span></div>
                <p className="mt-1 line-clamp-2 text-[11px] text-ink-secondary">{course.description || '暂无说明'}</p>
                <div className="mt-3 flex gap-3 text-[10px] text-ink-secondary"><span>{course.courseRole ?? course.companyRole}</span><span>{course.memberCount} 位成员</span></div>
              </button>
              <div className="mt-3 flex gap-2"><button className={`${button} bg-accent text-white`} onClick={() => void enterCourse(course)}>进入 Study Room</button>{course.canManage && <button className={`${button} bg-raised`} onClick={() => void openCourse(course)}><IconUsers size={14}/></button>}</div>
            </article>)}
          </section>

          <section className="rounded-2xl border border-hairline bg-panel p-5">
            {!selectedCourse && <div className="grid h-52 place-items-center text-[12px] text-ink-secondary">选择一门课程查看详情</div>}
            {selectedCourse && <div className="space-y-5">
              <div className="flex items-center justify-between"><div><h2 className="text-[18px] font-semibold">{selectedCourse.name}</h2><p className="text-[11px] text-ink-secondary">Project: {selectedCourse.projectId}</p></div>{selectedCourse.canManage && <button className={`${button} bg-raised`} onClick={() => void toggleCourseArchiveWithConfirmation()}><IconArchive size={15}/></button>}</div>
              {selectedCourse.canManage && <>
                <div><h3 className="mb-2 text-[12px] font-semibold">课程成员</h3><div className="space-y-2">{courseMembers.map((member) => <div key={member.id} className="flex items-center gap-2 rounded-xl bg-raised p-2"><span className="min-w-0 flex-1"><b className="block truncate text-[12px]">{member.name}</b><small className="text-[10px] text-ink-secondary">{member.email}</small></span><select className="rounded-lg bg-panel p-1 text-[11px]" value={member.role} onChange={async (event) => { await learningApi.updateCourseMember(selectedCourse.id, member.id, event.target.value as 'teacher' | 'learner'); await openCourse(selectedCourse) }}><option value="teacher">teacher</option><option value="learner">learner</option></select><button aria-label="移除" onClick={() => void removeCourseMemberWithConfirmation(member)}><IconTrash size={14}/></button></div>)}</div></div>
                {selectedCourse.status === 'active' && <form onSubmit={createInvite} className="space-y-2 border-t border-hairline pt-4"><h3 className="text-[12px] font-semibold">创建课程邀请</h3><Input className={field} name="email" type="email" placeholder="限制邮箱（可选）"/><div className="grid grid-cols-3 gap-2"><select className={field} name="role"><option value="learner">learner</option><option value="teacher">teacher</option></select><Input className={field} name="expiresInDays" type="number" min="1" max="30" defaultValue="7" title="有效天数"/><Input className={field} name="maxUses" type="number" min="1" max="100" defaultValue="1" title="使用次数"/></div><Input className={field} name="note" placeholder="备注（可选）"/><button disabled={busy} className={`${button} w-full bg-accent text-white`}>生成邀请链接</button></form>}
                {createdLink && <button className="flex w-full items-center gap-2 rounded-xl bg-raised p-3 text-left text-[11px]" onClick={() => void navigator.clipboard.writeText(createdLink)}><IconCopy size={15}/><span className="min-w-0 flex-1 truncate">{createdLink}</span></button>}
                <div className="space-y-1">{invitations.map((invitation) => <div key={invitation.id} className="flex items-center gap-2 py-1 text-[10px] text-ink-secondary"><span className="flex-1">{invitation.email ?? '公开链接'} · {invitation.role} · {invitation.useCount}/{invitation.maxUses}</span><span>{invitation.status}</span>{invitation.status === 'active' && <button onClick={() => void revokeCourseInvitationWithConfirmation(invitation)}>撤销</button>}</div>)}</div>
              </>}
            </div>}
          </section>
        </div>}

        {tab === 'projects' && <section className="grid gap-3 md:grid-cols-2">{projects.map((project) => <article key={project.id} className="rounded-2xl border border-hairline bg-panel p-4"><div className="flex items-center gap-2"><IconBook2 size={16}/><strong className="text-[13px]">{project.name}</strong></div><p className="mt-2 text-[11px] text-ink-secondary">{project.description || (project.isGeneral ? '组织通用 Project' : '课程 Project')}</p><div className="mt-3 text-[10px] text-ink-secondary">{project.status} · {project.conversationCount} conversations</div></article>)}</section>}

        {tab === 'organization' && isAdmin && profile && <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <form className="space-y-3 rounded-2xl border border-hairline bg-panel p-5" onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); await companiesApi.updateCompany(profile.id, { name: String(data.get('name')), description: String(data.get('description')) }); await load() }}><h2 className="text-[14px] font-semibold">组织资料</h2><Input className={field} name="name" defaultValue={profile.name}/><Input className={`${field} opacity-70`} value={profile.slug} readOnly/><Textarea className={field} name="description" rows={4} defaultValue={profile.description}/><button className={`${button} w-full bg-accent text-white`}>保存</button></form>
          <section className="rounded-2xl border border-hairline bg-panel p-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-[14px] font-semibold">组织成员</h2><button className={`${button} bg-accent text-white`} onClick={() => setCompanyInviteOpen(true)}>组织邀请</button></div><div className="space-y-2">{members.map((member) => <div key={member.id} className="flex items-center gap-2 rounded-xl bg-raised p-3"><span className="min-w-0 flex-1"><b className="block truncate text-[12px]">{member.name}</b><small className="text-[10px] text-ink-secondary">{member.email} · {member.courses.length} courses</small></span>{member.role === 'owner' ? <span className="text-[11px]">owner</span> : <><select className="rounded-lg bg-panel p-1 text-[11px]" value={member.role} onChange={async (event) => { await companiesApi.updateCompanyMember(profile.id, member.id, event.target.value as 'admin' | 'member'); await load() }}><option value="admin">admin</option><option value="member">member</option></select><button onClick={() => void removeCompanyMemberWithConfirmation(member)}><IconTrash size={14}/></button></>}</div>)}</div></section>
        </div>}
      </div>
      {companyInviteOpen && profile && <InvitePeopleModal companyId={profile.id} companyName={profile.name} onClose={() => setCompanyInviteOpen(false)} />}
    </main>
  )
}
