import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { userFacingError } from '@/lib/userFacingError'
import { forumApi } from './api'
import type { ConversationEvidence, ConversationReference, EvidenceMessage } from './contracts'
import { MemoContent } from './memos/MemoContent'

type PickerProps = {courseId:string;channelId?:string|null;value:ConversationReference[];onChange(value:ConversationReference[]):void;disabled:boolean}
export function ConversationReferencePicker(props:PickerProps) {
  return <ReferencePicker key={`${props.courseId}:${props.channelId??''}`} {...props}/>
}

function ReferencePicker({courseId,channelId,value,onChange,disabled}:PickerProps) {
  const [rooms,setRooms]=useState<{channelId:string;title:string}[]>([]),[nextRoom,setNextRoom]=useState<number|null>(null)
  const [selected,setSelected]=useState(channelId??''),[messages,setMessages]=useState<EvidenceMessage[]>([]),[before,setBefore]=useState<number|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[retryBefore,setRetryBefore]=useState(0)
  const [roomsBusy,setRoomsBusy]=useState(false),[roomsError,setRoomsError]=useState(''),[retryOffset,setRetryOffset]=useState(0)
  const roomRequest=useRef<AbortController|null>(null),messageRequest=useRef<AbortController|null>(null)
  const loadRooms=useCallback(async(offset=0)=>{
    roomRequest.current?.abort()
    const request=new AbortController();roomRequest.current=request
    setRoomsBusy(true);setRoomsError('');setRetryOffset(offset)
    try {
      const page=await forumApi.conversations(courseId,offset,AbortSignal.any([request.signal,AbortSignal.timeout(30_000)]))
      if(!request.signal.aborted){setRooms(old=>offset?[...old,...page.items]:page.items);setNextRoom(page.nextOffset)}
    } catch(reason){if(!request.signal.aborted)setRoomsError(userFacingError(reason,'对话列表加载失败，请重试。'))}
    finally{if(!request.signal.aborted)setRoomsBusy(false)}
  },[courseId])
  useEffect(()=>{if(!channelId)void loadRooms();return()=>roomRequest.current?.abort()},[channelId,loadRooms])
  const loadMessages=useCallback(async(offset=0)=>{
    messageRequest.current?.abort()
    const request=new AbortController();messageRequest.current=request
    setBusy(false);setError('');setRetryBefore(offset)
    if(!offset){setMessages([]);setBefore(null)}
    if(!selected)return
    setBusy(true)
    try {
      const page=await forumApi.conversation(courseId,selected,offset,AbortSignal.any([request.signal,AbortSignal.timeout(30_000)]))
      if(!request.signal.aborted){setMessages(old=>offset?[...page.messages,...old]:page.messages);setBefore(page.nextBefore)}
    } catch(reason){if(!request.signal.aborted)setError(userFacingError(reason,'对话读取失败，请重试。'))}
    finally{if(!request.signal.aborted)setBusy(false)}
  },[courseId,selected])
  useEffect(()=>{void loadMessages();return()=>messageRequest.current?.abort()},[loadMessages])
  const turns=messages.flatMap((message,index)=>{
    if(message.role!=='user')return []
    let end=index+1
    while(end<messages.length && messages[end].role==='assistant')end++
    return end>index+1?[messages.slice(index,end)]:[]
  })
  return <fieldset disabled={disabled} className="min-w-0 space-y-3">
    <legend className="text-sm font-medium">引用学习对话（必选）</legend>
    <p className="text-xs text-muted-foreground">选择与这份作业相关的本人作答和助手回复。所选文字片段将随本次提交提供给课程教师查看，之后的对话不会共享。</p>
    {!channelId && <SelectField ariaLabel="选择学习对话" value={selected} disabled={disabled} onValueChange={next=>{setSelected(next);onChange([])}} options={[{value:'',label:'选择本人的课程对话'},...rooms.map(room=>({value:room.channelId,label:room.title}))]}/>}
    {!channelId && <Button type="button" variant="link" disabled={roomsBusy} onClick={()=>void loadRooms()}>刷新对话列表</Button>}
    {roomsBusy && <p role="status" className="text-sm">正在加载对话列表…</p>}
    {roomsError && <p role="alert" className="text-sm text-destructive">{roomsError}<Button type="button" variant="link" disabled={roomsBusy} onClick={()=>void loadRooms(retryOffset)}>重试对话列表</Button></p>}
    {nextRoom!==null && !channelId && <Button type="button" variant="link" disabled={roomsBusy} onClick={()=>void loadRooms(nextRoom)}>更多对话</Button>}
    {busy && <p role="status" className="text-sm">正在读取对话…</p>}
    {!selected && !roomsBusy && !roomsError && <p className="text-sm text-muted-foreground">{rooms.length?'请先选择学习对话，再展开并勾选要引用的片段。':'暂无可引用的课程对话。请从课程总览进入学习对话，完成一轮作答和助手回复后，返回刷新对话列表。'}</p>}
    {selected && !busy && !error && !turns.length && <p className="text-sm text-muted-foreground">这段对话尚无完整的本人作答和助手回复。请继续学习对话，完成后刷新对话。</p>}
    {selected && <Button type="button" variant="link" disabled={busy} onClick={()=>void loadMessages()}>刷新对话</Button>}
    {turns.map(turn=>{
      const ids=turn.map(m=>m.id),checked=value.some(ref=>ref.channelId===selected && ref.messageIds[0]===ids[0])
      return <details key={ids[0]} data-conversation-reference className="py-2">
        <summary className="cursor-pointer truncate text-sm focus-visible:outline-2">{turn[0].text.slice(0,100)}</summary>
        <div className="mt-3 space-y-3">{turn.map(message=><div key={message.id}><p className="text-xs text-muted-foreground">{message.role==='user'?'我的作答':'助手回复'}</p><MemoContent content={message.text}/></div>)}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} disabled={disabled||!checked&&value.length>=20} onChange={event=>onChange(event.target.checked?[...value,{channelId:selected,messageIds:ids}]:value.filter(ref=>ref.messageIds[0]!==ids[0]||ref.channelId!==selected))}/>引用这段对话</label>
        </div>
      </details>
    })}
    {before!==null && <Button type="button" variant="outline" disabled={busy} onClick={()=>void loadMessages(before)}>较早的对话</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}<Button type="button" variant="link" disabled={busy} onClick={()=>void loadMessages(retryBefore)}>重试读取对话</Button></p>}
    <p role="status" className="text-xs text-muted-foreground">已选择 {value.length} 段对话（最多 20 段）</p>
  </fieldset>
}

export function ConversationReferences({references,id}:{references:ConversationEvidence[];id:string}) {
  if(!references?.length)return <p className="text-xs text-muted-foreground">未关联对话</p>
  return <section aria-label="引用的对话" className="space-y-2">{references.map((reference,index)=><details id={`${id}-reference-${index}`} key={index} className="py-2" tabIndex={-1}>
    <summary className="cursor-pointer text-sm focus-visible:outline-2">引用对话：{reference.title} · 片段 {index+1}</summary>
    <p className="my-2 text-xs text-muted-foreground">提交时引用的文字快照 · {new Date(reference.capturedAt).toLocaleString()}</p>
    <div className="space-y-3">{reference.messages.map(message=><div key={message.id} id={`${id}-message-${message.id}`}><p className="text-xs text-muted-foreground">{message.role==='user'?'学生作答':'助手回复'}</p><MemoContent content={message.text}/></div>)}</div>
  </details>)}</section>
}

export function openReference(id:string,index=0) {
  const target=document.getElementById(`${id}-reference-${index}`)
  if(target instanceof HTMLDetailsElement){target.open=true;target.scrollIntoView({block:'nearest'});target.focus({preventScroll:true})}
}
