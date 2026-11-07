import {useId,useLayoutEffect,useMemo,useRef,useState,type RefObject} from 'react'
import type {ArtifactDocument} from '../../../../shared/artifact-document'
import type {ArtifactOperation} from '../../../../shared/artifact-operations'
import {parseInspectorCode,serializeInspectorCode,type InspectorCodeEntry} from '../../../../shared/artifact-inspector-code'
import {nodeCodeEntries,nodeCodePatch} from './inspector-code-edit'
import {useLocalDraft} from './draft-context'

interface Draft {text:string;base:ArtifactDocument;before:InspectorCodeEntry[];dirty:boolean}
interface Props {
  document:ArtifactDocument;pageId:string;selected:string[];readOnly:boolean
  field:RefObject<HTMLTextAreaElement|null>;requestFocus:RefObject<boolean>
  getBase():ArtifactDocument|null
  dispatch(operations:ArtifactOperation[],base:ArtifactDocument):void
  onNotice(message:string):void
}

export default function InspectorCode(props:Props){
  const {document,pageId,selected,readOnly,field,requestFocus}=props,page=document.pages[pageId]
  const {common,mixed}=useMemo(()=>{
    const lists=selected.flatMap(id=>page?.nodes[id]?[new Map(nodeCodeEntries(page.nodes[id],page).map(entry=>[entry.name,entry.value]))]:[])
    const names=[...new Set(lists.flatMap(list=>[...list.keys()]))].sort((a,b)=>Number(a.startsWith('@'))-Number(b.startsWith('@')))
    const common:InspectorCodeEntry[]=[],mixed:string[]=[]
    for(const name of names){const value=lists[0].get(name);if(value!==undefined&&lists.every(list=>list.get(name)===value))common.push({name,value});else mixed.push(name)}
    return {common,mixed}
  },[page,selected])
  const serialized=useMemo(()=>serializeInspectorCode(common,mixed),[common,mixed])
  const [draft,setDraft]=useState<Draft|null>(null),draftRef=useRef<Draft|null>(null),composing=useRef(false),afterComposition=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
  const latest=useRef({props,common});latest.current={props,common}
  const [error,setError]=useState<{line:number;message:string}|null>(null)
  const errorId=useId()
  const update=(value:Draft|null)=>{draftRef.current=value;setDraft(value)}
  const save=(discardInvalid=false)=>{
    clearTimeout(timer.current)
    const value=draftRef.current
    if(!value?.dirty)return true
    if(composing.current){afterComposition.current=true;return false}
    const result=parseInspectorCode(value.text,new Map(value.before.map(entry=>[entry.name,entry.value])))
    if(!result.ok){setError({line:result.line,message:result.message});if(discardInvalid){latest.current.props.onNotice(`第${result.line}行格式有误，已恢复上次有效的样式。`);update(null);markDirty(false)}return false}
    try{
      const operations:ArtifactOperation[]=selected.map((id):Extract<ArtifactOperation,{type:'node.patch'}>=>{
        const node=value.base.pages[pageId]?.nodes[id]
        if(!node)throw new Error('原元素已被移除，修改尚未保存。')
        return {type:'node.patch',pageId,nodeId:id,...nodeCodePatch(node,value.before,result.entries)}
      }).filter(operation=>Object.keys(operation.patch).length>0||!!operation.unset?.length)
      if(operations.length)latest.current.props.dispatch(operations,value.base)
      update({...value,base:latest.current.props.getBase()??value.base,before:result.entries,dirty:false})
      setError(null);markDirty(false);return true
    }catch(problem){
      const message=problem instanceof Error?problem.message:'样式修改未能应用，请检查后重试。'
      latest.current.props.onNotice(message);setError(null)
      if(discardInvalid){update(null);markDirty(false)}
      return false
    }
  }
  const markDirty=useLocalDraft(reason=>{save(reason==='unmount')})
  const change=(text:string)=>{
    const previous=draftRef.current,value={text,base:previous?.base??latest.current.props.document,before:previous?.before??latest.current.common,dirty:true}
    update(value);markDirty(true)
    clearTimeout(timer.current)
    if(!composing.current)timer.current=setTimeout(()=>save(),220)
  }
  useLayoutEffect(()=>{if(requestFocus.current){requestFocus.current=false;field.current?.focus()}return()=>clearTimeout(timer.current)},[field,requestFocus])
  const primary=selected.length===1?page?.nodes[selected[0]]:undefined
  return <div className="native-code-pane">
    {primary&&<div className="native-code-subject"><span>{primary.attributes?.href?'<a>':'<div>'}</span>{primary.name||primary.text?<span>{primary.name??primary.text?.slice(0,80)}</span>:null}</div>}
    {error&&<span id={errorId} className="native-sr-only">第{error.line}行：{error.message}</span>}
    <textarea ref={field} aria-label="样式与属性" aria-invalid={!!error} aria-describedby={error?errorId:undefined} title={error?`第${error.line}行：${error.message}`:undefined} readOnly={readOnly||!selected.length} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder={!selected.length?'选择一个元素以查看其样式。':readOnly?'所选元素没有设置样式。':'尚未设置样式。输入属性和值即可编辑。'} value={draft?.text??serialized}
      onFocus={()=>{if(!draftRef.current)update({text:serialized,base:document,before:common,dirty:false})}}
      onChange={event=>change(event.target.value)}
      onCompositionStart={()=>{composing.current=true;clearTimeout(timer.current);markDirty(true)}}
      onCompositionEnd={event=>{composing.current=false;change(event.currentTarget.value);if(afterComposition.current){afterComposition.current=false;queueMicrotask(()=>save())}}}
      onBlur={()=>{save(true);if(!draftRef.current?.dirty)update(null)}}
      onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s')return;event.stopPropagation();if(event.key==='Escape'&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.blur()}}}/>
  </div>
}
