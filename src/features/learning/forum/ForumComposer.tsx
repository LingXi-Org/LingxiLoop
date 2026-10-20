import './focus-canvas.css'
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
import { markdownText } from '@/features/content-editor/document'

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
  return <div ref={containerRef} className="forum-focus-theme forum-focus-stage" style={focus?{height:placeholderHeight}:undefined}><section ref={section} data-forum-focus-canvas data-forum-composer-focus={focus} data-forum-composer-expanded={expanded} onKeyDown={event=>{if(event.key==='Escape'&&focus&&!event.defaultPrevented&&event.currentTarget.contains(event.target as Node)){event.stopPropagation();setFocus(false)}}} aria-label={item ? '编辑学习论坛内容' : '发布学习论坛内容'} className={`forum-focus-composer ${focus?"fixed inset-x-2 top-2 z-50 mx-auto max-h-[calc(100dvh-1rem)] max-w-4xl overflow-y-auto sm:inset-x-8 sm:top-8 sm:max-h-[calc(100dvh-4rem)]":"relative min-w-0"}`}>
    <header className="forum-focus-head">
    <div className="forum-focus-author">
    {user&&<ForumAvatar userId={user.id} name={user.name} url={user.avatarUrl}/>}
    <div hidden={!expanded} className="min-w-0"><span className="block truncate text-sm font-semibold">{user?.name}</span></div>
    </div>
    <div className="forum-focus-head-actions">
      {expanded&&<Button type="button" variant="ghost" size="icon-sm" aria-label={focus?"退出专注模式":"专注模式"} aria-pressed={focus} onClick={()=>setFocus(value=>!value)}>{focus?<Minimize2Icon/>:<Maximize2Icon/>}</Button>}
      {!item&&<Button type="button" variant="ghost" size="icon-sm" aria-label={expanded?'收起发布框':'展开发布框'} aria-expanded={expanded} onClick={()=>expanded?collapse():setExpanded(true)}>{expanded?<ChevronUpIcon/>:<ChevronDownIcon/>}</Button>}
    </div>
    </header>
    <div className="forum-focus-compose-content">
      <div hidden={!expanded}>
        {!item && <div className="forum-focus-modes" role="group" aria-label="发布类型">
          <Button type="button" variant="ghost" size="sm" disabled={working} aria-pressed={kind === 'share'} onClick={() => setKind('share')}>自由讨论</Button>
          {space.canEditContent && <Button type="button" variant="ghost" size="sm" disabled={working} aria-pressed={kind === 'assignment'} onClick={() => setKind('assignment')}>正式作业</Button>}
        </div>}
      </div>
      <InlineEditor key={`${user?.id}:${space.courseId}:${kind}:${item?.id ?? 'new'}`} space={space} kind={kind} item={item} expanded={expanded} onExpand={()=>setExpanded(true)} onWorking={setWorking} onCreated={()=>{if(!item)collapse();onCreated()}} onCancel={onCancel} />
    </div>
  </section></div>
}
function InlineEditor({space,kind,item,expanded,onExpand,onWorking,onCreated,onCancel}: {space:LearningSpace;kind:'share'|'assignment';item?:ForumItem;expanded:boolean;onExpand():void;onWorking(value:boolean):void;onCreated():void;onCancel?():void}) {
  const initial = item ? { body:item.body,editorDocument:item.editorDocument,links:item.links.join('\n'),attachments:item.attachments,title:item.title,tags:item.tags.join(','),sourceId:item.sourceId ?? 'none',dueAt:item.dueAt ? new Date(new Date(item.dueAt).getTime()-new Date(item.dueAt).getTimezoneOffset()*60000).toISOString().slice(0,16) : '' }
    : { ...emptyContent,title:'',tags:'',sourceId:'none',dueAt:'' }
  const {draft,setDraft,discard,storageError}=useForumDraft(`${item ? `edit:${item.id}` : 'post'}:${space.courseId}:${kind}`,composerDraftSchema,initial)
  const {title,body,tags,links,attachments,sourceId,dueAt,editorDocument}=draft
  const [sources,setSources]=useState<KnowledgeSource[]>([]), [busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState('')
  useEffect(()=>{
    let active=true
    void knowledgeApi.listProjectSources(space.projectId).then(value=>{if(active) setSources(value.filter(source=>source.visibilityScope==='PROJECT'))})
      .catch(()=>{if(active) setError('作业引用资料暂时无法加载，请稍后重试。')})
    return ()=>{active=false}
  },[space.projectId])
  const disabled=busy||uploading
  const bodyText=editorDocument?markdownText(body):body
  useEffect(()=>{onWorking(disabled);return()=>onWorking(false)},[disabled,onWorking])
  return <form className="forum-focus-form" onKeyDown={event=>{
    if (!event.defaultPrevented && (event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Enter' && !event.nativeEvent.isComposing
      && event.target instanceof Element && event.target.closest('.bn-editor')) {
      event.preventDefault()
      const submit=event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]')
      if (!disabled && submit && !submit.disabled) event.currentTarget.requestSubmit(submit)
    }
  }} onSubmit={async event=>{
    event.preventDefault()
    if(disabled||!space.courseId) return
    setBusy(true);setError('')
    try {
      const data={kind,title:title.trim() || bodyText.trim().split('\n')[0].slice(0,200) || '附件讨论',body,editorDocument,
        tags:[...new Set([...tags.split(/[,，]/),...Array.from(bodyText.matchAll(/(?:^|\s)#([^\s#]+)/gu),match=>match[1])].map(value=>value.trim()).filter(Boolean))].slice(0,10),
        links:contentLinks(links),attachments,sourceId:sourceId==='none'?null:sourceId,dueAt:kind==='assignment'&&dueAt?new Date(dueAt).toISOString():null}
      if(item) await forumApi.update(space.courseId,item,data)
      else await forumApi.create(space.courseId,data)
      setDraft({...emptyContent,title:'',tags:'',sourceId:'none',dueAt:''});discard()
      toast.success(item?'内容已更新':'内容已发布');onCreated()
    } catch(reason){setError(userFacingError(reason,'发布失败，输入与附件已保留，请重试。'))}
    finally{setBusy(false)}
  }}>
    {!expanded&&<button type="button" onClick={onExpand} className="w-full truncate rounded-sm px-2 py-2 text-start text-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">{bodyText.trim().split('\n')[0] || '发起讨论…'}</button>}
    <div hidden={!expanded}>
    {kind==='assignment'&&<div hidden={!expanded} className="forum-focus-assignment space-y-2"><Label htmlFor={`forum-title-${item?.id ?? kind}`}>作业标题</Label><Input id={`forum-title-${item?.id ?? kind}`} value={title} onChange={e=>setDraft(previous=>({...previous,title:e.target.value}))} maxLength={200} required disabled={disabled}/></div>}
    <ForumContentFields focusCanvas compact={!expanded} onFocus={onExpand} body={body} editorDocument={draft.editorDocument} setBody={(body,editorDocument)=>setDraft(previous=>({...previous,body,editorDocument}))} links={links} setLinks={links=>setDraft(previous=>({...previous,links}))}
      attachments={attachments} setAttachments={attachments=>setDraft(previous=>({...previous,attachments}))} disabled={disabled} onUploading={setUploading} tags={tags.split(/[,，]/).filter(Boolean)}/>
    <div hidden={!expanded}>
    <details className="forum-focus-extras"><summary className="cursor-pointer rounded focus-visible:outline-2">{kind==='assignment'?'截止时间、标签与引用':'标签与作业资料引用'}</summary><div className="forum-focus-extra-fields">
      {kind==='assignment'&&<Label className="block space-y-2"><span>截止时间（可选）</span><Input type="datetime-local" aria-label="截止时间" value={dueAt} onChange={e=>setDraft(previous=>({...previous,dueAt:e.target.value}))} disabled={disabled}/></Label>}
      <Label className="block space-y-2"><span>标签</span><Input aria-label="标签" value={tags} onChange={e=>setDraft(previous=>({...previous,tags:e.target.value}))} placeholder="用逗号分隔，或在正文中输入 #标签" disabled={disabled}/></Label>
      <SelectField contentClassName="forum-focus-theme forum-focus-popover" ariaLabel="引用作业资料" value={sourceId} onValueChange={sourceId=>setDraft(previous=>({...previous,sourceId}))} disabled={disabled}
        options={[{value:'none',label:'不引用资料'},...sources.map(source=>({value:source.id,label:source.title}))]}/>
    </div></details>
    {error&&<p role="alert" className="forum-focus-status text-destructive">{error}</p>}
    {storageError&&<p role="status" className="forum-focus-status text-destructive">本地草稿保存失败，请复制内容后重试。</p>}
    <footer className="forum-focus-foot"><span className="me-auto text-xs text-muted-foreground">{storageError ? '草稿未保存' : '草稿自动保存'}</span>
      {item&&<Button type="button" variant="ghost" onClick={onCancel} disabled={disabled}>收起编辑</Button>}
      <Button type="submit" title="Ctrl/⌘ + Shift + Enter" aria-keyshortcuts="Control+Shift+Enter Meta+Shift+Enter" disabled={disabled || (kind==='assignment'&&!title.trim()) || (!body.trim()&&!links.trim()&&!attachments.length)}>{uploading?'上传中…':busy?'发布中…':item?'保存修改':kind==='assignment'?'发布作业':'发布'}</Button>
    </footer>
    </div>
    </div>
  </form>
}
