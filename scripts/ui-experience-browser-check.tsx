// Open on the local Vite server. No production requests or browser automation library.
import './ui-experience-fixtures'
import { useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { AppThemeProvider } from '@/components/AppThemeProvider'
import { GlobalInteractionProvider } from '@/components/GlobalInteractionProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { WorkspaceSkeleton } from '@/components/WorkspaceSkeleton'
import { AuthScreen } from '@/components/AuthScreen'
import { ConversationSkeleton } from '@/features/chat/components/ConversationSkeleton'
import { AgentsPage, AgentsSkeleton } from '@/features/agents/components/AgentsPage'
import { CalendarView } from '@/features/calendar/components/CalendarView'
import { CalendarSkeleton } from '@/features/calendar/components/CalendarSkeleton'
import { CanvasView } from '@/features/canvas/components/CanvasView'
import { CanvasSkeleton } from '@/features/canvas/components/CanvasSkeleton'
import { DocumentSkeleton } from '@/features/documents/components/DocumentSkeleton'
import { DocumentsView } from '@/features/documents/components/DocumentsView'
import { useDocuments } from '@/features/documents/state'
import { PresentationSkeleton } from '@/features/presentations/components/PresentationSkeleton'
import { PresentationDrawerContent } from '@/features/presentations/components/PresentationDrawerContent'
import { usePresentations } from '@/features/presentations/state'
import { LearningDashboardPanel } from '@/features/learning/dashboard/LearningDashboardPanel'
import { CourseSettingsSection } from '@/features/learning/dashboard/CourseSettingsSection'
import { installResourceFixtures, teacherSpace } from './ui-experience-resource-fixtures'
import { OverviewSkeleton, CourseSettingsSkeleton } from '@/features/learning/dashboard/LearningSkeletons'
import { SourceCardsSkeleton, SourceFoldersSkeleton } from '@/features/knowledge/components/SourceSkeletons'
import { ProjectSourceLibrary } from '@/features/knowledge/components/ProjectSourceLibrary'
import { emailApi } from '@/features/email/api'
import { adminFixtures } from './ui-experience-admin-fixtures'
import { MailPage, MailThreadSkeleton } from '@/features/email/components/MailPage'
import { openSettingsDialog } from '@/features/settings/store'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { DesktopApp } from '@/desktop/DesktopApp'
import { useChatThreadStore, updateConversation } from '@/features/chat/runtime/store'
import { useEntrance } from '@/hooks/use-entrance'
import { knowledgeApi } from '@/features/knowledge/api'
import { useParticipants } from '@/features/agents/state'
import { useCanvas } from '@/features/canvas/state'
import { useCalendar } from '@/features/calendar/state'
import { AdminDashboardSkeleton, AdminShellSkeleton, AdminTabSkeleton, AdminRecordSkeleton } from '../admin/src/loading'
import { AdminApp } from '../admin/src/app'
import { adminQueryClient } from '../admin/src/api'
import { sources, participants, canvas, learningSpace } from './ui-experience-fixtures'

type Mode = 'success' | 'slow' | 'empty' | 'error'
let mode: Mode = 'success'
let pending: (() => void)[] = []
const release = () => { const callbacks = pending; pending = []; callbacks.forEach(resolve => resolve()) }
let processingSource = false
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
async function data<T>(value: T, empty: T): Promise<T> {
  if (mode === 'slow') await new Promise<void>(resolve => { pending.push(resolve) })
  if (mode === 'error') throw new Error('本地模拟加载失败')
  return mode === 'empty' ? empty : value
}
installResourceFixtures(data)
knowledgeApi.listProjectSources = () => data(processingSource ? sources.map((source, index) => index === 0 ? {...source,status:'processing' as const} : source) : sources, [])
knowledgeApi.listCourseReviewSources = () => data(sources, [])
const mail = {conversationId:'mail-local',title:'本地邮件标题',updatedAt:'2026-10-02T08:00:00Z',lastSubject:'本地邮件标题',lastFrom:'reader@example.test',lastAt:'2026-10-02T08:00:00Z',lastBody:'隔离的邮件正文'}
emailApi.listThreads = query => data({items:query ? [] : [mail],hasMore:false},{items:[],hasMore:false})
emailApi.getMessages = () => data([{id:'mail-message',sequence:1,body:'本地邮件正文',createdAt:mail.updatedAt,email:{subject:mail.title,from:mail.lastFrom,to:['review@example.test'],cc:[],direction:'in' as const,hasHtml:false,transportStatus:'sent',attachments:[]}}],[])

knowledgeApi.getProjectSource = async (_project, id) => data(sources.find(source => source.id === id)!, sources[0])
adminQueryClient.setDefaultOptions({ queries: { retry: false, refetchOnWindowFocus: false } })
const localFetch = window.fetch
const companySession = new URLSearchParams(location.search).get('company') === '1'
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
  if (url.origin !== location.origin || init?.method && init.method !== 'GET') return localFetch(input, init)
  const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
  if (url.pathname === '/api/auth/get-session') return json({user:{id:'local-review',name:'本地验收',email:'review@example.test',role:'admin'},session:{id:'local',userId:'local-review',expiresAt:'2099-01-01T00:00:00Z'}})
  if (url.pathname === '/api/control/management-session') return json({mode:companySession ? 'company' : 'platform',companyId:companySession ? 'company-audit' : null,companyName:'本地演示组织',capabilities:{invite:true,updateMember:true,removeMember:true},resources:['users','companies','projects','agent-runs'],user:{id:'local-review',name:'本地验收',email:'review@example.test'}})
  if (url.pathname === '/api/control/company/business/companies/company-audit/members') {
    try { return json(await data([{id:'local-review',userId:'local-review',name:'本地验收',email:'review@example.test',role:'teacher',isAdmin:true,status:'ACTIVE'}], [])) }
    catch { return new Response('{"error":"本地模拟加载失败"}', {status:503}) }
  }
  if (url.pathname === '/api/control/platform/search') {
    try { return json(await data({data:[{resource:'users',id:'local-record',label:'本地验收用户',summary:'本地搜索结果',status:'ACTIVE'}]}, {data:[]})) }
    catch { return new Response('{"error":"本地模拟加载失败"}', {status:503}) }
  }
  if (adminFixtures[url.pathname]) {
    try { return json(await data(adminFixtures[url.pathname], adminFixtures[url.pathname])) } catch { return new Response('{"error":"本地模拟加载失败"}', {status:503}) }
  }
  if (url.pathname.endsWith('/summary')) {
    try { return json(await data({metrics:[{label:'相关记录',resource:'users',value:2}]}, {metrics:[]})) }
    catch { return new Response('{"error":"本地模拟加载失败"}', {status:503}) }
  }
  if (/\/resources\/[^/]+\/[^/]+$/.test(url.pathname)) {
    const record = {id:'local-record',name:'本地详情长标题'.repeat(5),email:'review@example.test',status:'ACTIVE',created_at:mail.updatedAt}
    try { return json(await data(record, record)) }
    catch { return new Response('{"error":"本地模拟加载失败"}', {status:503}) }
  }
  if (url.pathname.includes('/resources/')) {
    try { return json(await data({data:[{id:'local-record',name:'长标题本地演示记录'.repeat(6),status:'ACTIVE',email:'review@example.test'}],total:1,nextCursor:null}, {data:[],total:0,nextCursor:null})) }
    catch { return new Response('{"error":"本地模拟加载失败"}', {status:503}) }
  }
  return localFetch(input, init)
}

