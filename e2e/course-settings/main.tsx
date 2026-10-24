import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CourseSettingsSection } from '../../src/features/learning/dashboard/CourseSettingsSection'
import { GlobalInteractionProvider } from '../../src/components/GlobalInteractionProvider'
import { TooltipProvider } from '../../src/components/ui/tooltip'
import { useAuth } from '../../src/stores/auth'
import type { ApiCourse, LearningSpace } from '../../src/features/learning/contracts'
import '../../src/styles/globals.css'

// Real product components and HTTP transport; only synthetic local responses.
const scenario = new URLSearchParams(location.search).get('scenario') ?? 'switch'
const evidence = { reads: [] as string[], writes: [] as { path: string; body: unknown }[], refreshes: 0 }
let notify = () => {}
let rejectNextCourse: (() => void) | undefined
let bRequests = 0
const course = (id: string): ApiCourse => ({
  id, companyId: 'synthetic-company', projectId: `project-${id}`, projectKind: 'TEACHING',
  name: id === 'course-a' ? '合成物理课' : '合成化学课', description: `合成说明 ${id}`,
  color: '#555555', status: 'ACTIVE', createdBy: 'synthetic-teacher', studyRoomId: null,
  courseRole: scenario === 'stale-role' ? 'learner' : 'teacher', memberCount: 1, canManage: scenario !== 'stale-role',
})
const space = (id: string): LearningSpace => ({
  companyId: 'synthetic-company', projectId: `project-${id}`, projectKind: 'TEACHING', courseId: id,
  title: course(id).name, description: course(id).description, color: '#555555', status: 'ACTIVE',
  perspective: 'teacher', canManage: true, canEditContent: true, canUpdateCourse: true,
  canInviteMembers: false, canRevokeInvitations: false, canUpdateMembers: false,
  canRemoveMembers: false, canSubmit: false, canReview: true, lifecycleAction: null,
  studyRoomId: null, isDefault: false, lastVisitedAt: null,
})
window.fetch = async (input, init) => {
  const path = String(input), method = init?.method ?? 'GET'
  if (method === 'GET' && /^\/api\/courses\/course-[ab]$/.test(path)) {
    evidence.reads.push(path); notify()
    if (path.endsWith('/course-b') && scenario === 'switch' && ++bRequests === 1) {
      return new Promise(resolve => { rejectNextCourse = () => resolve(Response.json({ error: 'Synthetic temporary failure' }, { status: 503 })) })
    }
    return Response.json(course(path.endsWith('/course-a') ? 'course-a' : 'course-b'))
  }
  if (method === 'PATCH' && /^\/api\/courses\/course-[ab]$/.test(path)) {
    evidence.writes.push({ path, body: JSON.parse(String(init?.body)) }); notify()
    return Response.json({ ok: true })
  }
  if (path === '/api/projects' && method === 'GET') return Response.json([])
  throw new Error(`Unexpected synthetic fixture request: ${method} ${path}`)
}
window.addEventListener('lingxiloop:learning-spaces-updated', () => { evidence.refreshes++; notify() })
useAuth.setState({ activeCompanyId: 'synthetic-company', sessionKey: 'synthetic-session',
  user: { id: 'synthetic-teacher', name: '合成教师', email: 'teacher@example.invalid', emailVerified: true, providers: [] },
  companies: [{ id: 'synthetic-company', name: '合成学校', slug: 'synthetic', role: 'teacher', isAdmin: false, status: 'ACTIVE' }] })

function App() {
  const [, render] = useState(0)
  const [current, setCurrent] = useState<LearningSpace>(() => scenario === 'student'
    ? { ...space('course-a'), perspective: 'learner', canManage: false, canUpdateCourse: false } : space('course-a'))
  notify = () => render(value => value + 1)
  return <TooltipProvider><GlobalInteractionProvider><main className="mx-auto max-w-5xl p-6">
    <div className="mb-4 flex gap-3">
      <button type="button" id="switch-course" onClick={() => setCurrent(space('course-b'))}>模拟切换课程</button>
      <button type="button" id="fail-course" onClick={() => rejectNextCourse?.()}>模拟加载失败</button>
      <button type="button" id="revoke-write" onClick={() => setCurrent(value => ({ ...value, canUpdateCourse: false }))}>模拟撤销编辑权限</button>
      <button type="button" id="switch-student" onClick={() => setCurrent(value => ({ ...value, perspective: 'learner', canManage: false, canUpdateCourse: false }))}>模拟学生视角</button>
    </div>
    <CourseSettingsSection space={current} section="profile" />
    <output aria-label="课程设置请求证据">{JSON.stringify(evidence)}</output>
  </main></GlobalInteractionProvider></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
