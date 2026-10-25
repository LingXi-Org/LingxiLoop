import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './cases.css'
import { CaseCodeBlock } from './CaseCodeBlock'
import { ArrowLeft, ImagePlus, LockKeyhole, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { markdownText, usableDocument } from '@/features/content-editor/document'
import { ContentEditor, ContentDocumentView } from '@/features/content-editor'
import { useAuth } from '@/stores/auth'
import { userFacingError } from '@/lib/userFacingError'
import { casesApi, type CaseArticle, type CaseInput, type CaseList } from './api'
import { CaseCover, caseCoverIdentity, caseCoverPending } from './CaseCover'
import { mergeCaseCoverMetadata } from './cover/polling'
import { useCaseCoverPolling } from './cover/useCaseCoverPolling'
import { caseArticleUrl, caseViewFromSearch, canManageCaseView, type CaseView } from './case-view'
import { submitCase } from './submission'
import { LearningPageHeader, LearningPageToolbar, LearningTopTabs } from '@/features/learning/components/LearningPageHeader'

const empty: CaseInput = { title: '', summary: '', body: '', cover: null, category: '', tags: [] }
const statusLabels = { draft: '草稿', published: '已发布', unpublished: '已下架' }
function routeId() {
  const match = /^\/cases\/([^/]+)$/.exec(window.location.pathname)
  try { return match ? decodeURIComponent(match[1]) : new URLSearchParams(window.location.search).get('case') } catch { return '__invalid_case_url__' }
}
function Markdown({ body }: { body: string }) {
  return <div className="case-markdown space-y-5 break-words text-base leading-8 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:text-xl [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:focus-visible:outline-2 [&_img]:my-6 [&_img]:max-h-[36rem] [&_img]:rounded-xl [&_img]:object-contain [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-0 [&_blockquote]:border-s-2 [&_blockquote]:ps-4"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{pre: CaseCodeBlock, table: ({children}) => <div className="overflow-x-auto"><table>{children}</table></div>}}>{body}</ReactMarkdown></div>
}

