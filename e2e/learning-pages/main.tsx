import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CourseForum } from '../../src/features/learning/forum/CourseForum'
import { CasesPage } from '../../src/features/cases/CasesPage'
import { CourseMaterialsPage } from '../../src/features/course-materials/CourseMaterialsPage'
import { TooltipProvider } from '../../src/components/ui/tooltip'
import { GlobalInteractionProvider } from '../../src/components/GlobalInteractionProvider'
import { useAuth } from '../../src/stores/auth'
import type { LearningSpace } from '../../src/features/learning/contracts'
import type { ForumItem } from '../../src/features/learning/forum/contracts'
import '../../src/styles/globals.css'

const params = new URLSearchParams(location.search), page = params.get('page') ?? 'forum', role = params.get('role') ?? 'teacher'
const teacher = role === 'teacher'
const posts: ForumItem[] = []
const drafts = new Map<string, Record<string, unknown>>()
const evidence = { writes: [] as { path: string; method: string; body: Record<string, unknown> }[], reads: [] as string[] }
let notify = () => {}
const item = (id: string, title: string, body: string, kind: 'share' | 'assignment', targetType: 'post' | 'homework'): ForumItem => ({
  id, title, body, kind, targetType, authorId: 'synthetic-user', authorName: '合成教师', createdAt: '2026-10-25T00:00:00Z', updatedAt: '2026-10-25T00:00:00Z',
  tags: [], links: [], attachments: [], sourceId: null, dueAt: null, status: 'PUBLISHED', pinned: false, archived: false, commentCount: 0, reactions: [],
})
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin), path = url.pathname, method = init?.method ?? 'GET'
  if (method === 'GET') evidence.reads.push(path)
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  if (method !== 'GET') { evidence.writes.push({ path, method, body }); notify() }
  if (/\/courses\/[^/]+\/forum$/.test(path)) {
    if (method === 'POST') { const next = item(`post-${posts.length}`, body.title, body.body, body.kind, 'post'); posts.unshift(next); return Response.json(next) }
    return Response.json({ items: posts.filter(post => (!url.searchParams.get('search') || post.title.includes(url.searchParams.get('search')!)) && (url.searchParams.get('kind') === 'all' || post.kind === url.searchParams.get('kind'))), nextOffset: null })
  }
  const homework = /\/courses\/([^/]+)\/homeworks\/([^/]+)(?:\/(draft|publish))?$/.exec(path)
  if (homework) {
    const [, courseId, id, action] = homework
    if (action === 'draft') drafts.set(id, { id, courseId, ...body, status: 'DRAFT', revision: 1, visibleHash: 'synthetic-visible-hash', createdBy: 'synthetic-user', canPublish: true, canEditDraft: true, validation: { status: 'READY', revision: 1, feedback: '' } })
    const current = drafts.get(id)!
    if (action === 'publish') { current.status = 'PUBLISHED'; posts.unshift(item(id, String(current.title), String(current.instructions), 'assignment', 'homework')) }
    return Response.json({ homework: current, teacher: true, student: null })
  }
  if (/\/projects\/[^/]+\/sources$/.test(path) && url.searchParams.has('space')) return Response.json({ sources: [], capabilities: { canUpload: role !== 'readonly' && (teacher || url.searchParams.get('space') === 'private') } })
  if (/\/projects\/[^/]+\/sources$/.test(path)) return Response.json([])
  if (path === '/api/cases') return Response.json({ items: [], categories: ['教学实践', '课程建设', '跨学科案例', '科学教育', '人文教育', '项目学习', '最后一个真实分类'], canManage: teacher, view: url.searchParams.get('caseView') ?? url.searchParams.get('view') ?? 'reader' })
  throw new Error(`Unexpected synthetic request: ${method} ${path}`)
}
useAuth.setState({ activeCompanyId: 'synthetic-company', user: { id: 'synthetic-user', name: '合成用户', email: 'user@example.invalid', emailVerified: true, providers: [] },
  companies: [{ id: 'synthetic-company', name: '合成学校', slug: 'synthetic', role: teacher ? 'teacher' : 'student', isAdmin: false, status: 'ACTIVE' }] })
function App() {
  const [, render] = useState(0), [course, setCourse] = useState('course-a')
  notify = () => render(value => value + 1)
  const space = { companyId: 'synthetic-company', projectId: 'synthetic-project', courseId: course, title: '合成课程', projectKind: 'TEACHING', status: 'ACTIVE', perspective: teacher ? 'teacher' : 'learner', canEditContent: teacher, canSubmit: role !== 'readonly', canReview: teacher } as LearningSpace
  return <TooltipProvider><GlobalInteractionProvider><div style={{ height: '100dvh' }}>
    {page === 'cases' ? <CasesPage /> : page === 'materials' ? <CourseMaterialsPage projectId="synthetic-project" projectName="合成课程" /> : <CourseForum space={space} />}
    <button id="switch-course" type="button" className="sr-only" onClick={() => setCourse(value => value === 'course-a' ? 'course-b' : 'course-a')}>模拟切课</button>
    <output aria-label="请求证据" className="sr-only">{JSON.stringify(evidence)}</output>
  </div></GlobalInteractionProvider></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
