import { ProtectedFileLinks } from '@/components/retab/ui/protected-file-links'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './cases.css'
import { CaseCodeBlock } from './CaseCodeBlock'
import { CaseCard } from './CaseCard'
import { CaseReader } from './CaseReader'
import { CaseEditor } from './CaseEditor'
import { CaseDetailSkeleton, CaseListSkeleton } from './CaseSkeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { caseCatalogue } from './presentation'
import { ArrowLeft, Eye, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { usableDocument } from '@/features/content-editor/document'
import { ContentDocumentView } from '@/features/content-editor'
import { useAuth } from '@/stores/auth'
import { userFacingError } from '@/lib/userFacingError'
import { casesApi, type CaseArticle, type CaseInput, type CaseList, type CaseOptions } from './api'
import { caseArticleUrl, caseViewFromSearch, canManageCaseView, type CaseView } from './case-view'
import { submitCase } from './submission'
import { PageBody, PageHeader, PageLayout, PageToolbar } from '@/components/shell/PageHeader'
import { PanelCloseButton } from '@/components/shell/RightPanel'

const empty: CaseInput = { title: '', summary: '', body: '', cover: null, category: '', tags: [], college: '', coverText: '', coverColor: 'blue' }
function routeId() {
  const match = /^\/cases\/([^/]+)$/.exec(window.location.pathname)
  try { return match ? decodeURIComponent(match[1]) : new URLSearchParams(window.location.search).get('case') } catch { return '__invalid_case_url__' }
}
function Markdown({ body }: { body: string }) {
  return <div className="case-markdown space-y-5 break-words text-base leading-8 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:text-xl [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:focus-visible:outline-2 [&_img]:my-6 [&_img]:max-h-[36rem] [&_img]:rounded-xl [&_img]:object-contain [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-0 [&_blockquote]:border-s-2 [&_blockquote]:ps-4"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{pre: CaseCodeBlock, table: ({children}) => <div className="overflow-x-auto"><table>{children}</table></div>}}>{body}</ReactMarkdown></div>
}

