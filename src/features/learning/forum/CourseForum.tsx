import { useCallback, useEffect, useRef, useState } from 'react'
import { TypesetMarkdown } from '@/components/Typeset'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { userFacingError } from '@/lib/userFacingError'
import { useApp } from '@/stores/app'
import { learningApi } from '../api'
import type { LearningSpace } from '../contracts'
import { DashboardSectionFrame } from '../dashboard/DashboardSectionFrame'
import { forumApi } from './api'
import type { ForumFilter, ForumItem } from './contracts'
import { ForumComposer } from './ForumComposer'
import { ForumFiles } from './ForumContentFields'
import { ForumDiscussion } from './ForumDiscussion'
import { ForumSubmission } from './ForumSubmission'
import { MemoCard } from './memos/MemoCard'

const filters: Array<{ kind: ForumFilter; label: string }> = [{ kind: 'all',label: '全部' },{ kind: 'assignment',label: '作业' },{ kind: 'resource',label: '资料' },{ kind: 'case',label: '案例' }]
const kindLabels = { share: '分享',assignment: '作业',resource: '资料',case: '作品案例' }

export function CourseForum({ space }: { space: LearningSpace }) {
  const [items, setItems] = useState<ForumItem[]>([]), [nextOffset, setNextOffset] = useState<number | null>(null)
  const [kind, setKind] = useState<ForumFilter>('all'), [search, setSearch] = useState(''), [tag, setTag] = useState('')
  const [composing, setComposing] = useState(false), [discussion, setDiscussion] = useState<ForumItem | null>(null), [submission, setSubmission] = useState<ForumItem | null>(null)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const epoch = useRef(0)
  const canWrite = space.canSubmit || space.canEditContent
  const load = useCallback(async (offset = 0) => {
    if (!space.courseId) return
    const request = ++epoch.current
    setLoading(true); setError('')
    try {
      const result = await forumApi.list(space.courseId,{ kind,search,tag,offset })
      if (request !== epoch.current) return
      setItems(previous => offset ? [...previous,...result.items] : result.items)
      setNextOffset(result.nextOffset)
    } catch (reason) { if (request === epoch.current) setError(userFacingError(reason, '论坛暂时无法加载，请重试。')) }
    finally { if (request === epoch.current) setLoading(false) }
  }, [space.courseId,kind,search,tag])
  useEffect(() => {
    setItems([]); setNextOffset(null)
    const timer = setTimeout(() => { void load() }, 200)
    return () => { clearTimeout(timer); epoch.current++ }
  }, [load])
  const mutate = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await action(); await load() }
    catch (reason) { setError(userFacingError(reason, '操作失败，请重试。')) }
    finally { setBusy(false) }
  }
  if (!space.courseId) return <Alert><AlertDescription>请选择一门课程查看论坛。</AlertDescription></Alert>
  const courseId = space.courseId
  return <DashboardSectionFrame space={space} section="forum" headerActions={<div className="flex flex-wrap gap-2">
    {space.canEditContent && <Button variant="outline" onClick={() => useApp.getState().setView('course-content')}>发布作业</Button>}
    {canWrite && <Button onClick={() => setComposing(value => !value)}>发布内容</Button>}
  </div>}>
    <div data-ui-page="forum" className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2" aria-label="论坛筛选">{filters.map(filter => <Button key={filter.kind} variant={kind === filter.kind ? 'secondary' : 'ghost'} aria-pressed={kind === filter.kind} onClick={() => setKind(filter.kind)}>{filter.label}</Button>)}</div>
      <Input type="search" aria-label="搜索论坛" placeholder="搜索标题与内容" value={search} onChange={event => setSearch(event.target.value)} maxLength={200} />
      {tag && <Button variant="outline" size="sm" onClick={() => setTag('')}>#{tag} · 清除标签筛选</Button>}
      {composing && canWrite && <ForumComposer space={space} onCancel={() => setComposing(false)} onCreated={() => { setComposing(false); setKind('all'); setSearch(''); setTag(''); void load() }} />}
      {error && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-2">{error}<Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>重试</Button></AlertDescription></Alert>}
      <div aria-busy={loading} className="space-y-3">
        {loading && items.length === 0 && <p role="status" className="py-6 text-sm text-muted-foreground">正在加载论坛…</p>}
        {!loading && !error && items.length === 0 && <p className="py-6 text-sm text-muted-foreground">没有符合条件的内容。</p>}
        {items.map(item => <MemoCard key={`${item.targetType}:${item.id}`} label={item.title} author={item.authorName} createdAt={item.createdAt} pinned={item.pinned}
          actions={<Badge variant="outline">{kindLabels[item.kind]}</Badge>}>
          <h3 className="text-base font-semibold">{item.title}</h3>
          {(item.featured || item.official) && <div className="flex flex-wrap gap-2">{item.official && <Badge>官方案例</Badge>}{item.featured && <Badge variant="secondary">精选案例</Badge>}</div>}
          {item.body && <TypesetMarkdown content={item.body} preset="document" className="w-full min-w-0" />}
          <ForumFiles links={item.links} attachments={item.attachments} />
          {item.tags.length > 0 && <div className="flex flex-wrap gap-1">{item.tags.map(value => <Button key={value} variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setTag(value)}>#{value}</Button>)}</div>}
          {item.dueAt && <p className="text-xs text-muted-foreground">截止：{new Date(item.dueAt).toLocaleString()}</p>}
          {item.status === 'CLOSED' && <Badge variant="secondary">已关闭</Badge>}
          <div className="flex w-full flex-wrap items-center gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setDiscussion(item)}>评论{item.commentCount > 0 ? `（${item.commentCount}）` : ''}</Button>
            {item.sourceId && <Button variant="ghost" size="sm" onClick={() => useApp.getState().setView('library')}>在课程资料中查看</Button>}
            {item.targetType === 'activity' && <Button variant="outline" size="sm" onClick={() => setSubmission(item)}>{space.canReview ? '查看提交' : item.status === 'CLOSED' ? '查看提交记录' : '提交作业'}</Button>}
            {space.canEditContent && <>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void mutate(() => forumApi.flags(courseId,item,{ pinned: !item.pinned }))}>{item.pinned ? '取消置顶' : '置顶'}</Button>
              {item.kind === 'case' && <><Button variant="ghost" size="sm" disabled={busy} onClick={() => void mutate(() => forumApi.flags(courseId,item,{ featured: !item.featured }))}>{item.featured ? '取消精选' : '精选'}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => void mutate(() => forumApi.flags(courseId,item,{ official: !item.official }))}>{item.official ? '取消官方标记' : '标记官方案例'}</Button></>}
              {item.targetType === 'activity' && item.status === 'PUBLISHED' && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void mutate(() => learningApi.closeActivity(courseId,item.id))}>关闭作业</Button>}
            </>}
          </div>
        </MemoCard>)}
        {nextOffset !== null && <Button variant="outline" className="w-full" disabled={loading} onClick={() => void load(nextOffset)}>加载更多</Button>}
      </div>
      {discussion && <ForumDiscussion key={`${discussion.targetType}:${discussion.id}`} courseId={courseId} item={discussion} canWrite={canWrite} onClose={() => setDiscussion(null)} onComment={() => void load()} />}
      {submission && <ForumSubmission key={submission.id} space={space} item={submission} onClose={() => setSubmission(null)} />}
    </div>
  </DashboardSectionFrame>
}
