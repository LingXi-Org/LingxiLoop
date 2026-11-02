// Local-only production web build with synthetic auth, a 12-conversation workspace
// and 40 Markdown messages. Unknown APIs (realtime, writes) return a visible 503.
// Usage: node perf/startup-starvation/serve.mjs <dist> <port> [apiDelayMs]
import { createServer } from 'node:http'
import { readFile, appendFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = resolve(process.argv[2])
const port = Number(process.argv[3])
const delay = Number(process.argv[4] ?? 150)
const log = process.env.API_LOG
const user = { id: 'perf-user', name: '性能测试', email: 'perf@example.invalid', emailVerified: true, providers: [] }
const company = { id: 'perf-company', name: '性能测试组织', slug: 'perf', role: 'student', isAdmin: false, status: 'ACTIVE' }
const project = { id: 'perf-project', name: '性能测试课程', description: '', kind: 'COURSE', status: 'ACTIVE', courseId: 'perf-course', canManage: false }
const space = { companyId: company.id, projectId: project.id, projectKind: 'COURSE', courseId: project.courseId,
  title: project.name, description: '', color: null, status: 'ACTIVE', perspective: 'learner',
  canManage: false, canEditContent: false, canUpdateCourse: false, canInviteMembers: false,
  canRevokeInvitations: false, canUpdateMembers: false, canRemoveMembers: false, canSubmit: true,
  canReview: false, lifecycleAction: null, studyRoomId: null, isDefault: true, lastVisitedAt: null }
const now = new Date().toISOString()
const channels = Array.from({ length: 12 }, (_, index) => ({
  id: `conv-${index}`, kind: index % 3 ? 'direct' : 'group', title: `会话 ${index + 1}`, subtitle: null, topic: null,
  members: [user.id, 'agent-a'], leaderId: null, pinned: false, muted: false, mutedUntil: null, tag: null, pulledBy: null,
  createdAt: now, updatedAt: now, unreadCount: index === 1 ? 2 : 0, runSummary: null,
  lastMessage: { id: `m-${index}`, authorId: 'agent-a', kind: 'text', body: `第 ${index + 1} 个会话的最后一条消息`, createdAt: now },
}))
const participants = [
  { id: user.id, kind: 'human', name: user.name, companyId: company.id },
  { id: 'agent-a', kind: 'agent', name: '助教', companyId: company.id },
]
const replies = {
  '/api/auth/get-session': { user, session: { id: 'synthetic-session', userId: user.id, expiresAt: '2030-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } },
  '/api/session': { user, companies: [company], activeCompanyId: company.id, serverCapabilities: { invitationEmail: false } },
  '/api/projects': [project],
  '/api/projects/perf-project/open': { ok: true },
  '/api/learning/spaces': { data: [space], nextCursor: null },
  '/api/courses/perf-course': { ...project, id: project.courseId, companyId: company.id, projectId: project.id, courseRole: 'learner', memberCount: 1, createdBy: user.id, studyRoomId: null },
  '/api/courses/perf-course/forum': { items: [], nextOffset: null },
  '/api/im/channels': channels, '/api/participants': participants, '/api/agents/autonomy': [], '/api/me/preferences': {},
  '/api/projects/perf-project/sources': { folders: [], sources: [] },
}
const messages = JSON.parse(await readFile(new URL('./messages.json', import.meta.url), 'utf8'))
const cache = new Map()
createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  if (url.pathname.startsWith('/api/')) {
    const started = Date.now()
    await new Promise(done => setTimeout(done, delay))
    const body = replies[url.pathname] ?? (/^\/api\/im\/channels\/conv-\d+\/messages$/.test(url.pathname) ? messages : undefined)
    if (log) await appendFile(log, `${started} ${req.method} ${url.pathname}${url.search} ${body === undefined ? 503 : 200}\n`)
    res.writeHead(body === undefined ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body ?? { error: 'fixture has no backend for this route' }))
    return
  }
  const file = resolve(root, `.${url.pathname === '/' || !extname(url.pathname) ? '/index.html' : decodeURIComponent(url.pathname)}`)
  if (!file.startsWith(root + sep)) { res.writeHead(404); res.end(); return }
  try {
    let entry = cache.get(file)
    if (!entry) {
      const source = await readFile(file), ext = extname(file)
      const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[ext] ?? 'application/octet-stream'
      const compressed = ['.html', '.js', '.css', '.svg'].includes(ext)
      entry = { body: compressed ? gzipSync(source) : source, headers: { 'Content-Type': type, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public,max-age=31536000,immutable', ...(compressed ? { 'Content-Encoding': 'gzip' } : {}) } }
      cache.set(file, entry)
    }
    res.writeHead(200, { ...entry.headers, 'Content-Length': entry.body.length }); res.end(entry.body)
  } catch { res.writeHead(404); res.end() }
}).listen(port, '127.0.0.1', () => console.log(`fixture http://127.0.0.1:${port} delay=${delay}`))