export function CasesPage() {
  const companyId = useAuth(state => state.activeCompanyId)
  const user = useAuth(state => state.user)
  const userId = user?.id
  const [id, setId] = useState(routeId)
  const [view, setView] = useState(() => caseViewFromSearch(window.location.search))
  const [list, setList] = useState<CaseList>({ items: [], categories: [], canManage: false, view })
  const [article, setArticle] = useState<CaseArticle | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [visibleCount, setVisibleCount] = useState(6)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState<CaseInput>(empty)
  const [busy, setBusy] = useState(false)
  const [submissionStage, setSubmissionStage] = useState<'saving' | 'publishing' | null>(null)
  const [preview, setPreview] = useState(false)
  const [options, setOptions] = useState<CaseOptions>({ categories: [], colleges: [] })
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [optionBusy, setOptionBusy] = useState(false)
  const [optionError, setOptionError] = useState('')
  const [savedInput, setSavedInput] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CaseArticle | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const pageRoot = useRef<HTMLElement>(null)
  const operationEpoch = useRef(0)
  const mutationPending = useRef(false)
  const readRequest = useRef<AbortController | null>(null)
  const adoptedId = useRef<string | null>(null)
  const skipFocus = useRef(false)
  const currentScope = useRef(companyId)
  const currentView = useRef(view)
  currentView.current = view
  const articleUrl = (next?: string, nextView = view) => caseArticleUrl(window.location.search, companyId, next, nextView)
  const catalogue = caseCatalogue(list.items, { search, category, visibleCount })
  useEffect(() => { setVisibleCount(6) }, [search, category, view, companyId, userId])
  useEffect(() => { pageRoot.current?.querySelector('[data-page-scroll]')?.scrollTo(0, 0) }, [id, view, editing])
  useEffect(() => {
    currentScope.current = companyId
    mutationPending.current = false; setBusy(false); setEditing(false); setPreview(false); setInput(empty)
    setSubmissionStage(null); setNotice(''); setOptions({ categories: [], colleges: [] })
    setDeleteTarget(null); setDeleteError(''); setCategoryOpen(false); setOptionError(''); setOptionBusy(false)
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
    setDeleteTarget(null); setDeleteError(''); setCategoryOpen(false); setOptionError(''); setOptionBusy(false)
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
    const request = id ? casesApi.detail(id, view, abort.signal).then(value => { if (current() && value.view === view) setArticle(value) }) : casesApi.list('', '', view, abort.signal).then(value => { if (current() && value.view === view) setList(value) })
    void request.catch(reason => { if (current()) { setError(userFacingError(reason, '案例暂时无法加载，请重试。')); if (!id) setList(value => ({ ...value, items: [] })) } }).finally(() => { if (current()) setLoading(false) })
    return () => abort.abort()
  }, [id, view, revision, companyId, userId])
  useEffect(() => { if (skipFocus.current) { skipFocus.current = false; return }; heading.current?.focus({ preventScroll: true }) }, [id])
  const canManage = article?.canManage ?? list.canManage
  const managing = canManageCaseView(view, canManage)
  const beginEdit = () => {
    if (!managing || (article && article.view !== 'manage')) return
    const next: CaseInput = article ? { title: article.title, summary: article.summary, body: article.body, editorDocument: article.editorDocument, summaryDocument: article.summaryDocument, cover: article.cover, category: article.category, tags: article.tags, college: article.college ?? '', coverText: article.coverText ?? '', coverColor: article.coverColor ?? 'blue' } : { ...empty }
    setInput(next); setSavedInput(article ? JSON.stringify(next) : ''); setEditing(true); setPreview(false); setNotice(''); setError('')
  }
  const beginNew = () => {
    if (!canManage || busy) return
    navigate(undefined, 'manage')
    const url = new URL(window.location.href); url.searchParams.set('compose', '1')
    window.history.replaceState(null, '', url)
  }
  useEffect(() => {
    if (!loading && !id && managing && !editing && new URLSearchParams(window.location.search).has('compose')) beginEdit()
  }, [loading, id, managing, revision, editing])
  useEffect(() => {
    if (!editing || !managing) return
    const abort = new AbortController()
    void casesApi.options(abort.signal).then(value => { if (!abort.signal.aborted) setOptions(value) })
      .catch(reason => { if (!abort.signal.aborted) setError(userFacingError(reason, '分类与学院暂时无法加载，请重新打开编辑页。')) })
    return () => abort.abort()
  }, [editing, managing, companyId, userId])
  const createOption = async (kind: 'category' | 'college', name: string) => {
    if (!canManage) throw new Error('当前账号没有案例管理权限。')
    const epoch = operationEpoch.current
    const value = await casesApi.createOption(kind, name)
    if (epoch !== operationEpoch.current || useAuth.getState().activeCompanyId !== companyId || useAuth.getState().user?.id !== userId) throw new Error('页面已切换。')
    setOptions(value); setList(current => ({ ...current, categories: value.categories }))
    if (kind === 'college') editInput(current => ({ ...current, college: name }))
  }
  const addCategory = async () => {
    if (!categoryName.trim() || optionBusy) return
    setOptionBusy(true); setOptionError('')
    try { await createOption('category', categoryName.trim()); setCategoryOpen(false); setCategoryName('') }
    catch (reason) { setOptionError(userFacingError(reason, '分类未创建，请重试。')) }
    finally { setOptionBusy(false) }
  }
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
        adopt(saved); setSavedInput(JSON.stringify(input))
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
  const caseScope = `${userId ?? ''}:${companyId ?? ''}:${view}`
  const uploadAsset = async (file: File): Promise<string> => {
    if (!input.title.trim()) throw new Error('请先填写案例标题。')
    if (file.size > 8 * 1024 * 1024) throw new Error('附件最大为 8 MB。')
    const images = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    const supported = [...images,'audio/mpeg','audio/wav','audio/ogg','audio/mp4','video/mp4','video/webm','application/pdf']
    const mime = supported.includes(file.type) ? file.type : 'application/octet-stream'
    const operation = startMutation()
    if (!operation) throw new Error('请等待当前操作完成。')
    try {
      let target = article
      if (!target) { target = await casesApi.save(normalizedInput()); if (!operation.current()) throw new Error('页面已切换。'); adopt(target) }
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file) })
      if (!operation.current()) throw new Error('页面已切换。')
      const result = await casesApi.file(target.id, mime, data)
      if (!operation.current()) throw new Error('页面已切换。')
      setNotice('附件已上传，请保存草稿或保存并发布。')
      return result.url
    } catch (reason) { if (operation.current()) setError(userFacingError(reason, '附件上传失败，请重试。')); throw reason }
    finally { operation.finish() }
  }
  const detail = Boolean(id || editing)
  const invalid = busy || !input.title.trim() || input.body.length > 200000 || input.summary.length > 2000
  const body = (value: CaseInput) => <ProtectedFileLinks>{usableDocument(value.editorDocument, value.body) ? <ContentDocumentView document={value.editorDocument} legacyFormat="markdown" codeReadingView={<Markdown body={value.body}/>}/> : <Markdown body={value.body}/>}</ProtectedFileLinks>
  const managementMenu = canManage && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="案例管理" disabled={busy}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
    {view === 'reader' ? <DropdownMenuItem onSelect={() => navigate(id ?? undefined, 'manage')}>管理案例</DropdownMenuItem> : <>
      <DropdownMenuItem onSelect={() => navigate(article?.status === 'published' ? id ?? undefined : undefined, 'reader')}>阅读案例</DropdownMenuItem>
      {!detail && <DropdownMenuItem onSelect={beginNew}><Plus className="size-4" />新增案例</DropdownMenuItem>}
    </>}
  </DropdownMenuContent></DropdownMenu>
  const header = !detail
    ? <PageHeader className="case-page-header" title="教学案例" titleRef={heading} actions={<>{canManage && <Button className="case-new-button" onClick={beginNew}><Plus aria-hidden="true"/>新增案例</Button>}{managementMenu}</>} />
    : <PageHeader title={editing ? (preview ? '预览' : article ? '编辑案例' : '新增案例') : loading ? <><span className="sr-only">案例</span><span aria-hidden="true" className="inline-block h-[13px] w-[220px] max-w-[30vw] animate-pulse rounded-md bg-muted motion-reduce:animate-none" /></> : article?.title ?? '案例'} titleRef={heading}
        className="case-page-header"
        crumbs={[{ label: '教学案例', onSelect: busy ? undefined : () => navigate(undefined, 'reader') }, ...(editing && preview ? [{ label: article ? '编辑案例' : '新增案例', onSelect: () => setPreview(false) }] : [])]}
        leading={editing ? false : <PanelCloseButton back label="返回案例库" onClick={() => { if (!busy) navigate() }} className="-ms-2" />}
        actions={<div className="flex flex-wrap items-center justify-end gap-2">
          {!editing && managementMenu}
          {editing && managing ? <>
            {!preview && <Button type="submit" form="case-edit-form" name="intent" value="draft" variant="ghost" className="case-draft-save" disabled={invalid || savedInput === JSON.stringify(input)}>{submissionStage === 'saving' ? '正在保存…' : savedInput === JSON.stringify(input) ? '草稿已保存' : '保存草稿'}</Button>}
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setPreview(value => !value)}>{preview ? <ArrowLeft aria-hidden="true"/> : <Eye aria-hidden="true"/>}{preview ? '返回编辑' : '预览'}</Button>
            <Button type="submit" form="case-edit-form" name="intent" value="publish" disabled={invalid || !input.body.trim()}>{submissionStage === 'publishing' ? '正在发布…' : '发布'}</Button>
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
        </div>} />
  const card = (item: CaseArticle, featured = false) => <CaseCard key={item.id} article={item} href={articleUrl(item.id)}
    onNavigate={() => navigate(item.id)} featured={featured}
    actions={managing && item.view === 'manage' && item.canManage ? <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={`更多案例操作：${item.title}`} disabled={busy}><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onSelect={() => requestDelete(item)}><Trash2 aria-hidden="true" />删除案例</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu> : undefined} />
  return <main ref={pageRoot} aria-label="组织案例库" className="cases-page h-full min-h-0" data-case-editing={editing || undefined}>
    <PageLayout header={header} scrollProps={{ className: editing ? 'case-compose-frame' : 'cases-scroll' }}>
    {editing && managing ? <form id="case-edit-form" className="case-compose-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); void save((event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'publish') }}>
      {error && <p role="alert" className="case-compose-message text-destructive">{error}</p>}
      {notice && <p role="status" className="case-compose-message">{notice}</p>}
      <CaseEditor input={input} options={options} preview={preview} busy={busy} authorName={article?.authorName ?? user?.name ?? ''} authorAvatar={article?.authorAvatarUrl ?? user?.avatarUrl}
        onChange={editInput} onCreateCollege={name => createOption('college', name)} uploadFile={uploadAsset} onEditSummary={() => { setPreview(false); requestAnimationFrame(() => document.getElementById('case-summary-input')?.focus()) }}>{body(input)}</CaseEditor>
    </form> : <PageBody className="case-page-content">
      {error && <div role="alert" className="case-notice text-destructive">{error}{!editing && <Button variant="ghost" disabled={busy} onClick={() => setRevision(value => value + 1)}>重新加载</Button>}</div>}
      {notice && <p role="status" className="case-notice">{notice}</p>}
      {!detail && !loading && <>
        {!loading && !error && catalogue.featured && card(catalogue.featured, true)}
        <PageToolbar className="case-filters">
        <div role="group" aria-label="案例分类" className="case-categories">{['', ...list.categories].map(value => <Button key={value || 'all'} size="sm" variant="outline" aria-pressed={category === value} onClick={() => setCategory(value)}>{value || '全部'}</Button>)}{canManage && <Button type="button" variant="ghost" size="icon-sm" aria-label="添加分类" onClick={() => { setCategoryName(''); setOptionError(''); setCategoryOpen(true) }}><Plus aria-hidden="true"/></Button>}</div>
        <label className="case-search"><span className="sr-only">搜索案例</span><Search aria-hidden="true"/><Input type="search" placeholder="搜索案例" value={search} onChange={event => setSearch(event.target.value)}/></label>
        {(search || category) && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setCategory('') }}>清除筛选</Button>}
        </PageToolbar>
      </>}
      {loading ? (detail ? <CaseDetailSkeleton /> : <CaseListSkeleton featured={view === 'reader'} />) : article ? <CaseReader key={`${caseScope}:${article.id}`} article={article} scopeKey={caseScope}
        articleUrl={next => articleUrl(next, 'reader')} onNavigate={next => navigate(next, 'reader')}
        notice={managing && article.hasUnpublishedChanges ? <p className="case-notice">{article.status === 'published' ? '当前显示管理草稿；阅读视图仍显示上次发布版本。' : '当前为未发布草稿，仅案例管理者可见。'}</p> : undefined}>
        {body(article)}
      </CaseReader> : !id ? <>
        <div data-case-grid className="case-grid">{catalogue.items.map(item => card(item))}</div>
        {catalogue.hasMore && <div className="case-load-more"><Button variant="outline" onClick={() => setVisibleCount(value => value + 6)}>加载更多</Button></div>}
        {!catalogue.items.length && (search || category || !catalogue.featured) && !error && <div className="py-12 text-center"><h2 className="text-sm font-medium">{search || category ? '下方列表没有匹配的案例' : '还没有案例'}</h2><p className="mt-2 text-sm text-muted-foreground">{search || category ? '试试其他关键词或分类。' : managing ? '新建案例并发布后，组织内的学生即可阅读。' : '教师发布案例后，你可以在这里阅读。'}</p></div>}
      </> : null}
    </PageBody>}
    </PageLayout>
    <Dialog open={categoryOpen && !detail && canManage} onOpenChange={open => { if (!optionBusy) setCategoryOpen(open) }}>
      <DialogContent><DialogHeader><DialogTitle>添加分类</DialogTitle></DialogHeader>
        <form onSubmit={event => { event.preventDefault(); void addCategory() }} className="grid gap-4">
          <Input aria-label="分类名称" autoFocus maxLength={80} value={categoryName} disabled={optionBusy} onChange={event => setCategoryName(event.target.value)} placeholder="分类名称"/>
          {optionError && <p role="alert" className="text-sm text-destructive">{optionError}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={optionBusy} onClick={() => setCategoryOpen(false)}>取消</Button><Button type="submit" disabled={optionBusy || !categoryName.trim()}>{optionBusy ? '正在添加…' : '添加'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
