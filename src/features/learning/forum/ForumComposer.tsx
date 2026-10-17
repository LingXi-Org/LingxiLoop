import { ChevronDownIcon, ChevronUpIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react'
import { useFocusMode } from './memos/editor/hooks/useFocusMode'
// Home leading editor and edit-in-place lifecycle adapted from Memos (MIT), pinned in memos/README.md.
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectField } from '@/components/ui/select-field'
import { knowledgeApi } from '@/features/knowledge/api'
import type { KnowledgeSource } from '@/features/knowledge/contracts'
import { userFacingError } from '@/lib/userFacingError'
import { useAuth } from '@/stores/auth'
import { ForumAvatar } from './ForumAvatar'
import type { LearningSpace } from '../contracts'
import { forumApi } from './api'
import type { ForumItem } from './contracts'
import { contentLinks, ForumContentFields } from './ForumContentFields'
import { composerDraftSchema, emptyContent, useForumDraft } from './useForumDraft'

export function ForumComposer({ space, item, onCreated, onCancel }: { space: LearningSpace; item?: ForumItem; onCreated(): void; onCancel?(): void }) {
  const [focus,setFocus]=useState(false)
  const [expanded,setExpanded]=useState(Boolean(item)), [working,setWorking]=useState(false)
  const user=useAuth(state=>state.user)
  const section=useRef<HTMLElement>(null)
  const {containerRef,placeholderHeight}=useFocusMode(focus)
  const [kind,setKind] = useState<'share' | 'assignment'>(item?.kind ?? 'share')
  const collapse=()=>{
    setExpanded(false);setFocus(false)
    requestAnimationFrame(()=>section.current?.querySelector<HTMLButtonElement>('[aria-label="展开发布框"]')?.focus())
  }
  return <div ref={containerRef} style={focus?{height:placeholderHeight}:undefined}><section ref={section} data-forum-composer-expanded={expanded} onKeyDown={event=>{if(event.key==='Escape'&&focus){event.stopPropagation();setFocus(false)}}} aria-label={item ? '编辑学习论坛内容' : '发布学习论坛内容'} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border bg-card p-2 ${focus?"fixed inset-x-2 top-2 bottom-2 z-50 mx-auto max-w-4xl overflow-y-auto shadow-2xl sm:inset-x-8 sm:top-8 sm:bottom-8":"relative min-w-0"}`}>
    {user&&<ForumAvatar userId={user.id} name={user.name} url={user.avatarUrl}/>}
    <span hidden={!expanded} className="min-w-0 self-center truncate text-sm font-medium">{user?.name}</span>
    <div className="col-start-3 row-start-1 flex gap-1">
      {expanded&&<Button type="button" variant="ghost" size="icon-sm" aria-label={focus?"退出专注模式":"专注模式"} aria-pressed={focus} onClick={()=>setFocus(value=>!value)}>{focus?<Minimize2Icon/>:<Maximize2Icon/>}</Button>}
      {!item&&<Button type="button" variant="ghost" size="icon-sm" aria-label={expanded?'收起发布框':'展开发布框'} aria-expanded={expanded} onClick={()=>expanded?collapse():setExpanded(true)}>{expanded?<ChevronUpIcon/>:<ChevronDownIcon/>}</Button>}
    </div>
    <div className={expanded?'col-span-3 min-w-0':'col-start-2 row-start-1 min-w-0'}>
      <div hidden={!expanded}>
        {!item && space.canEditContent && <div className="mb-2 flex gap-2" role="group" aria-label="发布类型">
          <Button type="button" variant={kind === 'share' ? 'secondary' : 'ghost'} size="sm" disabled={working} aria-pressed={kind === 'share'} onClick={() => setKind('share')}>自由讨论</Button>
          <Button type="button" variant={kind === 'assignment' ? 'secondary' : 'ghost'} size="sm" disabled={working} aria-pressed={kind === 'assignment'} onClick={() => setKind('assignment')}>正式作业</Button>
        </div>}
      </div>
      <InlineEditor key={`${user?.id}:${space.courseId}:${kind}:${item?.id ?? 'new'}`} space={space} kind={kind} item={item} expanded={expanded} onExpand={()=>setExpanded(true)} onWorking={setWorking} onCreated={()=>{if(!item)collapse();onCreated()}} onCancel={onCancel} />
    </div>
  </section></div>
}
function InlineEditor({space,kind,item,expanded,onExpand,onWorking,onCreated,onCancel}: {space:LearningSpace;kind:'share'|'assignment';item?:ForumItem;expanded:boolean;onExpand():void;onWorking(value:boolean):void;onCreated():void;onCancel?():void}) {
  const initial = item ? { body:item.body,links:item.links.join('\n'),attachments:item.attachments,title:item.title,tags:item.tags.join(','),sourceId:item.sourceId ?? 'none',dueAt:item.dueAt ? new Date(new Date(item.dueAt).getTime()-new Date(item.dueAt).getTimezoneOffset()*60000).toISOString().slice(0,16) : '' }
    : { ...emptyContent,title:'',tags:'',sourceId:'none',dueAt:'' }
  const {draft,setDraft,discard,storageError}=useForumDraft(`${item ? `edit:${item.id}` : 'post'}:${space.courseId}:${kind}`,composerDraftSchema,initial)
  const {title,body,tags,links,attachments,sourceId,dueAt}=draft
  const [sources,setSources]=useState<KnowledgeSource[]>([]), [busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState('')
  useEffect(()=>{
    let active=true
    void knowledgeApi.listProjectSources(space.projectId).then(value=>{if(active) setSources(value.filter(source=>source.visibilityScope==='PROJECT'))})
      .catch(()=>{if(active) setError('作业引用资料暂时无法加载，请稍后重试。')})
    return ()=>{active=false}
  },[space.projectId])
  const disabled=busy||uploading
  useEffect(()=>{onWorking(disabled);return()=>onWorking(false)},[disabled,onWorking])
  return <form className={expanded?'min-w-0 space-y-2':'min-w-0'} onSubmit={async event=>{
    event.preventDefault()
    if(disabled||!space.courseId) return
    setBusy(true);setError('')
    try {
      const data={kind,title:title.trim() || body.trim().split('\n')[0].slice(0,200) || '附件讨论',body,
        tags:[...new Set([...tags.split(/[,，]/),...Array.from(body.matchAll(/(?:^|\s)#([^\s#]+)/gu),match=>match[1])].map(value=>value.trim()).filter(Boolean))].slice(0,10),
        links:contentLinks(links),attachments,sourceId:sourceId==='none'?null:sourceId,dueAt:kind==='assignment'&&dueAt?new Date(dueAt).toISOString():null}
      if(item) await forumApi.update(space.courseId,item,data)
      else await forumApi.create(space.courseId,data)
      setDraft({...emptyContent,title:'',tags:'',sourceId:'none',dueAt:''});discard()
      toast.success(item?'内容已更新':'内容已发布');onCreated()
    } catch(reason){setError(userFacingError(reason,'发布失败，输入与附件已保留，请重试。'))}
    finally{setBusy(false)}
  }}>
    {kind==='assignment'&&<div hidden={!expanded} className="space-y-2"><Label htmlFor={`forum-title-${item?.id ?? kind}`}>作业标题</Label><Input id={`forum-title-${item?.id ?? kind}`} value={title} onChange={e=>setDraft(previous=>({...previous,title:e.target.value}))} maxLength={200} required disabled={disabled}/></div>}
    <ForumContentFields compact={!expanded} onFocus={onExpand} body={body} setBody={body=>setDraft(previous=>({...previous,body}))} links={links} setLinks={links=>setDraft(previous=>({...previous,links}))}
      attachments={attachments} setAttachments={attachments=>setDraft(previous=>({...previous,attachments}))} disabled={disabled} onUploading={setUploading} tags={tags.split(/[,，]/).filter(Boolean)}/>
    <div hidden={!expanded} className="space-y-2">
    <details className="text-sm"><summary className="cursor-pointer rounded focus-visible:outline-2">{kind==='assignment'?'截止时间、标签与引用':'标签与作业资料引用'}</summary><div className="space-y-3 pt-3">
      {kind==='assignment'&&<Label className="block space-y-2"><span>截止时间（可选）</span><Input type="datetime-local" aria-label="截止时间" value={dueAt} onChange={e=>setDraft(previous=>({...previous,dueAt:e.target.value}))} disabled={disabled}/></Label>}
      <Label className="block space-y-2"><span>标签</span><Input aria-label="标签" value={tags} onChange={e=>setDraft(previous=>({...previous,tags:e.target.value}))} placeholder="用逗号分隔，或在正文中输入 #标签" disabled={disabled}/></Label>
      <SelectField ariaLabel="引用作业资料" value={sourceId} onValueChange={sourceId=>setDraft(previous=>({...previous,sourceId}))} disabled={disabled}
        options={[{value:'none',label:'不引用资料'},...sources.map(source=>({value:source.id,label:source.title}))]}/>
    </div></details>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {storageError&&<p role="status" className="text-sm text-destructive">本地草稿保存失败，请复制内容后重试。</p>}
    <div className="flex flex-wrap items-center gap-2"><span className="me-auto text-xs text-muted-foreground">本课程成员可见 · 草稿自动保存</span>
      {item&&<Button type="button" variant="ghost" onClick={onCancel} disabled={disabled}>收起编辑</Button>}
      <Button type="submit" disabled={disabled || (kind==='assignment'&&!title.trim()) || (!body.trim()&&!links.trim()&&!attachments.length)}>{uploading?'上传中…':busy?'发布中…':item?'保存修改':kind==='assignment'?'发布作业':'发布'}</Button>
    </div>
    </div>
  </form>
}
