import { MemoDisplaySettings, useForumDisplay } from './memos/MemoDisplaySettings'
import { checkAllTasks, uncheckAllTasks, toggleTaskAtLine } from './memos/markdown-task-actions'
import { toast } from 'sonner'
import { SelectField } from '@/components/ui/select-field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ForumReference } from './ForumReference'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MoreHorizontalIcon, SearchIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { userFacingError } from '@/lib/userFacingError'
import { useIsMobile } from '@/hooks/use-mobile'
import { useAuth } from '@/stores/auth'
import type { LearningSpace } from '../contracts'
import { DashboardSectionFrame } from '../dashboard/DashboardSectionFrame'
import { forumApi } from './api'
import type { ForumFilter, ForumItem } from './contracts'
import { ForumComposer } from './ForumComposer'
import { ForumFiles } from './ForumContentFields'
import { ForumDiscussion } from './ForumDiscussion'
import { ForumSubmission } from './ForumSubmission'
import { ForumSidebar, forumSections } from './ForumSidebar'
import { MemoCard } from './memos/MemoCard'
import { MemoContent } from './memos/MemoContent'

const kindLabels = { share: '自由讨论',assignment: '作业' }

export function CourseForum({ space }: { space: LearningSpace }) {
  const [display,setDisplay]=useForumDisplay()
  const isMobile = useIsMobile()
  const userId = useAuth(state => state.user?.id)
  const [editing, setEditing] = useState<ForumItem | null>(null), [archived, setArchived] = useState(false)
  const [items, setItems] = useState<ForumItem[]>([]), [nextOffset, setNextOffset] = useState<number | null>(null)
  const [kind, setKind] = useState<ForumFilter>('all'), [search, setSearch] = useState(''), [tag, setTag] = useState('')
  const [discussion, setDiscussion] = useState<ForumItem | null>(null), [submission, setSubmission] = useState<ForumItem | null>(null)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [reference,setReference]=useState<string | null>(null)
  const [date, setDate] = useState<Date>(), [property, setProperty] = useState('all')
  const [deleting, setDeleting] = useState<ForumItem | null>(null)
  const [closing, setClosing] = useState<ForumItem | null>(null)
  const epoch = useRef(0)
  const canWrite = space.canSubmit || space.canEditContent
  useEffect(() => { setEditing(null); setReference(null); setDiscussion(null); setSubmission(null); setClosing(null); setTag(''); setSearch(''); setKind('all'); setArchived(false); setDate(undefined); setProperty('all') }, [space.courseId])
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
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('post')
    if (!id || !space.courseId) return
    let current = true
    void forumApi.detail(space.courseId,id).then(item => {if(current) setDiscussion(item)}).catch(reason => {if(current) setError(userFacingError(reason,'内容不可访问。'))})
    return () => {current=false}
  },[space.courseId])
  const copy = async (text: string) => {
    try {await navigator.clipboard.writeText(text); toast.success('已复制')}
    catch {setError('复制失败，请检查浏览器剪贴板权限。')}
  }
  const mutate = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await action(); await load() }
    catch (reason) { setError(userFacingError(reason, '操作失败，请重试。')) }
    finally { setBusy(false) }
  }
  if (!space.courseId) return <p role="status">请选择一门课程查看学习论坛。</p>
  const courseId = space.courseId
  const content = <div className="min-w-0 space-y-5">
        {canWrite && <ForumComposer key={`${space.companyId}:${userId}:${courseId}`} space={space} onCreated={() => { setKind('all'); setSearch(''); setTag(''); void load() }} />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{forumSections.find(section => section.kind === kind)?.label}</h2>
          <div className="relative min-w-0 flex-1 basis-48 @min-[40rem]/learning-grid:max-w-64"><SearchIcon aria-hidden="true" className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted-foreground" /><Input type="search" className="ps-9" aria-label="搜索学习论坛" placeholder="搜索标题与内容" value={search} onChange={event => setSearch(event.target.value)} maxLength={200} /></div>
        </div>
      {tag && <Button variant="outline" size="sm" onClick={() => setTag('')}>#{tag} · 清除标签筛选</Button>}
      <Button variant="ghost" size="sm" aria-pressed={archived} onClick={() => setArchived(value => !value)}>{archived ? '返回内容流' : '已归档'}</Button>
      <MemoDisplaySettings value={display} onChange={setDisplay}/>
      <SelectField ariaLabel="内容筛选" value={property} onValueChange={setProperty} options={[
        {value:'all',label:'全部内容类型'},{value:'pinned',label:'已置顶'},{value:'attachments',label:'含附件'},
        {value:'links',label:'含链接'},{value:'tasks',label:'含任务清单'},{value:'code',label:'含代码'}]}/>
      {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">{error}<Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>重试</Button></div>}
      <div aria-busy={loading} data-forum-layout={display.columns} className={display.columns==='1'?"space-y-3":"grid items-start gap-3 "+(display.columns==='2'?"@min-[40rem]/learning-grid:grid-cols-2":display.columns==='3'?"@min-[40rem]/learning-grid:grid-cols-2 @min-[60rem]/learning-grid:grid-cols-3":"grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))]")}>
        {loading && items.length === 0 && <div role="status" className="space-y-3"><span className="sr-only">正在加载学习论坛…</span>{[0, 1, 2].map(value => <Skeleton key={value} className="h-36 w-full rounded-lg motion-reduce:animate-none" />)}</div>}
        {!loading && !error && items.length === 0 && <p className="py-6 text-sm text-muted-foreground">没有符合条件的内容。</p>}
        {items.map(item => <MemoCard key={`${item.targetType}:${item.id}`} label={item.title} author={item.authorName} createdAt={display.timeBasis==='updated'?item.updatedAt:item.createdAt} pinned={item.pinned} search={search}
          actions={<><Badge variant="secondary">{kindLabels[item.kind]}</Badge><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`管理：${item.title}`}><MoreHorizontalIcon /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
            {item.authorId === userId && <DropdownMenuItem onSelect={() => setEditing(item)}>编辑内容</DropdownMenuItem>}
            {item.authorId === userId && uncheckAllTasks(item.body) !== checkAllTasks(item.body) && <DropdownMenuItem onSelect={() => void mutate(() => forumApi.update(courseId,item,{...item,body:checkAllTasks(item.body) === item.body ? uncheckAllTasks(item.body) : checkAllTasks(item.body)}))}>{checkAllTasks(item.body) === item.body ? '重置任务清单' : '完成全部任务'}</DropdownMenuItem>}
            {space.canEditContent && <DropdownMenuItem onSelect={() => void mutate(() => forumApi.flags(courseId,item,{ pinned: !item.pinned }))}>{item.pinned ? '取消置顶' : '置顶'}</DropdownMenuItem>}
            {(space.canEditContent || item.authorId === userId) && <DropdownMenuItem onSelect={() => void mutate(() => forumApi.flags(courseId,item,{ archived: !item.archived }))}>{item.archived ? '取消归档' : '归档'}</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => setDiscussion(item)}>打开内容</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copy(`${location.origin}/?${new URLSearchParams({project:space.projectId,view:'forum',post:item.id})}`)}>复制链接</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copy(item.body)}>复制内容</DropdownMenuItem>
            {(space.canEditContent || item.authorId === userId) && <DropdownMenuItem onSelect={() => setDeleting(item)}>删除内容</DropdownMenuItem>}
            {space.canEditContent && item.kind === 'assignment' && item.status === 'PUBLISHED' && <DropdownMenuItem onSelect={() => setClosing(item)}>关闭作业</DropdownMenuItem>}
          </DropdownMenuContent></DropdownMenu></>}>
          {editing?.id === item.id ? <ForumComposer key={`edit:${item.id}`} space={space} item={item} onCreated={() => { setEditing(null); void load() }} onCancel={() => setEditing(null)} /> : <>
          <h3 className="text-base font-semibold leading-6">{item.title}</h3>
          <div data-slot="memo-body" className={`relative w-full min-w-0 flex flex-col items-start gap-2 ${display.compact || display.columns!=='1' ? 'max-h-72 overflow-hidden [mask-image:linear-gradient(black_80%,transparent)]' : ''}`}>
            {item.body && <MemoContent content={item.body} onTaskToggle={item.authorId === userId && canWrite && !busy && !item.archived ? line=>void mutate(()=>forumApi.update(courseId,item,{...item,body:toggleTaskAtLine(item.body,line)})) : undefined} />}
            <ForumFiles links={item.links} attachments={item.attachments} />
          </div>
          {(display.compact || display.columns!=='1') && <Button variant="link" size="sm" onClick={()=>setDiscussion(item)}>展开内容</Button>}
          {item.tags.length > 0 && <div className="flex flex-wrap gap-1">{item.tags.map(value => <Button key={value} variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setTag(value)}>#{value}</Button>)}</div>}
          {item.sourceId && <Button variant="link" size="sm" onClick={() => setReference(item.sourceId)}>查看引用资料</Button>}
          {item.dueAt && <p className="text-xs text-muted-foreground">截止：{new Date(item.dueAt).toLocaleString()}</p>}
          {item.status === 'CLOSED' && <Badge variant="outline">已关闭</Badge>}
          <div className="flex w-full flex-wrap items-center gap-1 pt-1 text-[13px]">
            {(item.reactions ?? []).map(reaction => <button key={reaction.emoji} type="button" className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted/40 px-2.5 text-[13px] text-muted-foreground hover:bg-muted/70 aria-pressed:bg-accent aria-pressed:text-accent-foreground focus-visible:outline-2" aria-label={`回应 ${reaction.emoji}`} aria-pressed={reaction.userIds.includes(userId ?? '')} disabled={!canWrite || item.archived || busy} onClick={() => void mutate(() => forumApi.react(courseId,item,reaction.emoji,!reaction.userIds.includes(userId ?? '')))}>{reaction.emoji} {reaction.userIds.length}</button>)}
            {canWrite && !item.archived && <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm" aria-label={`添加回应：${item.title}`}>☺</Button></PopoverTrigger><PopoverContent className="w-auto flex gap-1">{['👍','❤️','🎉','🤔','👀','✅'].map(emoji => <Button key={emoji} variant="ghost" size="icon-sm" aria-label={`回应 ${emoji}`} disabled={busy} onClick={() => void mutate(() => forumApi.react(courseId,item,emoji,!(item.reactions ?? []).some(r => r.emoji===emoji && r.userIds.includes(userId ?? ''))))}>{emoji}</Button>)}</PopoverContent></Popover>}
            <Button variant="ghost" size="sm" onClick={() => setDiscussion(item)}>评论{item.commentCount > 0 ? `（${item.commentCount}）` : ''}</Button>
            {item.kind === 'assignment' && <Button variant="outline" size="sm" onClick={() => setSubmission(item)}>{space.canReview ? '查看提交' : item.status === 'CLOSED' ? '查看提交记录' : '提交作业'}</Button>}
          </div>
          </>}
        </MemoCard>)}
        {nextOffset !== null && <Button variant="outline" className="w-full" disabled={loading} onClick={() => void load(nextOffset)}>加载更多</Button>}
      </div>
      {reference && <ForumReference key={reference} projectId={space.projectId} sourceId={reference} onClose={()=>setReference(null)}/>}
      {discussion && <ForumDiscussion key={`${discussion.targetType}:${discussion.id}`} courseId={courseId} item={discussion} canWrite={canWrite} canManage={space.canEditContent} onClose={() => setDiscussion(null)} onComment={() => void load()} />}
      {submission && <ForumSubmission key={submission.id} space={space} item={submission} onClose={() => setSubmission(null)} />}
      <AlertDialog open={Boolean(deleting)} onOpenChange={open => {if(!open) setDeleting(null)}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除这条内容？</AlertDialogTitle><AlertDialogDescription>删除后不再显示。已有提交的作业须关闭或归档，提交历史将保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => {if(deleting) void mutate(() => forumApi.remove(courseId,deleting)); setDeleting(null)}}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={Boolean(closing)} onOpenChange={open => { if (!open) setClosing(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>关闭这份作业？</AlertDialogTitle><AlertDialogDescription>关闭后不再接收新的提交，已有提交与历史版本会保留。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>暂不关闭</AlertDialogCancel><AlertDialogAction onClick={() => { if (closing) void mutate(() => forumApi.close(courseId, closing)); setClosing(null) }}>确认关闭</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
  if (isMobile) return <section className="flex h-full min-h-0 flex-col bg-background">
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2">
      <ForumSidebar kind={kind} onSelect={setKind} date={date} onDate={setDate} />
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{space.title} · 学习论坛</h1>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3"><div data-ui-page="forum">{content}</div></div>
  </section>
  return <DashboardSectionFrame space={space} section="forum">
    <div data-ui-page="forum" className="mx-auto grid w-full max-w-6xl grid-cols-[16rem_minmax(0,1fr)] gap-6 @min-[56rem]/learning-grid:gap-10">
      <ForumSidebar kind={kind} onSelect={setKind} date={date} onDate={setDate} />
      {content}
    </div>
  </DashboardSectionFrame>
}
