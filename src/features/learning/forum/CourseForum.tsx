import './forum-layout.css'
import { markdownText, withTaskState } from '@/features/content-editor/document'
import { createMemoNavigationState, resolveMemoDetailOrigin } from './memos/navigation'
import { MemoDisplaySettings, useForumDisplay } from './memos/MemoDisplaySettings'
import { checkAllTasks, uncheckAllTasks, toggleTaskAtLine } from './memos/markdown-task-actions'
import { toast } from 'sonner'
import { SelectField } from '@/components/ui/select-field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ForumReference } from './ForumReference'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownUpIcon, ArrowRightIcon, CalendarIcon, ChevronDownIcon, MoreHorizontalIcon, SearchIcon, SlidersHorizontalIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import { zhCN } from 'react-day-picker/locale'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { userFacingError } from '@/lib/userFacingError'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApp } from '@/stores/app'
import { useConversations } from '@/features/conversations/store'
import { homeworkApi } from '../homework/api'
import { MemoDetail } from './memos/MemoDetail'
import { useAuth } from '@/stores/auth'
import type { LearningSpace } from '../contracts'
import { forumApi } from './api'
import type { ForumFilter, ForumItem } from './contracts'
import { ForumComposer } from './ForumComposer'
import { ForumFiles } from './ForumContentFields'
import { ForumSidebar, forumSections, type ForumSection } from './ForumSidebar'
import { MemoCard } from './memos/MemoCard'
import { MemoContent } from './memos/MemoContent'

const kindLabels = { share: '自由讨论',assignment: '作业' }

