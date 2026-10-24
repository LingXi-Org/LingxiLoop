// Actual product card/editor; only the HTTP responses are synthetic. No real
// student data, provider request, original issue PPT or production access.
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { HomeworkDraftCard } from '@/features/learning/homework/HomeworkDraftCard'
import type { Homework } from '@/features/learning/homework/contracts'
import { useAuth } from '@/stores/auth'
import '@/styles/globals.css'

if (!import.meta.env.DEV) throw new Error('Isolated fixture requires development mode')
const params = new URLSearchParams(location.search)
const state = params.get('state') ?? 'INVALID'
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
const feedback = {
  INVALID: '验收标准“理解课件”无法直接核验，请写明学生需要说明的知识点或完成的任务。',
  MATERIAL_ERROR: '课程提纲.pptx：未读到可用文字。请添加文字说明，或换成带文字层的 PDF。',
  ERROR: '课程提纲.pptx的读取服务暂时未能完成检查。请重试检查，已上传的文件会保留。', READY: '要求与资料检查通过，可以确认发布。', PENDING: '',
}
let homework: Homework = {
  id: 'fixture-homework', courseId: 'fixture-course', title: '课程知识点应用练习', instructions: '阅读课程提纲，解释一个知识点，并给出自己的应用例子。',
  criteria: ['理解课件'], links: [], attachments: [{ key: 'fixture/course-outline.pptx', name: '课程提纲.pptx' }], dueAt: null,
  status: 'DRAFT', revision: 3, visibleHash: 'fixture-hash-3', createdBy: 'fixture-teacher',
  validation: { status: state as Homework['validation']['status'], revision: params.has('stale') ? 2 : 3, feedback: feedback[state as keyof typeof feedback] },
  canPublish: state === 'READY', canEditDraft: true,
}
let validateRequests = 0, publishRequests = 0, saveRequests = 0
let failRetry = params.has('failRetry')
let failSave = params.has('failSave')
const snapshot = () => structuredClone({ homework, validateRequests, publishRequests, saveRequests })
const fixture = {
  snapshot,
  settle(status: Homework['validation']['status']) {
    homework = { ...homework, validation: { status, revision: homework.revision, feedback: feedback[status] }, canPublish: status === 'READY' }
  },
}
Object.assign(window, { homeworkValidationFixture: fixture })
const originalFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.startsWith('/api/')) return originalFetch(input, init)
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
  if (!url.startsWith('/api/courses/fixture-course/homeworks/fixture-homework')) return json({ error: 'fixture route not found' }, 404)
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  if (url.endsWith('/draft') && init?.method === 'PATCH') {
    saveRequests++
    if (failSave) { failSave = false; return json({ error: 'service unavailable' }, 503) }
    const { expectedRevision, ...fields } = body
    if (expectedRevision !== homework.revision) return json({ error: 'revision changed' }, 409)
    homework = { ...homework, ...fields, revision: homework.revision + 1, validation: { status: 'PENDING', revision: null, feedback: '' }, canPublish: false }
  } else if (url.endsWith('/validate')) {
    validateRequests++
    if (failRetry) { failRetry = false; return json({ error: 'service unavailable' }, 503) }
    if (body.expectedRevision !== homework.revision) return json({ error: 'revision changed' }, 409)
    homework = { ...homework, validation: { status: 'PENDING', revision: null, feedback: '' }, canPublish: false }
  } else if (url.endsWith('/publish')) {
    publishRequests++
    if (body.expectedRevision !== homework.revision || homework.validation.status !== 'READY' || homework.validation.revision !== homework.revision) return json({ error: 'not ready' }, 409)
    homework = { ...homework, status: 'PUBLISHED', canPublish: false, canEditDraft: false }
  }
  return json({ homework, teacher: true, student: null })
}
useAuth.setState({ activeCompanyId: 'fixture-company', ready: true, authenticated: true, user: { id: 'fixture-teacher', email: 'teacher@example.invalid', name: '教师' } })
createRoot(document.getElementById('root')!).render(<ThemeProvider attribute="class" forcedTheme={params.get('theme') ?? 'light'} enableSystem={false}><TooltipProvider><main className="mx-auto max-w-2xl p-4"><HomeworkDraftCard courseId="fixture-course" homeworkId="fixture-homework" readOnly={false} preparing={false}/></main></TooltipProvider></ThemeProvider>)
