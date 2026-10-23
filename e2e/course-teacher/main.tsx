import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { Refine } from '@refinedev/core'
import { Toaster } from 'sonner'
import { CourseMembersSection } from '../../src/features/learning/dashboard/CourseMembersSection'
import { CompanyMembers } from '../../admin/src/company-pages'
import { dataProvider, refreshManagementSession } from '../../admin/src/api'
import { TooltipProvider } from '../../src/components/ui/tooltip'
import { useAuth } from '../../src/stores/auth'
import type { LearningSpace } from '../../src/features/learning/contracts'
import '../../src/styles/globals.css'
const scenario = new URLSearchParams(location.search).get('scenario') ?? 'course'
const admin = !['teacher','student'].includes(scenario)
const key = `course-teacher-fixture:${scenario}`
let assigned = sessionStorage.getItem(key) === 'assigned'
const evidence = { directoryReads: 0, memberReads: 0, puts: [] as { path: string; body: unknown }[] }
let readbackFailed = false
let releaseAssignment: (() => void) | undefined
const teacher = { id: 'new-teacher', name: '合成新教师', email: 'teacher@example.invalid', role: 'teacher', isAdmin: false, joinedAt: '2026-01-01T00:00:00Z', courses: [] }
const course = { id: 'course-a', companyId: 'company', projectId: 'project-a', name: '合成物理课', status: 'ACTIVE', canManage: true }
const companyMembers = () => [{ ...teacher, courses: assigned ? [{ courseId: course.id, name: course.name, role: 'teacher' }] : [] },
  { id: 'student', name: '合成学生', email: 'student@example.invalid', role: 'student', isAdmin: false, joinedAt: teacher.joinedAt, courses: [] }]
const courseMembers = () => [{ id: 'owner', name: '课程教师', email: 'owner@example.invalid', role: 'teacher', joinedAt: teacher.joinedAt }, ...(assigned ? [{ ...teacher }] : [])]
window.fetch = async (input, init) => {
  const path = String(input), method = init?.method ?? 'GET'
  if (path.includes('management-session')) return Response.json({ mode: 'company', companyId: 'company', companyName: '合成学校', capabilities: { updateMember: true }, user: { id: 'owner', name: '管理员', email: 'owner@example.invalid' } })
  if (path === '/api/control/company/courses') return Response.json([course])
  if (method === 'PUT' && path.endsWith('/members/new-teacher')) {
    evidence.puts.push({ path, body: JSON.parse(String(init?.body)) })
    if (scenario === 'scope' && path.includes('/course-a/')) return new Promise(resolve => { releaseAssignment = () => {
      assigned = true; resolve(Response.json({ ok: true, userId: teacher.id, role: 'TEACHER' }))
    } })
    if (scenario === 'assign-failure' && evidence.puts.length === 1) return Response.json({ error: 'temporary assignment failure' }, { status: 503 })
    assigned = true; sessionStorage.setItem(key, 'assigned')
    return Response.json({ ok: true, userId: teacher.id, role: 'TEACHER' })
  }
  if (path.endsWith('/companies/company/members')) {
    evidence.directoryReads++
    if (scenario === 'directory-failure' && evidence.directoryReads === 1) return Response.json({ error: 'temporary directory failure' }, { status: 503 })
    return Response.json(companyMembers())
  }
  if (path === '/api/courses/course-a/members') {
    evidence.memberReads++
    if (scenario === 'readback-failure' && assigned && !readbackFailed) { readbackFailed = true; return Response.json({ error: 'temporary readback failure' }, { status: 503 }) }
    return Response.json(courseMembers())
  }
  if (path === '/api/courses/course-b/members') return Response.json([{ id: 'owner-b', name: '新课程教师', email: 'other@example.invalid', role: 'teacher', joinedAt: teacher.joinedAt }])
  if (path === '/api/projects/project-b/invitations') return Response.json([])
  if (path === '/api/projects/project-a/invitations') return Response.json([])
  throw new Error(`Unexpected local fixture request: ${method} ${path}`)
}
useAuth.setState({ activeCompanyId: 'company', user: { id: 'owner', name: '管理员' } as never,
  companies: [{ id: 'company', isAdmin: admin }] as never })
const space = { companyId: 'company', courseId: 'course-a', projectId: 'project-a', title: course.name,
  perspective: scenario === 'student' ? 'learner' : 'teacher', canManage: scenario !== 'student', status: 'ACTIVE',
  canInviteMembers: true, canRevokeInvitations: true, canRemoveMembers: true, canUpdateMembers: true } as LearningSpace
function App() {
  const [, render] = useState(0)
  const [otherCourse, setOtherCourse] = useState(false)
  useEffect(() => { const timer = setInterval(() => render(value => value + 1), 100); return () => clearInterval(timer) }, [])
  return <TooltipProvider><MemoryRouter><Refine dataProvider={dataProvider}><main style={{ maxWidth: 1000, padding: 24 }}>
    {scenario === 'scope' && <><button id="switch-course" onClick={() => setOtherCourse(true)}>模拟切换课程</button><button id="release-assignment" onClick={() => releaseAssignment?.()}>模拟旧授权完成</button></>}
    {scenario === 'admin' ? <CompanyMembers /> : <CourseMembersSection space={otherCourse ? { ...space, courseId: 'course-b', projectId: 'project-b', title: '合成化学课' } : space} />}
    <output aria-label="授权证据">{JSON.stringify(evidence)}</output><Toaster />
  </main></Refine></MemoryRouter></TooltipProvider>
}
void refreshManagementSession().then(() => createRoot(document.getElementById('root')!).render(<App />))
