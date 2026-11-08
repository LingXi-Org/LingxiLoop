import {useEffect,useRef,useState} from 'react'
import type {ArtifactDocument} from '../../../../shared/artifact-document'
import {useLocalDraft} from './draft-context'
import type {DraftFlushReason} from './drafts'

export interface ElementFontWeightInputProps{
 value:string;disabled:boolean
 getBase():ArtifactDocument|null
 apply(value:string|null,base:ArtifactDocument):void
 retain(value:string,base:ArtifactDocument):void
 onHistory(direction:'undo'|'redo'):void
}
export default function ElementFontWeightInput({value,disabled,getBase,apply,retain,onHistory}:ElementFontWeightInputProps){
 const [text,setText]=useState(value),[error,setError]=useState('')
 const pending=useRef<{text:string;base:ArtifactDocument}|null>(null)
 const composing=useRef(false),afterComposition=useRef(false),confirmed=useRef(false)
 const save=(reason?:DraftFlushReason)=>{
  const draft=pending.current
  if(!draft)return
  if(composing.current&&reason!=='unmount'){afterComposition.current=true;return}
  if(draft.text&&draft.text.trim()===''){
   pending.current=null;markDirty(false)
   if(reason!=='unmount')setText(value)
   return
  }
  if(draft.text===value){pending.current=null;markDirty(false);return}
  if(composing.current||disabled){retain(draft.text,draft.base);pending.current=null;markDirty(false);return}
  try{
   apply(draft.text.trim()||null,draft.base)
   pending.current=null;markDirty(false);confirmed.current=true
   if(reason!=='unmount')setError('')
  }catch{
   if(reason==='unmount'){retain(draft.text,draft.base);pending.current=null;markDirty(false)}
   else setError('字重格式无效，请输入有效的样式值。')
  }
 }
 const markDirty=useLocalDraft(save)
 useEffect(()=>{if(!pending.current)setText(value)},[value])
 const change=(next:string)=>{
  if(disabled&&!pending.current)return
  const base=pending.current?.base??getBase()
  if(!base)return
  pending.current={text:next,base};setText(next);setError('');confirmed.current=false;markDirty(true)
 }
 return <span className="native-font-weight-input"><input aria-label="字重" value={text} disabled={disabled} spellCheck={false}
  onFocus={event=>event.currentTarget.select()} onChange={event=>change(event.target.value)}
  onCompositionStart={()=>{composing.current=true;change(text)}}
  onCompositionEnd={event=>{composing.current=false;change(event.currentTarget.value);if(afterComposition.current){afterComposition.current=false;save()}}}
  onBlur={()=>{save();confirmed.current=false}}
  onKeyDown={event=>{
   event.stopPropagation()
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();save();return}
   if(composing.current||event.nativeEvent.isComposing||event.keyCode===229)return
   if((event.ctrlKey||event.metaKey)&&confirmed.current&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();onHistory(event.shiftKey||event.key.toLowerCase()==='y'?'redo':'undo');return}
   if(event.key==='Enter'){event.preventDefault();save();event.currentTarget.select()}
   else if(event.key==='Escape'){event.preventDefault();pending.current=null;markDirty(false);setText(value);setError('');event.currentTarget.blur()}
  }}/>{error&&<span role="alert">{error}</span>}</span>
}
