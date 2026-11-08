import {useEffect,useRef,useState} from 'react'
import type {ArtifactDocument,ArtifactNode} from '../../../../shared/artifact-document'
import {artifactVersionKey,type ArtifactOperation} from '../../../../shared/artifact-operations'
import {elementLink,elementLinkPatch} from '../../../../shared/artifact-element-link'
import {useLocalDraft} from './draft-context'
import type {DraftFlushReason} from './drafts'
import './element-link-field.css'

interface Props {
  node:ArtifactNode
  pageId:string
  writable:boolean
  getBase():ArtifactDocument|null
  commit(operations:ArtifactOperation[],base:ArtifactDocument,readKeys?:readonly string[]):boolean
  retain(operations:ArtifactOperation[]):void
}

export default function ElementLinkField({node,pageId,writable,getBase,commit,retain}:Props){
  const value=elementLink(node),[text,setText]=useState(value??''),[error,setError]=useState('')
  const draft=useRef<{text:string;base:ArtifactDocument}|null>(null),composing=useRef(false),afterComposition=useRef(false)
  const save=(reason?:DraftFlushReason)=>{
    const current=draft.current;if(!current)return
    if(composing.current&&reason!=='unmount'){afterComposition.current=true;return}
    const original=current.base.pages[pageId]?.nodes[node.id];if(!original)return
    if(current.text===(elementLink(original)??'')){
      draft.current=null;markDirty(false)
      if(reason!=='unmount'){setText(value??'');setError('')}
      return
    }
    let operations:ArtifactOperation[]
    try{
      const {patch,unset}=elementLinkPatch(original,current.text.trim())
      operations=Object.keys(patch).length||unset.length?[{type:'node.patch',pageId,nodeId:node.id,patch,...(unset.length?{unset}:{})}]:[]
    }catch{
      if(reason!=='unmount'){setError('链接格式无效，请使用网址、邮件、电话或文档内地址。');return}
      // Recovery data is never applied or sent automatically. Preserve the raw
      // destination even when it cannot enter the validated document model.
      retain([{type:'node.patch',pageId,nodeId:node.id,patch:{attributes:{...original.attributes,href:current.text}}}])
      draft.current=null;markDirty(false);return
    }
    draft.current=null;markDirty(false)
    if(composing.current)retain(operations);else if(operations.length)commit(operations,current.base,['attributes','richText'].map(field=>artifactVersionKey.node(pageId,node.id,`field/${field}`)))
    if(reason!=='unmount')setError('')
  }
  const markDirty=useLocalDraft(save)
  useEffect(()=>{if(!draft.current)setText(value??'')},[value])
  const change=(next:string)=>{
    const base=draft.current?.base??getBase();if(!base)return
    draft.current={text:next,base};setText(next);setError('');markDirty(true)
  }
  return <section className="native-property-section native-element-link native-element-link-field"><header><h3>链接</h3></header><div className="native-element-link-body"><label className="native-field"><span>目标</span><input aria-label="链接目标" placeholder={value===null?'混合':'输入网址…'} maxLength={['text','note'].includes(node.type)&&!node.attributes?.href?2048:10000} readOnly={!writable} value={text} onChange={event=>change(event.target.value)} onCompositionStart={()=>{composing.current=true;change(text)}} onCompositionEnd={event=>{composing.current=false;change(event.currentTarget.value);if(afterComposition.current){afterComposition.current=false;save()}}} onBlur={()=>save()} onKeyDown={event=>{event.stopPropagation();if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();return}if(event.key==='Enter'&&!event.nativeEvent.isComposing&&event.keyCode!==229&&!composing.current){event.preventDefault();save()}}}/></label>{error&&<p role="alert">{error}</p>}</div></section>
}
