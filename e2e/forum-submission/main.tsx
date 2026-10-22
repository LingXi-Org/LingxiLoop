import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '../../src/components/ui/tooltip'
import { ForumSubmission } from '../../src/features/learning/forum/ForumSubmission'
import { ConversationReferencePicker } from '../../src/features/learning/forum/ConversationReferences'
import type { LearningSpace } from '../../src/features/learning/contracts'
import type { ConversationReference, ForumItem } from '../../src/features/learning/forum/contracts'
import { useAuth } from '../../src/stores/auth'
import { useApp } from '../../src/stores/app'
import { useConversations } from '../../src/features/conversations/store'
import '../../src/styles/globals.css'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'missing'
useAuth.setState({ activeCompanyId: 'company', user: { id: 'student', name: '学生' } as never })
useConversations.setState({ projectId: 'project', list: [{ id: 'room' } as never] })
localStorage.clear()
localStorage.setItem('lingxiloop.forum.draft:company:student:submission:course:assignment', JSON.stringify({ updatedAt: Date.now(), value: { body: '两个三角形拼成长方形。', links: '', attachments: [] } }))
const evidence = { rooms: 0, messages: 0, history: 0, puts: 0, submissions: [] as unknown[] }
const messages = (room: string) => [{ id: `${room}-user`, role: 'user', text: '为什么面积除以二？', sequence: 1 },
  { id: `${room}-assistant`, role: 'assistant', text: '两个三角形可以拼成长方形。', sequence: 2 }]
let releaseOld: (() => void) | undefined
let completed = false
let finishUpload: (()=>void) | undefined
window.fetch = async (url, init) => {
  const path = String(url)
  if (path.includes('/uploads/capabilities')) return Response.json({ maxBytes: 10000, allowedMimes: [] })
  if (path.includes('/uploads/presign')) return Response.json({ uploadUrl: '/synthetic-upload', key: 'company/student/answer.txt', name: 'answer.txt', mime: 'text/plain', size: 58, publicUrl: '/synthetic-file' })
  if (path === '/synthetic-upload') {
    evidence.puts++
    if(scenario === 'upload-pending')return new Promise(resolve=>{finishUpload=()=>resolve(new Response('',{status:200}))})
    return new Response('', { status: scenario === 'upload' && evidence.puts === 1 ? 503 : 200 })
  }
  if (path.includes('/submit')) { evidence.submissions.push(JSON.parse(String(init?.body))); return Response.json(scenario === 'submit-retry' && evidence.submissions.length === 1 ? { error: '提交暂时失败，请重试' } : { attemptId: 'attempt' }, { status: scenario === 'submit-retry' && evidence.submissions.length === 1 ? 503 : 201 }) }
  if (path.includes('/submissions?')) {
    evidence.history++
    if (scenario === 'history') return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true }))
    return Response.json({ items: [], nextOffset: null })
  }
  if (path.includes('/submission-conversations?')) {
    evidence.rooms++
    if (scenario === 'rooms-retry' && evidence.rooms === 1) return Response.json({ error: '对话列表暂时不可用' }, { status: 503 })
    const room = path.includes('/other/') ? 'other-room' : 'room'
    if (scenario === 'scope' && room === 'room') return new Promise(resolve => { releaseOld = () => resolve(Response.json({ items: [{ channelId: 'old-room', title: '旧课程对话' }], nextOffset: null })) })
    return Response.json({ items: scenario === 'empty' && !completed ? [] : [{ channelId: room, title: room === 'room' ? '我的课程对话' : '新课程对话' }], nextOffset: null })
  }
  if (path.includes('/submission-conversations/')) {
    evidence.messages++
    if (scenario === 'messages-retry' && evidence.messages === 1) return Response.json({ error: '对话暂时不可用' }, { status: 503 })
    return Response.json({ messages: scenario === 'incomplete' && !completed ? messages('room').slice(0, 1) : messages('room'), nextBefore: null })
  }
  throw new Error(`Unexpected synthetic request: ${path}`)
}
const item = { id: 'assignment', targetType: 'post', kind: 'assignment', status: 'PUBLISHED', dueAt: null } as ForumItem
const space = { companyId: 'company', courseId: 'course', projectId: 'project', canSubmit: true, canReview: false, perspective: 'learner' } as LearningSpace
function App() {
  const [, render] = useState(0), [courseId, setCourse] = useState('course'), [refs, setRefs] = useState<ConversationReference[]>([])
  const selectedConversation=useApp(state=>state.selectedConversationId)
  useEffect(() => { const timer = setInterval(() => render(value => value + 1), 50); return () => clearInterval(timer) }, [])
  return <TooltipProvider><main style={{ maxWidth: 900, padding: 24 }}>
    {['empty','incomplete'].includes(scenario) && <button onClick={()=>{completed=true}}>模拟完成学习对话</button>}
    {scenario === 'upload-pending' && <button onClick={()=>finishUpload?.()}>模拟上传完成</button>}
    {scenario === 'scope' ? <><button onClick={() => setCourse('other')}>切换课程</button><button onClick={() => releaseOld?.()}>返回旧请求</button><ConversationReferencePicker courseId={courseId} value={refs} onChange={setRefs} disabled={false} /></>
      : scenario === 'fixed' ? <ConversationReferencePicker courseId="course" channelId="room" value={refs} onChange={setRefs} disabled={false}/>
        : scenario === 'navigation' && selectedConversation ? <><p>课程对话已打开</p><button onClick={()=>useApp.getState().selectConversation(null)}>返回作业</button></>
          : <ForumSubmission space={space} item={item} />}
    <output aria-label="提交证据">{JSON.stringify(evidence)}</output>
  </main></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
