import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { userFacingError } from '@/lib/userFacingError'
import { forumApi } from './api'
import type { ConversationEvidence, ConversationReference, EvidenceMessage } from './contracts'
import { MemoContent } from './memos/MemoContent'

export function ConversationReferencePicker({courseId,channelId,value,onChange,disabled}:{courseId:string;channelId?:string|null;value:ConversationReference[];onChange(value:ConversationReference[]):void;disabled:boolean}) {
  const [rooms,setRooms]=useState<{channelId:string;title:string}[]>([]),[nextRoom,setNextRoom]=useState<number|null>(null)
  const [selected,setSelected]=useState(channelId??''),[messages,setMessages]=useState<EvidenceMessage[]>([]),[before,setBefore]=useState<number|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const epoch=useRef(0)
  const loadRooms=async(offset=0)=>{
    try {const page=await forumApi.conversations(courseId,offset);setRooms(old=>offset?[...old,...page.items]:page.items);setNextRoom(page.nextOffset)}
    catch(reason){setError(userFacingError(reason,'对话列表加载失败。'))}
  }
  useEffect(()=>{void loadRooms()},[courseId])
  useEffect(()=>{if(channelId)setSelected(channelId)},[channelId])
  useEffect(()=>{
    const request=++epoch.current
    setMessages([]);setBefore(null);setError('')
    if(!selected)return
    setBusy(true)
    void forumApi.conversation(courseId,selected).then(page=>{if(request===epoch.current){setMessages(page.messages);setBefore(page.nextBefore)}})
      .catch(reason=>{if(request===epoch.current)setError(userFacingError(reason,'对话读取失败。'))}).finally(()=>{if(request===epoch.current)setBusy(false)})
    return ()=>{epoch.current++}
  },[courseId,selected])
  const turns=messages.flatMap((message,index)=>{
    if(message.role!=='user')return []
    let end=index+1
    while(end<messages.length && messages[end].role==='assistant')end++
    return end>index+1?[messages.slice(index,end)]:[]
  })
  return <fieldset disabled={disabled} className="min-w-0 space-y-3">
    <legend className="text-sm font-medium">引用学习对话（必选）</legend>
    <p className="text-xs text-muted-foreground">选择与这份作业相关的本人作答和助手回复。所选文字片段将随本次提交提供给课程教师查看，之后的对话不会共享。</p>
    {!channelId && <SelectField ariaLabel="选择学习对话" value={selected} onValueChange={next=>{setSelected(next);onChange([])}} options={[{value:'',label:'选择本人的课程对话'},...rooms.map(room=>({value:room.channelId,label:room.title}))]}/>}
    {nextRoom!==null && !channelId && <Button type="button" variant="link" onClick={()=>void loadRooms(nextRoom)}>更多对话</Button>}
    {busy && <p role="status" className="text-sm">正在读取对话…</p>}
    {!busy && !turns.length && <p className="text-sm text-muted-foreground">请先与助手完成至少一轮文字对话，再选择引用。</p>}
    {turns.map(turn=>{
      const ids=turn.map(m=>m.id),checked=value.some(ref=>ref.channelId===selected && ref.messageIds[0]===ids[0])
      return <details key={ids[0]} className="rounded-md border px-3 py-2">
        <summary className="cursor-pointer truncate text-sm focus-visible:outline-2">{turn[0].text.slice(0,100)}</summary>
        <div className="mt-3 space-y-3">{turn.map(message=><div key={message.id}><p className="text-xs text-muted-foreground">{message.role==='user'?'我的作答':'助手回复'}</p><MemoContent content={message.text}/></div>)}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} disabled={disabled||!checked&&value.length>=3} onChange={event=>onChange(event.target.checked?[...value,{channelId:selected,messageIds:ids}]:value.filter(ref=>ref.messageIds[0]!==ids[0]||ref.channelId!==selected))}/>引用这段对话</label>
        </div>
      </details>
    })}
    {before!==null && <Button type="button" variant="outline" disabled={busy} onClick={async()=>{
      const request=epoch.current;setBusy(true)
      try {const page=await forumApi.conversation(courseId,selected,before);if(request===epoch.current){setMessages(old=>[...page.messages,...old]);setBefore(page.nextBefore)}}
      catch(reason){setError(userFacingError(reason,'较早对话加载失败。'))}finally{if(request===epoch.current)setBusy(false)}
    }}>较早的对话</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <p role="status" className="text-xs text-muted-foreground">已选择 {value.length} 段对话（最多 3 段）</p>
  </fieldset>
}

export function ConversationReferences({references,id}:{references:ConversationEvidence[];id:string}) {
  if(!references?.length)return <p className="text-xs text-muted-foreground">未关联对话</p>
  return <section aria-label="引用的对话" className="space-y-2">{references.map((reference,index)=><details id={`${id}-reference-${index}`} key={index} className="rounded-md border p-3" onToggle={event=>{if(event.currentTarget.open)event.currentTarget.focus({preventScroll:true})}} tabIndex={-1}>
    <summary className="cursor-pointer text-sm focus-visible:outline-2">引用对话：{reference.title} · 片段 {index+1}</summary>
    <p className="my-2 text-xs text-muted-foreground">提交时引用的文字快照 · {new Date(reference.capturedAt).toLocaleString()}</p>
    <div className="space-y-3">{reference.messages.map(message=><div key={message.id} id={`${id}-message-${message.id}`}><p className="text-xs text-muted-foreground">{message.role==='user'?'学生作答':'助手回复'}</p><MemoContent content={message.text}/></div>)}</div>
  </details>)}</section>
}

export function openReference(id:string,index=0) {
  const target=document.getElementById(`${id}-reference-${index}`)
  if(target instanceof HTMLDetailsElement){target.open=true;target.scrollIntoView({block:'nearest'});target.focus({preventScroll:true})}
}