export function CourseForum({ space }: { space: LearningSpace }) {
  const selectSection = (section: ForumSection) => {
    if (detailId) closeDetail()
    setKind(section)
  }
  const [display,setDisplay]=useForumDisplay()
  const isMobile = useIsMobile()
  const userId = useAuth(state => state.user?.id)
  const [editing, setEditing] = useState<ForumItem | null>(null), [archived, setArchived] = useState(false)
  const [items, setItems] = useState<ForumItem[]>([]), [nextOffset, setNextOffset] = useState<number | null>(null)
  const [kind, setKind] = useState<ForumFilter>('all'), [search, setSearch] = useState(''), [tag, setTag] = useState('')
  const [discussion, setDiscussion] = useState<ForumItem | null>(null)
  const [detailId,setDetailId]=useState(()=>new URLSearchParams(location.search).get('post'))
  const [detailError,setDetailError]=useState('')
  const returnFocus=useRef<HTMLElement | null>(null)
  const feed=useRef<HTMLDivElement>(null)
  const scroll=useRef(0)
  const origin=useRef('')
  const openDetail=(item:ForumItem)=>{
    returnFocus.current=document.activeElement as HTMLElement
    const container=feed.current?.closest('[data-forum-scroll]') ?? feed.current?.parentElement?.parentElement
    scroll.current=container?.scrollTop ?? 0
    origin.current=location.pathname+location.search
    const url=new URL(location.href);url.searchParams.set('post',item.id);url.searchParams.set('type',item.targetType)
    history.pushState({...history.state,...createMemoNavigationState(origin.current)},'',url);setDiscussion(item);setDetailId(item.id);setDetailError('')
    if(container) container.scrollTop=0
  }
  const closeDetail=()=>{
    const url=new URL(location.href);url.searchParams.delete('post');url.searchParams.delete('type')
    if(history.state?.from) history.back()
    else {history.replaceState(history.state,'',url);setDetailId(null);setDiscussion(null)}
  }
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [reference,setReference]=useState<string | null>(null)
  const [date, setDate] = useState<Date>(), [property, setProperty] = useState('all')
  const [deleting, setDeleting] = useState<ForumItem | null>(null)
  const [closing, setClosing] = useState<ForumItem | null>(null)
  const epoch = useRef(0)
  const canWrite = space.canSubmit || space.canEditContent
  useEffect(() => { setEditing(null); setReference(null); setDiscussion(null); setClosing(null); setTag(''); setSearch(''); setKind('all'); setArchived(false); setDate(undefined); setProperty('all') }, [space.courseId])
  const load = useCallback(async (offset = 0) => {
    if (!space.courseId) return
    const request = ++epoch.current
    setLoading(true); setError('')
    try {
      const until = date ? new Date(date) : undefined
      until?.setDate(until.getDate()+1)
      const result = await forumApi.list(space.courseId,{ kind,search,tag,offset,archived: String(archived), property, order:display.order,timeBasis:display.timeBasis, ...(date ? {from:date.toISOString(),until:until!.toISOString()}: {}) })
      if (request !== epoch.current) return
      setItems(previous => offset ? [...previous,...result.items] : result.items)
      setNextOffset(result.nextOffset)
    } catch (reason) { if (request === epoch.current) setError(userFacingError(reason, '学习论坛暂时无法加载，请重试。')) }
    finally { if (request === epoch.current) setLoading(false) }
  }, [space.courseId,kind,search,tag,archived,date,property,display.order,display.timeBasis])
  useEffect(() => {
    setItems([]); setNextOffset(null)
    const timer = setTimeout(() => { void load() }, 200)
    return () => { clearTimeout(timer); epoch.current++ }
  }, [load])
  useEffect(()=>{
    const restore=()=>{setDetailId(new URLSearchParams(location.search).get('post'));setDetailError('')}
    window.addEventListener('popstate',restore)
    return ()=>window.removeEventListener('popstate',restore)
  },[])
  useEffect(() => {
    if (!detailId || !space.courseId) { setDiscussion(null); return }
    let current = true
    setDetailError('')
    void forumApi.detail(space.courseId,detailId,new URLSearchParams(location.search).get('type')==='homework'?'homework':'post')
      .then(item=>{if(current)setDiscussion(item)}).catch(reason=>{if(current)setDetailError(userFacingError(reason,'内容不可访问。'))})
    return ()=>{current=false}
  },[space.courseId,detailId])
  useEffect(()=>{
    if(detailId) return
    const frame=requestAnimationFrame(()=>{
      const container=feed.current?.closest('[data-forum-scroll]') ?? feed.current?.parentElement?.parentElement
      if(container) container.scrollTop=scroll.current
      returnFocus.current?.focus({preventScroll:true})
    })
    return ()=>cancelAnimationFrame(frame)
  },[detailId])
  const copy = async (text: string) => {
    try {await navigator.clipboard.writeText(text); toast.success('已复制')}
    catch {setError('复制失败，请检查浏览器剪贴板权限。')}
  }
  const mutate = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try {
      await action(); await load()
      if (detailId && discussion && space.courseId) {
        if (deleting?.id === detailId) closeDetail()
        else setDiscussion(await forumApi.detail(space.courseId, discussion.id, discussion.targetType))
      }
    }
    catch (reason) { setError(userFacingError(reason, '操作失败，请重试。')) }
    finally { setBusy(false) }
  }
  if (!space.courseId) return <p role="status">请选择一门课程查看学习论坛。</p>
  const courseId = space.courseId
  const openHomework = () => void mutate(async () => {
    const agent = await homeworkApi.teacherRoom(courseId)
    await useConversations.getState().reload()
    if (useConversations.getState().projectId !== space.projectId || !useConversations.getState().list.some(item => item.id === agent.roomId)) throw new Error('404')
    useApp.getState().selectConversation(agent.roomId)
  })
  const itemActions = (item: ForumItem) => <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`管理：${item.title}`}><MoreHorizontalIcon /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
            {item.targetType === 'post' && item.authorId === userId && <DropdownMenuItem onSelect={() => setEditing(item)}>编辑内容</DropdownMenuItem>}
            {item.targetType === 'post' && item.authorId === userId && uncheckAllTasks(item.body) !== checkAllTasks(item.body) && <DropdownMenuItem onSelect={() => void mutate(() => forumApi.update(courseId,item,{...item,body:checkAllTasks(item.body) === item.body ? uncheckAllTasks(item.body) : checkAllTasks(item.body),editorDocument:withTaskState(item.editorDocument,checkAllTasks(item.body) === item.body ? uncheckAllTasks(item.body) : checkAllTasks(item.body))}))}>{checkAllTasks(item.body) === item.body ? '重置任务清单' : '完成全部任务'}</DropdownMenuItem>}
            {space.canEditContent && <DropdownMenuItem onSelect={() => void mutate(() => forumApi.flags(courseId,item,{ pinned: !item.pinned }))}>{item.pinned ? '取消置顶' : '置顶'}</DropdownMenuItem>}
            {(space.canEditContent || item.authorId === userId) && <DropdownMenuItem onSelect={() => void mutate(() => forumApi.flags(courseId,item,{ archived: !item.archived }))}>{item.archived ? '取消归档' : '归档'}</DropdownMenuItem>}
            {detailId!==item.id && <DropdownMenuItem onSelect={() => openDetail(item)}>打开内容</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => void copy(`${location.origin}/?${new URLSearchParams({project:space.projectId,view:'forum',post:item.id,type:item.targetType})}`)}>复制链接</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copy(item.body)}>复制内容</DropdownMenuItem>
            {item.targetType === 'post' && (space.canEditContent || item.authorId === userId) && <DropdownMenuItem onSelect={() => setDeleting(item)}>删除内容</DropdownMenuItem>}
            {item.targetType === 'post' && space.canEditContent && item.kind === 'assignment' && item.status === 'PUBLISHED' && <DropdownMenuItem onSelect={() => setClosing(item)}>关闭作业</DropdownMenuItem>}
          </DropdownMenuContent></DropdownMenu>
  const feedContent = <div ref={feed} hidden={Boolean(detailId)} className="forum-feed">
      <header className="forum-feed-heading">
        <h1>学习论坛</h1>
        {space.canEditContent && <Button disabled={busy} onClick={openHomework}>发布作业</Button>}
      </header>
      <nav aria-label="学习论坛版块" className="forum-top-tabs">
        {forumSections.map(({kind:value,label}) => <button key={value} type="button" aria-pressed={kind===value} onClick={()=>selectSection(value)}>{label}</button>)}
      </nav>
      <div className="forum-tools">
        <div className="relative min-w-0 flex-1"><SearchIcon aria-hidden="true" className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground"/><Input type="search" className="ps-9" aria-label="搜索学习论坛" placeholder="搜索标题与内容" value={search} onChange={event=>setSearch(event.target.value)} maxLength={200}/></div>
        <Popover><PopoverTrigger asChild><Button variant="ghost" aria-label="筛选"><SlidersHorizontalIcon className="size-4"/>筛选{(date || property!=='all' || archived || tag) && <span className="size-1.5 rounded-full bg-primary"/>}</Button></PopoverTrigger><PopoverContent className="w-80 space-y-4" align="end">
          <SelectField ariaLabel="内容筛选" value={property} onValueChange={setProperty} options={[
            {value:'all',label:'全部类型'},{value:'pinned',label:'已置顶'},{value:'attachments',label:'含附件'},
            {value:'links',label:'含链接'},{value:'tasks',label:'含任务清单'},{value:'code',label:'含代码'}]}/>
          <section aria-label="按日期筛选"><Calendar mode="single" selected={date} onSelect={setDate} locale={zhCN} labels={{labelNext:()=>'下个月',labelPrevious:()=>'上个月'}}/>
            {date && <Button variant="ghost" size="sm" onClick={()=>setDate(undefined)}>清除日期筛选</Button>}
          </section>
          <Button variant="ghost" size="sm" aria-pressed={archived} onClick={()=>setArchived(value=>!value)}>{archived?'返回内容流':'已归档'}</Button>
          {tag && <Button variant="ghost" size="sm" onClick={()=>setTag('')}>#{tag} · 清除标签筛选</Button>}
        </PopoverContent></Popover>
        <Popover><PopoverTrigger asChild><Button variant="ghost" aria-label="按日期排序"><ArrowDownUpIcon className="size-4"/>按日期排序<ChevronDownIcon className="size-4"/></Button></PopoverTrigger><PopoverContent className="w-64 space-y-4" align="end">
          <SelectField ariaLabel="排序时间" value={display.timeBasis} onValueChange={timeBasis=>setDisplay({...display,timeBasis:timeBasis as typeof display.timeBasis})} options={[{value:'created',label:'发布时间'},{value:'updated',label:'更新时间'}]}/>
          <SelectField ariaLabel="时间顺序" value={display.order} onValueChange={order=>setDisplay({...display,order:order as typeof display.order})} options={[{value:'desc',label:'最新在前'},{value:'asc',label:'最早在前'}]}/>
        </PopoverContent></Popover>
        <MemoDisplaySettings value={display} onChange={setDisplay}/>
      </div>
      {(date || property!=='all' || archived || tag) && <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        {date && <span>{date.toLocaleDateString('zh-CN')}</span>}{archived && <span>已归档</span>}{tag && <span>#{tag}</span>}
        <Button variant="ghost" size="sm" onClick={()=>{setDate(undefined);setProperty('all');setArchived(false);setTag('')}}>清除筛选</Button>
      </div>}
      {canWrite && <ForumComposer key={`${space.companyId}:${userId}:${courseId}`} space={space} onCreated={()=>{setKind('all');setSearch('');setTag('');void load()}}/>}
      {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">{error}<Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>重试</Button></div>}
      <div aria-busy={loading} data-forum-layout={display.columns} className={display.columns==='1'?"forum-list divide-y":"grid items-start gap-3 "+(display.columns==='2'?"@min-[40rem]/learning-grid:grid-cols-2":display.columns==='3'?"@min-[40rem]/learning-grid:grid-cols-2 @min-[60rem]/learning-grid:grid-cols-3":"grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))]")}>
        {loading && items.length === 0 && <div role="status" className="space-y-3"><span className="sr-only">正在加载学习论坛…</span>{[0, 1, 2].map(value => <Skeleton key={value} className="h-36 w-full rounded-lg motion-reduce:animate-none" />)}</div>}
        {!loading && !error && items.length === 0 && <p className="py-6 text-sm text-muted-foreground">没有符合条件的内容。</p>}
        {items.map(item => <MemoCard key={`${item.targetType}:${item.id}`} label={item.title} author={item.authorName} authorId={item.authorId} authorAvatarUrl={item.authorAvatarUrl} createdAt={display.timeBasis==='updated'?item.updatedAt:item.createdAt} pinned={item.pinned} search={search}
          actions={<><Badge variant="secondary">{kindLabels[item.kind]}</Badge>{itemActions(item)}</>}>
          {editing?.id === item.id && !detailId ? <ForumComposer key={`edit:${item.id}`} space={space} item={item} onCreated={() => { setEditing(null); void load() }} onCancel={() => setEditing(null)} /> : <>
          <h3 className="forum-item-title"><a href={`/?${new URLSearchParams({project:space.projectId,view:'forum',post:item.id,type:item.targetType})}`} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&event.button===0){event.preventDefault();openDetail(item)}}} className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring">{item.title}</a></h3>
          <div hidden={display.compact || display.columns!=='1'} data-slot="memo-body" className={`relative w-full min-w-0 flex flex-col items-start gap-2 ${display.compact || display.columns!=='1' ? 'max-h-72 overflow-hidden [mask-image:linear-gradient(black_80%,transparent)]' : ''}`}>
            {item.body && <MemoContent content={item.body} onTaskToggle={item.targetType === 'post' && item.authorId === userId && canWrite && !busy && !item.archived ? line=>void mutate(()=>forumApi.update(courseId,item,{...item,body:toggleTaskAtLine(item.body,line),editorDocument:withTaskState(item.editorDocument,toggleTaskAtLine(item.body,line))})) : undefined} />}
            <ForumFiles links={item.links} attachments={item.attachments} />
          </div>
          {(display.compact || display.columns!=='1') && <p className="forum-item-summary">{markdownText(item.body)}</p>}
          {item.tags.length > 0 && <div className="flex flex-wrap gap-1">{item.tags.map(value => <Button key={value} variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setTag(value)}>#{value}</Button>)}</div>}
          {item.sourceId && <Button variant="link" size="sm" onClick={() => setReference(item.sourceId)}>查看引用资料</Button>}
          {item.dueAt && <p className="forum-deadline"><CalendarIcon aria-hidden="true" className="size-4"/>截止 {new Date(item.dueAt).toLocaleString()}</p>}
          {item.status === 'CLOSED' && <Badge variant="outline">已关闭</Badge>}
          <div className="flex w-full flex-wrap items-center gap-1 pt-1 text-[13px]">
            {(item.reactions ?? []).map(reaction => <button key={reaction.emoji} type="button" className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted/40 px-2.5 text-[13px] text-muted-foreground hover:bg-muted/70 aria-pressed:bg-accent aria-pressed:text-accent-foreground focus-visible:outline-2" aria-label={`回应 ${reaction.emoji}`} aria-pressed={reaction.userIds.includes(userId ?? '')} disabled={!canWrite || item.archived || busy} onClick={() => void mutate(() => forumApi.react(courseId,item,reaction.emoji,!reaction.userIds.includes(userId ?? '')))}>{reaction.emoji} {reaction.userIds.length}</button>)}
            {item.targetType === 'post' && canWrite && !item.archived && <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm" aria-label={`添加回应：${item.title}`}>☺</Button></PopoverTrigger><PopoverContent className="w-auto flex gap-1">{['👍','❤️','🎉','🤔','👀','✅'].map(emoji => <Button key={emoji} variant="ghost" size="icon-sm" aria-label={`回应 ${emoji}`} disabled={busy} onClick={() => void mutate(() => forumApi.react(courseId,item,emoji,!(item.reactions ?? []).some(r => r.emoji===emoji && r.userIds.includes(userId ?? ''))))}>{emoji}</Button>)}</PopoverContent></Popover>}
            <Button variant="ghost" size="sm" onClick={() => openDetail(item)}>评论{item.commentCount > 0 ? `（${item.commentCount}）` : ''}</Button>
            {item.kind === 'assignment' && <Button variant="ghost" className="ms-auto font-semibold" onClick={() => openDetail(item)}>{item.targetType === 'homework' ? space.canReview ? '查看进度与验收' : '查看作业' : space.canReview ? '查看提交' : item.status === 'CLOSED' ? '查看提交记录' : '提交作业'}<ArrowRightIcon aria-hidden="true" className="size-4"/></Button>}
          </div>
          </>}
        </MemoCard>)}
        {!loading && !error && items.length>0 && nextOffset===null && <p className="forum-end">已显示全部内容</p>}
        {nextOffset !== null && <Button variant="outline" className="w-full" disabled={loading} onClick={() => void load(nextOffset)}>加载更多</Button>}
      </div>
      {reference && <ForumReference key={reference} projectId={space.projectId} sourceId={reference} onClose={()=>setReference(null)}/>}
      <AlertDialog open={Boolean(deleting)} onOpenChange={open => {if(!open) setDeleting(null)}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除这条内容？</AlertDialogTitle><AlertDialogDescription>删除后不再显示。已有提交的作业须关闭或归档，提交历史将保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => {if(deleting) void mutate(() => forumApi.remove(courseId,deleting)); setDeleting(null)}}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={Boolean(closing)} onOpenChange={open => { if (!open) setClosing(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>关闭这份作业？</AlertDialogTitle><AlertDialogDescription>关闭后不再接收新的提交，已有提交与历史版本会保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>暂不关闭</AlertDialogCancel><AlertDialogAction onClick={() => { if (closing) void mutate(() => forumApi.close(courseId, closing)); setClosing(null) }}>确认关闭</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
  const content=<>{feedContent}{detailId && (detailError ? <div role="alert">{detailError}<Button variant="link" onClick={closeDetail}>返回学习论坛</Button></div> : discussion?.id===detailId
    ? <MemoDetail key={`${discussion.targetType}:${discussion.id}`} space={space} item={discussion} from={resolveMemoDetailOrigin(history.state,`/?${new URLSearchParams({project:space.projectId,view:'forum'})}`)} onBack={closeDetail} onChanged={()=>void load()} actions={itemActions(discussion)} editor={editing?.id===discussion.id ? <ForumComposer space={space} item={discussion} onCreated={()=>void mutate(async()=>{setEditing(null)})} onCancel={()=>setEditing(null)}/> : undefined}/>
    : <p role="status">正在加载内容…</p>)}</>
  return <section className="forum-page @container/learning-grid flex h-full min-h-0 flex-col bg-background">
    {isMobile && !detailId && <header className="forum-mobile-header">
      <ForumSidebar kind={kind} onSelect={selectSection} date={date} onDate={value=>{setDate(value);if(detailId)closeDetail()}}/>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{space.title}</span>
    </header>}
    <div data-forum-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain"><div data-ui-page="forum">{detailId && error && <p role="alert" className="p-4 text-sm text-destructive">{error}</p>}{content}</div></div>
  </section>
}