export function CasesPage() {
  const companyId = useAuth(state => state.activeCompanyId)
  const userId = useAuth(state => state.user?.id)
  const [id, setId] = useState(routeId)
  const [view, setView] = useState(() => caseViewFromSearch(window.location.search))
  const [list, setList] = useState<CaseList>({ items: [], categories: [], canManage: false, view })
  const [article, setArticle] = useState<CaseArticle | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState<CaseInput>(empty)
  const [busy, setBusy] = useState(false)
  const [submissionStage, setSubmissionStage] = useState<'saving' | 'publishing' | null>(null)
  const [preview, setPreview] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CaseArticle | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const coverUpload = useRef<HTMLInputElement>(null)
  const operationEpoch = useRef(0)
  const mutationPending = useRef(false)
  const readRequest = useRef<AbortController | null>(null)
  const adoptedId = useRef<string | null>(null)
  const skipFocus = useRef(false)
  const currentScope = useRef(companyId)
  const currentView = useRef(view)
  currentView.current = view
  const articleUrl = (next?: string, nextView = view) => caseArticleUrl(window.location.search, companyId, next, nextView)
  useEffect(() => {
    currentScope.current = companyId
    mutationPending.current = false; setBusy(false); setEditing(false); setPreview(false); setInput(empty)
    setSubmissionStage(null); setNotice('')
    setDeleteTarget(null); setDeleteError('')
    setArticle(null); setList({ items: [], categories: [], canManage: false, view: currentView.current })
    return () => { currentScope.current = null; operationEpoch.current += 1 }
  }, [companyId, userId])
  const changePage = (next: string | null, nextView: CaseView) => {
    const viewChanged = currentView.current !== nextView
    operationEpoch.current += 1
    readRequest.current?.abort()
    adoptedId.current = null
    currentView.current = nextView
    mutationPending.current = false; setBusy(false); setSubmissionStage(null)
    setDeleteTarget(null); setDeleteError('')
    setArticle(null)
    if (viewChanged) setList({ items: [], categories: [], canManage: false, view: nextView })
    setId(next); setView(nextView); setRevision(value => value + 1)
    setLoading(true); setEditing(false); setPreview(false); setNotice(''); setError('')
  }
  const navigate = (next?: string, nextView = view) => {
    window.history.pushState(null, '', articleUrl(next, nextView))
    changePage(next ?? null, nextView)
  }
  useEffect(() => {
    const restore = () => changePage(routeId(), caseViewFromSearch(window.location.search))
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  useEffect(() => {
    if (adoptedId.current === id && id) { adoptedId.current = null; setLoading(false); return }
    const abort = new AbortController()
    readRequest.current = abort
    const epoch = operationEpoch.current
    const current = () => !abort.signal.aborted && operationEpoch.current === epoch && currentView.current === view
    const requestedCompany = new URLSearchParams(window.location.search).get('company')
    if (requestedCompany && requestedCompany !== companyId) { setLoading(false); setArticle(null); setList({ items: [], categories: [], canManage: false, view: currentView.current }); setError('此案例属于其他组织，当前账号无权访问。'); return }
    setLoading(true); setError(''); if (!editing) setArticle(null)
    const timer = window.setTimeout(() => {
      const request = id ? casesApi.detail(id, view, abort.signal).then(value => { if (current() && value.view === view) setArticle(value) }) : casesApi.list(search, category, view, abort.signal).then(value => { if (current() && value.view === view) setList(value) })
      void request.catch(reason => { if (current()) { setError(userFacingError(reason, '案例暂时无法加载，请重试。')); if (!id) setList(value => ({ ...value, items: [] })) } }).finally(() => { if (current()) setLoading(false) })
    }, id ? 0 : 200)
    return () => { abort.abort(); window.clearTimeout(timer) }
  }, [id, view, search, category, revision, companyId, userId])
  useEffect(() => { if (skipFocus.current) { skipFocus.current = false; return }; heading.current?.focus({ preventScroll: true }) }, [id])
  const canManage = article?.canManage ?? list.canManage
  const managing = canManageCaseView(view, canManage)
  const beginEdit = () => { if (!managing || (article && article.view !== 'manage')) return; setInput(article ? { title: article.title, summary: article.summary, body: article.body, editorDocument: article.editorDocument, summaryDocument: article.summaryDocument, cover: article.cover, category: article.category, tags: article.tags } : { ...empty }); setEditing(true); setPreview(false); setNotice(''); setError('') }
  // Navigation invalidates completions; a settled request must never mutate a new page.
  const startMutation = () => {
    if (mutationPending.current) return null
    if (!managing || currentView.current !== 'manage' || currentScope.current !== companyId || useAuth.getState().activeCompanyId !== companyId || !useAuth.getState().user) {
      setError('当前案例管理页面已失效，请重新打开后重试。')
      return null
    }
    mutationPending.current = true
    readRequest.current?.abort()
    setLoading(false); setBusy(true); setError(''); setNotice('')
    const epoch = ++operationEpoch.current
    const userId = useAuth.getState().user?.id
    const current = () => operationEpoch.current === epoch && currentView.current === 'manage' && currentScope.current === companyId
      && useAuth.getState().activeCompanyId === companyId && useAuth.getState().user?.id === userId
    return { current, finish: () => { if (current()) { mutationPending.current = false; setBusy(false) } } }
  }
  const adopt = (saved: CaseArticle) => {
    setArticle(saved)
    if (!id) {
      adoptedId.current = saved.id; skipFocus.current = true
      window.history.pushState(null, '', articleUrl(saved.id)); setId(saved.id)
    }
  }
  const normalizedInput = () => ({ ...input, tags: [...new Set(input.tags.map(tag => tag.trim()).filter(Boolean))] })
  const editInput = (change: (value: CaseInput) => CaseInput) => { setInput(change); setNotice('') }
  const save = async (publish: boolean) => {
    if (!input.title.trim() || publish && !input.body.trim()) {
      setError(!input.title.trim() ? '请填写案例标题。' : '请填写正文后再发布，未完成的内容可以保存为草稿。')
      return
    }
    const operation = startMutation()
    if (!operation) return
    setSubmissionStage('saving')
    try {
      const result = await submitCase(normalizedInput(), article ?? undefined, publish, casesApi, operation.current, saved => {
        adopt(saved)
        if (publish) setSubmissionStage('publishing')
      })
      if (result.status === 'obsolete') return
      if (result.status === 'save-failed') {
        setError(`草稿未保存。${userFacingError(result.error, '请重试。')}当前输入已保留。`)
      } else if (result.status === 'publish-failed') {
        setError(`草稿已保存，发布未完成。${userFacingError(result.error, '请重试发布。')}当前输入已保留。`)
      } else {
        setArticle(result.article)
        setNotice(result.status === 'published' ? '案例已发布。' : '草稿已保存，读者看到的内容未改变。')
        if (result.status === 'published') { setEditing(false); setPreview(false) }
      }
    } finally { if (operation.current()) setSubmissionStage(null); operation.finish() }
  }
  const action = async (kind: 'unpublish' | 'retry-index') => {
    if (!article || article.view !== 'manage') return
    const operation = startMutation()
    if (!operation) return
    try { const next = await casesApi.action(article, kind); if (!operation.current()) return; setArticle(next); setNotice(kind === 'unpublish' ? '案例已下架，学生不可阅读或检索。' : '已提交索引重试。') }
    catch (reason) { if (operation.current()) setError(userFacingError(reason, '操作失败，请重试。')) }
    finally { operation.finish() }
  }
  const requestDelete = (target: CaseArticle) => {
    if (!managing || target.view !== 'manage' || !target.canManage || mutationPending.current) return
    setDeleteTarget(target); setDeleteError('')
  }
  const deleteCase = async () => {
    const target = deleteTarget
    if (!target || target.view !== 'manage' || !target.canManage) return
    const operation = startMutation()
    if (!operation) return
    setDeleteError('')
    try {
      await casesApi.remove(target)
      if (!operation.current()) return
      setList(current => ({ ...current, items: current.items.filter(item => item.id !== target.id) }))
      setDeleteTarget(null)
      if (id === target.id) navigate(undefined, 'manage')
      else setRevision(value => value + 1)
      setNotice('案例已删除。')
    } catch (reason) {
      if (operation.current()) setDeleteError(`删除失败。${userFacingError(reason, '请重试。')}`)
    } finally { operation.finish() }
  }
  const retryCover = async (target: CaseArticle) => {
    if (target.view !== 'manage') return
    const operation = startMutation()
    if (!operation) return
    try {
      const next = await casesApi.retryCover(target)
      if (!operation.current()) return
      setArticle(current => current?.id === target.id ? { ...current, generatedCover: next.generatedCover } : current)
      setList(current => ({ ...current, items: current.items.map(item => item.id === target.id ? { ...item, generatedCover: next.generatedCover } : item) }))
      setNotice('已提交封面重试，完成后自动更新。')
    } catch (reason) {
      if (operation.current()) setError(userFacingError(reason, '封面重试失败，请稍后再试。'))
      throw reason
    } finally { operation.finish() }
  }
  const coverScope = `${userId ?? ''}:${companyId ?? ''}:${view}`
  const coverSources = id || editing ? article ? [article] : [] : list.items
  const { resume: refreshCoverStatus } = useCaseCoverPolling<CaseArticle | CaseList>({
    scopeKey: JSON.stringify([coverScope, id, search, category, coverSources.map(item => [item.id, caseCoverIdentity(item.generatedCover)])]),
    pending: !loading && !busy && coverSources.some(item => caseCoverPending(item.generatedCover)),
    refresh: signal => id ? casesApi.detail(id, view, signal) : casesApi.list(search, category, view, signal),
    receive: value => {
      if (value.view !== view || currentView.current !== view || useAuth.getState().activeCompanyId !== companyId || useAuth.getState().user?.id !== userId) return false
      if ('items' in value) {
        const incoming = new Map(value.items.map(item => [item.id, item]))
        setList(current => ({ ...current, items: current.items.map(item => incoming.has(item.id) ? mergeCaseCoverMetadata(item, incoming.get(item.id)!) : item) }))
        return coverSources.some(item => incoming.has(item.id) && caseCoverPending(mergeCaseCoverMetadata(item, incoming.get(item.id)!).generatedCover))
      }
      if (!article || article.id !== value.id) return false
      setArticle(current => current ? mergeCaseCoverMetadata(current, value) : current)
      return caseCoverPending(mergeCaseCoverMetadata(article, value).generatedCover)
    },
  })
  const uploadAsset = async (file: File, cover = false): Promise<string> => {
    if (!input.title.trim()) throw new Error('请先填写案例标题。')
    if (file.size > 8 * 1024 * 1024) throw new Error('附件最大为 8 MB。')
    const images = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    if (cover && !images.includes(file.type)) throw new Error('请选择 PNG、JPEG、WebP 或 GIF 封面。')
    const supported = [...images,'audio/mpeg','audio/wav','audio/ogg','audio/mp4','video/mp4','video/webm','application/pdf']
    const mime = supported.includes(file.type) ? file.type : 'application/octet-stream'
    const operation = startMutation()
    if (!operation) throw new Error('请等待当前操作完成。')
    try {
      let target = article
      if (!target) { target = await casesApi.save(normalizedInput()); if (!operation.current()) throw new Error('页面已切换。'); adopt(target) }
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file) })
      if (!operation.current()) throw new Error('页面已切换。')
      const result = await (cover ? casesApi.image : casesApi.file)(target.id, mime, data)
      if (!operation.current()) throw new Error('页面已切换。')
      setNotice('附件已上传，请保存草稿或保存并发布。')
      return result.url
    } catch (reason) { if (operation.current()) setError(userFacingError(reason, '附件上传失败，请重试。')); throw reason }
    finally { operation.finish() }
  }
  const uploadCover = async (file?: File) => {
    if (!file) return
    try { const cover = await uploadAsset(file, true); setInput(value => ({ ...value, cover })) }
    catch (reason) { setError(userFacingError(reason, '封面上传失败，请重试。')) }
  }

  const content = editing ? input : article
  const detail = Boolean(id || editing)
  const invalid = busy || !input.title.trim() || input.body.length > 200000 || input.summary.length > 2000
  const date = (value: CaseArticle) => new Date(value.publishedAt ?? value.createdAt ?? value.updatedAt).toLocaleDateString('zh-CN').replaceAll('/', '.')
  const body = (value: CaseInput) => usableDocument(value.editorDocument, value.body) ? <ContentDocumentView document={value.editorDocument}/> : <Markdown body={value.body}/>
  const hero = content && <div data-case-hero className="case-hero">
    <div className="case-cover">
      <CaseCover cover={article?.generatedCover} fallbackUrl={content.cover} title={content.title} scopeKey={`${coverScope}:${article?.id ?? 'new'}`}
        className="h-full [&>div:first-child]:h-full [&>div:first-child]:aspect-auto" busy={busy} onRefresh={refreshCoverStatus}
        onRetry={managing && article?.view === 'manage' ? () => retryCover(article) : undefined}/>
      {editing && !preview && <div className="case-cover-actions">
        <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="icon-sm" variant="outline" aria-label="封面更多操作" disabled={busy}><MoreHorizontal/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!input.title.trim()} onSelect={() => coverUpload.current?.click()}><ImagePlus aria-hidden="true"/>{input.cover ? '更换备用图片' : '上传备用图片'}</DropdownMenuItem>
            {input.cover && <DropdownMenuItem onSelect={() => editInput(value => ({...value, cover: null}))}>移除备用图片</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
        <input ref={coverUpload} hidden aria-label="上传备用封面" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy || !input.title.trim()} onChange={event => { void uploadCover(event.target.files?.[0]); event.target.value = '' }}/>
      </div>}
    </div>
    <div className="case-hero-copy">
      {editing && <div hidden={preview}>
        <label><span className="sr-only">标题</span><Textarea required maxLength={200} disabled={busy} className="case-title-input" placeholder="案例标题" rows={1} value={input.title} onChange={event => editInput(value => ({...value, title: event.target.value}))}/></label>
        <div className="case-summary case-inline-editor"><span className="case-editor-label" aria-hidden="true">摘要</span><ContentEditor legacyFormat="markdown" label="摘要" compact value={input.summary} document={input.summaryDocument} maxLength={2000} disabled={busy} uploadFile={file => uploadAsset(file)} onChange={(summary, summaryDocument) => editInput(value => ({...value, summary, summaryDocument}))}/></div>
      </div>}
      {(!editing || preview) && <div><h2 className="case-title">{content.title}</h2><div className="case-summary">{usableDocument(content.summaryDocument, content.summary) ? <ContentDocumentView document={content.summaryDocument}/> : <p>{content.summary}</p>}</div></div>}
      {editing && !preview ? <div className="case-edit-metadata">
        <label className="flex items-center gap-2 text-sm"><span>分类</span><Input list="case-categories" aria-label="分类" maxLength={80} className="w-28" value={input.category} onChange={event => editInput(value => ({...value, category: event.target.value}))}/></label>
        <datalist id="case-categories">{list.categories.map(value => <option key={value} value={value}/>)}</datalist>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm"><span className="shrink-0">标签</span><Input aria-label="标签（逗号分隔）" placeholder="用逗号分隔" value={input.tags.join(',')} onChange={event => editInput(value => ({...value, tags: event.target.value.split(/[,，]/)}))}/></label>
        <span className="flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole aria-hidden="true" className="size-4"/>{article?.status === 'published' ? '未发布修改仅案例管理者可见' : '草稿仅案例管理者可见'}</span>
      </div> : <div className="case-metadata">
        {article && <time dateTime={article.publishedAt ?? article.createdAt ?? article.updatedAt}>{date(article)}</time>}
        <span>{content.category || '未分类'}</span>
        {content.tags.map(tag => <span key={tag}>{tag}</span>)}
        {article?.authorName && <span className="case-author"><Avatar size="sm"><AvatarImage src={article.authorAvatarUrl ?? undefined} alt=""/><AvatarFallback>{article.authorName.slice(0, 1)}</AvatarFallback></Avatar>{article.authorName}</span>}
        <span className="case-status">{editing && preview ? '草稿预览' : statusLabels[article?.status ?? 'draft']}</span>
      </div>}
    </div>
  </div>
  return <main aria-label="组织案例库" className="cases-page learning-page-surface">
    <div className={detail ? 'case-detail-shell' : 'learning-page-shell'}>
      {!detail && <LearningPageHeader title="案例库" headingRef={heading} actions={<>
        {view === 'reader' ? canManage && <Button variant="outline" disabled={busy} onClick={() => navigate(undefined, 'manage')}>管理案例</Button> : <Button variant="outline" disabled={busy} onClick={() => navigate(undefined, 'reader')}>阅读案例</Button>}
        {managing && <Button disabled={busy} onClick={beginEdit}><Plus className="size-4"/>新建案例</Button>}
      </>} />}
      {detail && <header className="case-toolbar case-detail-toolbar">
        <h1 ref={heading} tabIndex={-1} className="sr-only">案例库</h1>
        {detail && <Button variant="ghost" disabled={busy} onClick={() => navigate()}><ArrowLeft className="size-4"/>返回案例库</Button>}
        <div className="ms-auto flex flex-wrap items-center justify-end gap-3">
          {view === 'reader' ? canManage && <Button variant="outline" disabled={busy} onClick={() => navigate(id ?? undefined, 'manage')}>管理案例</Button> : <Button variant="outline" disabled={busy} onClick={() => navigate(article?.status === 'published' ? id ?? undefined : undefined, 'reader')}>阅读案例</Button>}
          {editing && managing ? <>
            <span className="text-sm text-muted-foreground">草稿</span>
            <Button type="submit" form="case-edit-form" name="intent" value="draft" variant="outline" disabled={invalid}>{submissionStage === 'saving' ? '正在保存…' : '保存草稿'}</Button>
            <Button type="button" variant="outline" aria-pressed={preview} disabled={busy} onClick={() => setPreview(value => !value)}>{preview ? '继续编辑' : '预览'}</Button>
            {!input.body.trim() && <span id="case-publish-help" className="text-xs text-muted-foreground">填写正文后可发布</span>}
            <Button type="submit" form="case-edit-form" name="intent" value="publish" disabled={invalid || !input.body.trim()} aria-describedby={!input.body.trim() ? 'case-publish-help' : undefined}>{submissionStage === 'publishing' ? '正在发布…' : '发布'}</Button>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="编辑选项" disabled={busy}><MoreHorizontal/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setEditing(false)}>取消编辑</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          </> : managing && article?.view === 'manage' && <>
            <Button variant="outline" onClick={beginEdit}><Pencil className="size-4"/>编辑案例</Button>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="更多案例操作" disabled={busy}><MoreHorizontal/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
              {article.status === 'published' && <DropdownMenuItem onSelect={() => void action('unpublish')}>下架案例</DropdownMenuItem>}
              {article.indexStatus === 'failed' && <DropdownMenuItem onSelect={() => void action('retry-index')}>重试索引</DropdownMenuItem>}
              <DropdownMenuItem disabled>知识索引：{article.indexStatus === 'ready' ? '已同步' : article.indexStatus === 'failed' ? '同步失败' : article.indexStatus ? '正在同步' : '未发布'}</DropdownMenuItem>
              <DropdownMenuSeparator/>
              <DropdownMenuItem variant="destructive" onSelect={() => requestDelete(article)}><Trash2 aria-hidden="true"/>删除案例</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </>}
        </div>
      </header>}
      {error && <div role="alert" className="case-notice text-destructive">{error}{!editing && <Button variant="ghost" disabled={busy} onClick={() => setRevision(value => value + 1)}>重新加载</Button>}</div>}
      {notice && <p role="status" className="case-notice">{notice}</p>}
      {!detail && <>
        <LearningTopTabs label="案例分类" value={category} onValueChange={setCategory} items={['', ...list.categories].map(value => ({ value, label: value || '全部' }))} />
        <LearningPageToolbar>
        <label className="learning-page-search relative"><span className="sr-only">关键词搜索</span><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground"/><Input type="search" className="ps-9" placeholder="搜索案例" value={search} onChange={event => setSearch(event.target.value)}/></label>
        {(search || category) && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setCategory('') }}>清除筛选</Button>}
        </LearningPageToolbar>
      </>}
      {editing && managing ? <form id="case-edit-form" aria-busy={busy} onSubmit={event => {
        event.preventDefault()
        void save((event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'publish')
      }}>
        <fieldset disabled={busy} className="min-w-0">
          <section aria-label={preview ? '案例预览' : '编辑案例'}>{hero}
            <div className="case-body-divider"><div data-case-body className="case-body">
              <div hidden={preview} className="case-inline-editor"><span className="case-editor-label" aria-hidden="true">正文</span><ContentEditor legacyFormat="markdown" label="正文" value={input.body} document={input.editorDocument} maxLength={200000} disabled={busy} uploadFile={file => uploadAsset(file)} onChange={(body, editorDocument) => editInput(value => ({...value, body, editorDocument}))}/></div>
              {preview && body(input)}
            </div></div>
          </section>
        </fieldset>
      </form> : loading ? <p role="status" className="case-notice py-8">正在加载案例…</p> : article ? <article>
        {hero}
        {managing && article.hasUnpublishedChanges && <p className="case-notice">{article.status === 'published' ? '当前显示管理草稿；阅读视图仍显示上次发布版本。' : '当前为未发布草稿，仅案例管理者可见。'}</p>}
        <div className="case-body-divider"><div data-case-body className="case-body">{body(article)}</div></div>
      </article> : !id ? <>
        <div data-case-grid className="case-grid">{list.items.map(item => <article key={item.id}>
          <div className="case-grid-cover relative"><CaseCover cover={item.generatedCover} fallbackUrl={item.cover} title={item.title} scopeKey={`${coverScope}:${item.id}`}
            className="h-full [&>div:first-child]:h-full [&>div:first-child]:aspect-auto" busy={busy} onRefresh={refreshCoverStatus}
            onRetry={managing && item.view === 'manage' && item.canManage ? () => retryCover(item) : undefined}/></div>
          <div className="flex items-start gap-2">
            <a href={articleUrl(item.id)} onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(item.id) } }} className="case-grid-link min-w-0 flex-1">
              <div className="case-grid-meta"><time dateTime={item.publishedAt ?? item.createdAt ?? item.updatedAt}>{date(item)}</time><span>·</span><span>{item.category || '未分类'}</span>{managing && item.status !== 'published' && <span>{statusLabels[item.status]}</span>}</div>
              <h2>{item.title}</h2><p>{markdownText(item.summary)}</p>
            </a>
            {managing && item.view === 'manage' && item.canManage && <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" className="mt-2" variant="ghost" size="icon-sm" aria-label={`更多案例操作：${item.title}`} disabled={busy}><MoreHorizontal/></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onSelect={() => requestDelete(item)}><Trash2 aria-hidden="true"/>删除案例</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>}
          </div>
        </article>)}</div>
        {!list.items.length && !error && <div className="py-12 text-center"><h2 className="text-sm font-medium">{search || category ? '没有找到匹配的案例' : '还没有案例'}</h2><p className="mt-2 text-sm text-muted-foreground">{search || category ? '试试其他关键词或分类。' : managing ? '新建案例并发布后，组织内的学生即可阅读。' : '教师发布案例后，你可以在这里阅读。'}</p></div>}
      </> : null}
    </div>
    <AlertDialog open={deleteTarget !== null} onOpenChange={open => { if (!open && !busy) { setDeleteTarget(null); setDeleteError('') } }}>
      <AlertDialogContent aria-busy={busy}>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">删除案例“{deleteTarget?.title}”？</AlertDialogTitle>
          <AlertDialogDescription>删除后，该案例将从案例库和搜索中移除，已有链接和附件将不可访问。</AlertDialogDescription>
        </AlertDialogHeader>
        {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={event => { event.preventDefault(); void deleteCase() }}>{busy ? '正在删除…' : '删除'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>
}
