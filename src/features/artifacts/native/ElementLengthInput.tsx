import {useEffect,useRef,useState} from 'react'
import type {ArtifactDocument} from '../../../../shared/artifact-document'
import {EditorIcon} from './EditorPrimitives'
import {useLocalDraft} from './draft-context'
import type {DraftFlushReason} from './drafts'

export default function ElementLengthInput({property,label,value,placeholder,writable,getBase,apply,retain,onHistory,numeric=false,showUnit=true}:{
  property:string;label:string;value:string;placeholder?:string;writable:boolean;numeric?:boolean;showUnit?:boolean
  getBase():ArtifactDocument|null
  apply(changes:Record<string,string|null>,base:ArtifactDocument):void
  retain(changes:Record<string,string|null>,base:ArtifactDocument):void
  onHistory(direction:'undo'|'redo'):void
}){
  const [text,setText]=useState(value),[error,setError]=useState('')
  const pending=useRef<{text:string;base:ArtifactDocument}|null>(null),composing=useRef(false),afterComposition=useRef(false),confirmed=useRef(false)
  const save=(reason?:DraftFlushReason)=>{
    const draft=pending.current;if(!draft)return
    if(composing.current&&reason!=='unmount'){afterComposition.current=true;return}
    if(draft.text&&draft.text.trim()===''){pending.current=null;markDirty(false);if(reason!=='unmount')setText(value);return}
    if(draft.text===value){pending.current=null;markDirty(false);confirmed.current=true;return}
    const changes={[property]:draft.text}
    if(composing.current){retain(changes,draft.base);pending.current=null;markDirty(false);return}
    try{apply(changes,draft.base);pending.current=null;markDirty(false);confirmed.current=true;if(reason!=='unmount')setError('')}
    catch{
      if(reason==='unmount'){retain(changes,draft.base);pending.current=null;markDirty(false)}
      else setError('尺寸格式无效，请输入数字或有效的样式长度。')
    }
  }
  const markDirty=useLocalDraft(save)
  useEffect(()=>{if(!pending.current)setText(value)},[value])
  const change=(next:string)=>{const base=pending.current?.base??getBase();if(!base)return;pending.current={text:next,base};setText(next);setError('');confirmed.current=false;markDirty(true)}
  const field=useRef<HTMLInputElement>(null)
  const step=(direction:number,modifiers:{shiftKey?:boolean;altKey?:boolean}={})=>{
    const parsed=text.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(.*)$/);if(!parsed&&text.trim())return
    const unit=parsed?.[2]||'px',fine=/^(em|rem|ch|ex|lh|cap|ic|s|turn)$/i.test(unit),normal=fine?.1:1,amount=modifiers.altKey?(fine?.01:.1):normal*(modifiers.shiftKey?10:1)
    const next=Math.round((Number(parsed?.[1]??0)+direction*amount)*100)/100,value=(['width','height','min-width','max-width','min-height','max-height'].includes(property)||property.startsWith('padding'))?Math.max(0,next):next
    change(`${value}${numeric&&unit==='px'?'':unit}`);save();field.current?.focus({preventScroll:true});field.current?.select()
  }
  return <span className={`native-sizing-input${numeric?' native-sizing-number':''}${!showUnit?' native-sizing-unitless':''}`}><input ref={field} aria-label={label} value={text} placeholder={placeholder} readOnly={!writable} spellCheck={false}
    onFocus={event=>event.currentTarget.select()} onChange={event=>change(event.target.value)}
    onCompositionStart={()=>{composing.current=true;change(text)}} onCompositionEnd={event=>{composing.current=false;change(event.currentTarget.value);if(afterComposition.current){afterComposition.current=false;save()}}}
    onBlur={()=>{save();confirmed.current=false}}
    onKeyDown={event=>{
      event.stopPropagation()
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();return}
      if(composing.current||event.nativeEvent.isComposing||event.keyCode===229)return
      if((event.ctrlKey||event.metaKey)&&confirmed.current&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();onHistory(event.shiftKey||event.key.toLowerCase()==='y'?'redo':'undo');return}
      if(event.key==='Enter'){event.preventDefault();save();event.currentTarget.select()}
      else if(event.key==='Escape'){event.preventDefault();pending.current=null;markDirty(false);setText(value);setError('');event.currentTarget.blur()}
      else if(!event.ctrlKey&&!event.metaKey&&['ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();step(event.key==='ArrowUp'?1:-1,event)
      }
    }}/>{numeric&&<span className="native-sizing-number-end">{showUnit&&<span className="native-sizing-unit">像素</span>}<span className="native-sizing-steps">{([1,-1] as const).map(direction=><button key={direction} type="button" disabled={!writable} aria-label={`${direction>0?'增大':'减小'}${label}`} onPointerDown={event=>event.preventDefault()} onClick={event=>step(direction,event)}><EditorIcon name="chevron" size={10}/></button>)}</span></span>}{error&&<span role="alert">{error}</span>}</span>
}