const gallery: Record<string, ReactNode> = {
  '启动外壳': <WorkspaceSkeleton />, '会话与回复串': <ConversationSkeleton />,
  'Agent': <AgentsSkeleton />, '邮件阅读': <MailThreadSkeleton />,
  '学生概览': <OverviewSkeleton />, '教师概览': <OverviewSkeleton perspective="teacher" />,
  '日历月': <CalendarSkeleton mode="month" />, '日历周': <CalendarSkeleton />, '日历日': <CalendarSkeleton mode="day" />,
  '资料文件夹': <SourceFoldersSkeleton />, '资料卡片': <SourceCardsSkeleton />,
  '文档': <DocumentSkeleton />, '画布': <CanvasSkeleton />, '演示文稿': <PresentationSkeleton />,
  '课程设置': <CourseSettingsSkeleton section="profile" />, '课程成员': <CourseSettingsSkeleton section="members" />,
  '后台启动': <AdminShellSkeleton />, '后台概览': <AdminDashboardSkeleton />,
  '后台监控': <AdminTabSkeleton tab="status" />, '后台认证': <AdminTabSkeleton tab="authentication" />,
  '后台分析': <AdminTabSkeleton tab="analytics" />, '后台详情': <AdminRecordSkeleton />,
  '六列表格': <ResourceSkeleton variant="table" columns={6} count={5} />,
}

function StableSurface({ identity, text }: { identity: number; text: string }) {
  const ref = useEntrance(identity)
  return <div ref={ref} data-check-surface className="h-40 overflow-auto rounded-xl border p-4">
    <label>未提交的草稿<Input aria-label="未提交的草稿" defaultValue="保留草稿" /></label>
    <div contentEditable suppressContentEditableWarning data-check-editor>选区保持稳定</div>
    <p data-check-stream>{text}</p><div className="h-64" />
  </div>
}
function App() {
  const [surface, setSurface] = useState(new URLSearchParams(location.search).get('surface') || '骨架总览'), [selected, setSelected] = useState('学生概览')
  const [identity, setIdentity] = useState(0), [text, setText] = useState('流式正文'), [revision, setRevision] = useState(0)
  const [result, setResult] = useState('待运行'), [report, setReport] = useState<object | null>(null), [busy, setBusy] = useState(false)
  const next = async () => { await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))) }
  function change(nextMode: Mode) {
    mode = nextMode
    useParticipants.setState({byId: nextMode === 'empty' || nextMode === 'slow' ? {} : participants, loaded: nextMode !== 'slow' && nextMode !== 'error', error: nextMode === 'error' ? '本地模拟失败' : null})
    useCanvas.setState({snapshot: nextMode === 'slow' || nextMode === 'error' ? null : canvas, loading: nextMode === 'slow', error: nextMode === 'error' ? '本地模拟失败' : null})
    useCalendar.setState({loaded: nextMode !== 'slow' && nextMode !== 'error', loading: nextMode === 'slow', error: nextMode === 'error' ? '本地模拟失败' : null})
    useDocuments.getState().reset()
    usePresentations.getState().reset()
    setRevision(value => value + 1)
  }
  async function run() {
    setBusy(true); setReport(null)
    const checks: {name: string; pass: boolean}[] = []
    const assert = (condition: unknown, name: string) => { checks.push({name,pass:Boolean(condition)}); if (!condition) throw new Error(name) }
    try {
      setSurface('动效与焦点'); await next()
      const element = document.querySelector<HTMLElement>('[data-check-surface]')!
      const input = element.querySelector('input')!
      input.focus(); input.setSelectionRange(1, 3); element.scrollTop = 30
      const animation = element.getAnimations()[0]
      flushSync(() => setText('流式正文第一段'))
      assert(document.querySelector('[data-check-surface]') === element, '流式更新保留 DOM 节点')
      assert(element.getAnimations()[0] === animation, '普通更新不重播动画')
      flushSync(() => setIdentity(value => value + 1))
      assert(document.activeElement === input && input.value === '保留草稿' && input.selectionStart === 1, '切换动效保留草稿、焦点与输入选区')
      assert(element.scrollTop === 30, '切换动效保留滚动位置')
      for (let index = 0; index < 5; index++) flushSync(() => setIdentity(value => value + 1))
      assert(element.getAnimations().length <= 1, '快速切换取消上一段动画')
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
      assert(reduced ? element.getAnimations().length === 0 : element.getAnimations().length === 1, '原生动效遵循当前系统偏好')
      await pause(240); assert(element.getAnimations().length === 0, '200ms 进入动画结束后无残留')
      const originalMatchMedia = window.matchMedia
      let simulatedReduced = false
      const preference = new EventTarget() as MediaQueryList
      Object.defineProperties(preference, {matches:{get:() => simulatedReduced}, media:{value:'(prefers-reduced-motion: reduce)'}})
      window.matchMedia = query => query === preference.media ? preference : originalMatchMedia.call(window, query)
      try {
        flushSync(() => setIdentity(value => value + 1))
        assert(element.getAnimations().length === 1, '模拟系统偏好：正常模式开始动画')
        simulatedReduced = true; preference.dispatchEvent(new Event('change'))
        assert(element.getAnimations().length === 0, '模拟系统偏好：切换减少动态效果立即取消动画')
        flushSync(() => setIdentity(value => value + 1))
        assert(element.getAnimations().length === 0, '模拟系统偏好：减少动态效果下直接呈现内容')
      } finally { window.matchMedia = originalMatchMedia }
      for (const name of Object.keys(gallery)) {
        setSurface('骨架总览'); setSelected(name); await next()
        const stage = document.getElementById('check-stage')!
        assert(Boolean(stage.querySelector('[role=status][aria-label]')), `${name}：可访问的加载说明`)
        assert([...stage.querySelectorAll('[data-slot=skeleton]')].every(node => node.getAttribute('aria-hidden') === 'true'), `${name}：装饰占位隐藏`)
        assert(stage.scrollWidth <= stage.clientWidth + 1, `${name}：页面不横向溢出`)
      }
      mode = 'slow'; processingSource = true; setSurface('资料'); setRevision(value => value + 1); await next()
      assert(Boolean(document.querySelector('#check-stage [role=status]')), '资料首次慢请求显示骨架')
      mode = 'success'; release?.(); await next(); await next()
      assert(document.querySelector('#check-stage')!.textContent!.includes(sources[0].title), '资料请求成功展示卡片')
      const firstCard = document.querySelector('#check-stage [data-slot=card]')
      mode = 'slow'; await pause(2100); await next()
      assert(document.querySelector('#check-stage [data-slot=card]') === firstCard && !document.querySelector('#check-stage [data-skeleton-region]'), '资料后台刷新保留卡片节点')
      mode = 'error'; release(); await next(); await next()
      assert(Boolean(document.querySelector('#check-stage [role=alert]')) && document.querySelector('#check-stage [data-slot=card]') === firstCard, '资料刷新失败保留内容并提示')
      processingSource = false
      mode = 'error'; setRevision(value => value + 1); await next(); await next()
      assert(Boolean(document.querySelector('#check-stage [role=alert]')), '首次失败显示错误')
      assert(!document.querySelector('#check-stage [role=status]'), '错误与骨架不同时出现')
      mode = 'success'; [...document.querySelectorAll<HTMLButtonElement>('#check-stage button')].find(button => button.textContent === '重新加载')!.click(); await next(); await next()
      assert(document.querySelector('#check-stage')!.textContent!.includes(sources[0].title), '错误重试恢复内容')
      mode = 'empty'; setRevision(value => value + 1); await next(); await next()
      assert(document.querySelector('#check-stage')!.textContent!.includes('还没有资料'), '成功空结果显示添加入口')
      mode = 'slow'; setSurface('邮件'); await next()
      assert(Boolean(document.querySelector('#check-stage [role=status]')), '邮件首次加载骨架')
      mode = 'success'; release(); await next(); await next()
      const mailRow = [...document.querySelectorAll<HTMLButtonElement>('#check-stage button')].find(button => button.textContent?.includes(mail.title))!
      assert(Boolean(mailRow), '邮件列表展示成功')
      mode = 'slow'; [...document.querySelectorAll<HTMLButtonElement>('#check-stage button')].find(button => button.textContent === '刷新邮件')!.click(); await next()
      assert(mailRow.isConnected && !document.querySelector('#check-stage [data-resource-skeleton]'), '邮件刷新保留已有列表')
      mode = 'error'; release(); await next(); await next()
      assert(mailRow.isConnected && Boolean(document.querySelector('#check-stage [role=alert]')), '邮件刷新失败保留内容并提示')
      mode = 'success'; mailRow.click(); await next(); await next()
      assert(document.querySelector('#check-stage')!.textContent!.includes('本地邮件正文'), '邮件阅读区展示正文')
      setSurface('主应用'); await next(); await next()
      let conversationButton: HTMLElement | undefined
      for (let attempt = 0; attempt < 100 && !conversationButton; attempt++) {
        conversationButton = [...document.querySelectorAll<HTMLElement>('#check-stage [role=button]')].find(button => button.textContent?.includes('产品研究协作'))
        if (!conversationButton) await pause(50)
      }
      conversationButton?.click()
      for (let attempt = 0; attempt < 100 && !document.querySelector('[data-msg-id="local-chat"]'); attempt++) await pause(50)
      const originalMessage = document.querySelector<HTMLElement>('[data-msg-id="local-chat"]')!
      assert(Boolean(originalMessage), '真实聊天组件展示缓存消息')
      assert(!originalMessage.classList.contains('ui-enter'), '缓存历史不逐条播放进入动画')
      const conversationId = 'conversation-research'
      const originalMessages = useChatThreadStore.getState().conversations[conversationId].messages
      const source = originalMessages[0]
      if (source.role !== 'assistant') throw new Error('Expected an assistant fixture')
      const message = {...source,id:'ui-live-message',content:[{type:'text' as const,text:'真实新增消息'}],metadata:{...source.metadata,custom:{...source.metadata.custom,clientMessageId:'ui-live-message',sequence:2}}}
      const composer = document.querySelector<HTMLElement>('[data-chat-composer-bar] [contenteditable=true]')
      composer?.focus()
      if (composer) document.execCommand('insertText', false, '保留聊天草稿')
      updateConversation(conversationId, current => ({...current,messages:[...originalMessages,message]}))
      await next(); await next()
      const live = document.querySelector<HTMLElement>('[data-msg-id="ui-live-message"]')!
      assert(Boolean(live?.classList.contains('ui-enter')), '真实新增消息仅在到达时播放进入动画')
      const liveAnimation = live.getAnimations()[0]
      updateConversation(conversationId, current => ({...current,messages:[...originalMessages,{...message,content:[{type:'text',text:'真实新增消息持续更新'}]}]}))
      await next()
      assert(document.querySelector('[data-msg-id="ui-live-message"]') === live && live.getAnimations().every(animation => animation === liveAnimation), '正文更新保留消息节点且不重播动画')
      assert(composer && document.querySelector('[data-chat-composer-bar] [contenteditable=true]') === composer && composer.textContent?.includes('保留聊天草稿'), '消息到达时聊天草稿与编辑器节点稳定')
      updateConversation(conversationId, current => ({...current,isLoadingOlder:true}))
      await next()
      const older = {...source,id:'ui-older-message',metadata:{...source.metadata,custom:{...source.metadata.custom,clientMessageId:'ui-older-message',sequence:0}}}
      updateConversation(conversationId, current => ({...current,isLoadingOlder:false,messages:[older,...current.messages]}))
      await next(); await next()
      assert(!document.querySelector('[data-msg-id="ui-older-message"]')?.classList.contains('ui-enter') && document.querySelector('[data-msg-id="local-chat"]') === originalMessage, '历史回填不播放进入动画且保留原节点')
      updateConversation(conversationId, current => ({...current,messages:originalMessages}))
      const waitFor = async (condition: () => boolean) => {
        for (let attempt = 0; attempt < 100 && !condition(); attempt++) await pause(50)
      }
      for (const name of ['学生概览','教师概览','课程资料','课程设置','课程内容','课程成员','课程状态','文档编辑','演示文稿']) {
        useDocuments.getState().reset(); usePresentations.getState().reset()
        mode = 'slow'; setSurface(name); setRevision(value => value + 1); await next(); await next()
        assert(Boolean(document.querySelector('#check-stage [role=status]')), `${name}：真实首次请求显示加载状态`)
        mode = 'success'; release(); await waitFor(() => !document.querySelector('#check-stage [data-skeleton-region], #check-stage [data-resource-skeleton]'))
        await next()
        assert(!document.querySelector('#check-stage [role=alert]') && document.querySelector('#check-stage')!.textContent!.length > 15, `${name}：成功展示实际内容`)
        const stage = document.getElementById('check-stage')!
        assert(stage.scrollWidth <= stage.clientWidth + 1, `${name}：实际内容无页面横向溢出`)
        if (name === '文档编辑') {
          await waitFor(() => Boolean(document.querySelector('#check-stage .tiptap[contenteditable=true]')))
          const editor = document.querySelector<HTMLElement>('#check-stage .tiptap[contenteditable=true]')!
          assert(Boolean(editor), '实际 TipTap 编辑器完成本地协作同步')
          editor.focus(); document.execCommand('insertText', false, '保留文档草稿')
          await next()
          const textNode = editor.querySelector('p')!.firstChild!
          const range = document.createRange(); range.setStart(textNode, 2); range.setEnd(textNode, 4)
          const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range)
          await next()
          const selectedText = selection.toString()
          useDocuments.setState(state => ({list:state.list.map(document => ({...document,title:'本地协作文档更新'}))}))
          await next()
          assert(document.querySelector('#check-stage .tiptap') === editor && editor.textContent?.includes('保留文档草稿') && selectedText.length > 0 && window.getSelection()?.toString() === selectedText, '文档更新保留编辑器、草稿与选区')
        }
        useDocuments.getState().reset(); usePresentations.getState().reset()
        mode = 'error'; setRevision(value => value + 1); await next(); await next()
        await waitFor(() => Boolean(document.querySelector('#check-stage [role=alert]')))
        assert(Boolean(document.querySelector('#check-stage [role=alert]')) && !document.querySelector('#check-stage [data-skeleton-region]'), `${name}：首次失败只显示错误`)
        mode = 'success'
        const retry = [...document.querySelectorAll<HTMLButtonElement>('#check-stage button')].find(button => /重试|重新加载/.test(button.textContent || ''))
        assert(Boolean(retry), `${name}：失败有重试入口`)
        retry!.click(); await waitFor(() => !document.querySelector('#check-stage [role=alert]')); await next()
      }
      setResult(`${checks.length} 项通过`)
    } catch (error) { setResult(`失败：${String(error)}`) }
    finally {
      mode = 'success'; processingSource = false; release(); setBusy(false)
      setReport({date:new Date().toISOString(),width:innerWidth,height:innerHeight,theme:document.documentElement.className,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,checks})
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type:'application/json'}))
    const link = document.createElement('a'); link.href = url; link.download = `ui-experience-${innerWidth}-${document.documentElement.classList.contains('dark') ? 'dark' : 'light'}.json`; link.click(); URL.revokeObjectURL(url)
  }
  return <div className="flex h-dvh min-w-0 flex-col bg-background text-foreground">
    <header className={`${new URLSearchParams(location.search).get('capture') === '1' ? 'hidden' : 'flex'} shrink-0 flex-wrap items-center gap-2 border-b p-2 text-xs`}>
      <label>界面 <select aria-label="验收界面" value={surface} onChange={event => setSurface(event.target.value)}>{['骨架总览','主应用','Agent','邮件','日历','画布','资料','动效与焦点','学生概览','教师概览','课程资料','课程设置','课程内容','课程成员','课程状态','文档编辑','演示文稿','登录'].map(name => <option key={name}>{name}</option>)}</select></label>
      {surface === '骨架总览' && <select aria-label="骨架页面" value={selected} onChange={event => setSelected(event.target.value)}>{Object.keys(gallery).map(name => <option key={name}>{name}</option>)}</select>}
      <Button size="sm" variant="outline" onClick={() => document.documentElement.classList.toggle('dark')}>切换主题</Button>
      <Button size="sm" variant="outline" onClick={() => openSettingsDialog()}>设置弹窗</Button>
      <Button size="sm" disabled={busy} onClick={() => void run()}>运行检查</Button>
      <Button size="sm" variant="outline" disabled={!report} onClick={download}>保存结果</Button>
      <span role="status">{result}</span>
      {report && <details><summary>检查报告</summary><pre className="max-h-48 max-w-full overflow-auto whitespace-pre-wrap">{JSON.stringify(report, null, 2)}</pre></details>}
      <details><summary>加载场景</summary><div className="flex flex-wrap gap-2">{(['slow','success','empty','error'] as Mode[]).map(value => <Button key={value} size="sm" onClick={() => change(value)}>{value}</Button>)}<Button size="sm" onClick={() => { mode = 'success'; release?.() }}>完成请求</Button></div></details>
    </header>
    <main id="check-stage" className={`@container/calendar min-h-0 min-w-0 flex-1 overflow-auto ${surface === '骨架总览' ? 'p-4 admin-content' : ''}`}>
      {surface === '骨架总览' && gallery[selected]}
      {surface === '主应用' && <DesktopApp />}
      {surface === '登录' && <AuthScreen />}
      {surface === 'Agent' && <AgentsPage />}
      {surface === '邮件' && <MailPage key={revision} />}
      {surface === '日历' && <CalendarView />}
      {surface === '画布' && <CanvasView canvasId={canvas.id} />}
      {surface === '资料' && <div className="p-4"><ProjectSourceLibrary key={revision} projectId="workspace-personal" canManage /></div>}
      {surface === '学生概览' && <LearningDashboardPanel key={revision} space={learningSpace} section="overview" />}
      {surface === '教师概览' && <LearningDashboardPanel key={revision} space={teacherSpace} section="overview" />}
      {surface === '课程资料' && <LearningDashboardPanel key={revision} space={teacherSpace} section="resources" />}
      {(['课程设置','课程内容','课程成员','课程状态'].includes(surface)) && <CourseSettingsSection key={`${surface}:${revision}`} space={teacherSpace} section={({'课程设置':'profile','课程内容':'content','课程成员':'members','课程状态':'status'} as const)[surface as '课程设置']} />}
      {surface === '文档编辑' && <DocumentsView key={revision} />}
      {surface === '演示文稿' && <PresentationDrawerContent key={revision} presentationId="presentation-local" />}
      {surface === '动效与焦点' && <div className="p-4"><StableSurface identity={identity} text={text} /><Dialog><DialogTrigger asChild><Button className="mt-4">打开焦点检查</Button></DialogTrigger><DialogContent><DialogTitle>弹层焦点检查</DialogTitle><DialogDescription>Tab 不离开弹层，Escape 关闭后回到触发按钮。</DialogDescription><Input aria-label="弹层输入" /></DialogContent></Dialog></div>}
    </main>
    {surface !== '主应用' && <SettingsDialog />}
  </div>
}
const admin = new URLSearchParams(location.search).get('admin')
if (admin) { const initialMode = new URLSearchParams(location.search).get('state'); if (initialMode === 'slow' || initialMode === 'error' || initialMode === 'empty') mode = initialMode }
if (admin) history.replaceState(null, '', admin)
function AdminScenarioControls() {
  const [result, setResult] = useState('待运行'), [report, setReport] = useState<object | null>(null)
  async function run() {
    const checks: {name:string;pass:boolean}[] = []
    const assert = (condition: unknown, name: string) => { checks.push({name,pass:Boolean(condition)}); if (!condition) throw new Error(name) }
    const settled = async () => { for (let attempt = 0; attempt < 100 && adminQueryClient.isFetching(); attempt++) await pause(50); await pause(50) }
    try {
      setResult('检查中'); mode = 'success'; await adminQueryClient.invalidateQueries({ queryKey: ['data'] }); await settled()
      const main = document.getElementById('admin-main')!
      assert(Boolean(main?.querySelector('h1')) && !main.querySelector('[role=alert]'), '后台路由展示标题且无加载错误')
      assert(document.documentElement.scrollWidth <= innerWidth + 1, '后台页面无横向溢出')
      const content = main.querySelector('[data-slot=card], [data-slot=table], form, [data-slot=item]')
      mode = 'slow'; void adminQueryClient.invalidateQueries({ queryKey: ['data'] }); await pause(80)
      assert(Boolean(content?.isConnected), '后台刷新保留当前内容节点')
      mode = 'error'; release(); await settled()
      assert(Boolean(content?.isConnected) && Boolean(main.querySelector('[role=alert]')), '后台刷新失败保留内容并提示')
      mode = 'success'; await adminQueryClient.invalidateQueries({ queryKey: ['data'] }); await settled()
      assert(!main.querySelector('[role=alert]'), '后台重试恢复内容')
      setResult(`${checks.length} 项通过`)
    } catch (error) { setResult(`失败：${String(error)}`) }
    finally { mode = 'success'; release(); setReport({date:new Date().toISOString(),route:location.pathname+location.search,width:innerWidth,height:innerHeight,theme:document.documentElement.className,checks}) }
  }
  return <div style={{position:'fixed',bottom:8,right:8,zIndex:1000}}><details className="max-w-[calc(100vw-16px)] rounded-lg border bg-card p-2 text-xs"><summary>本地验收场景 · {result}</summary><div className="flex flex-wrap gap-1">{(['success','slow','empty','error'] as Mode[]).map(value => <Button key={value} size="sm" onClick={() => { mode = value; void adminQueryClient.invalidateQueries({ queryKey: ['data'] }) }}>{value}</Button>)}<Button size="sm" onClick={() => { mode = 'success'; release() }}>完成请求</Button><Button size="sm" onClick={() => void run()}>运行后台检查</Button></div>{report && <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(report, null, 2)}</pre>}</details></div>
}
async function render() {
  // Admin owns separate theme tokens; loading its CSS on Web would distort visual checks.
  if (admin) await import('../admin/src/admin.css')
  createRoot(document.getElementById('root')!).render(<AppThemeProvider><TooltipProvider><GlobalInteractionProvider>{admin ? <><AdminScenarioControls /><AdminApp /></> : <App />}</GlobalInteractionProvider></TooltipProvider></AppThemeProvider>)
}
void render()
