import {useRef,useState,type MouseEvent,type HTMLAttributes,type ReactNode} from 'react'
import type {ArtifactDocument} from '../../../../shared/artifact-document'
import type {ArtifactOperation} from '../../../../shared/artifact-operations'
import {useLocalDraft} from './draft-context'
import type {DraftFlushReason} from './drafts'

interface Props {
  pageId:string
  title:string
  writable:boolean
  onSelect(event:MouseEvent<HTMLButtonElement>):void
  getBase():ArtifactDocument
  commit(operations:ArtifactOperation[],base:ArtifactDocument):boolean
  retain(operations:ArtifactOperation[]):void
  children:ReactNode
  heading:Pick<HTMLAttributes<HTMLDivElement>,'onPointerDown'|'onClickCapture'|'onKeyDown'>
}

export function BoardTitle({pageId,title,writable,onSelect,getBase,commit,retain,children,heading}:Props){
  const [editing,setEditing]=useState(false),[text,setText]=useState(title)
  const draft=useRef<{base:ArtifactDocument;text:string}|null>(null)
  const composing=useRef(false),flushAfterComposition=useRef(false),button=useRef<HTMLButtonElement>(null)
  const finish=(reason?:DraftFlushReason)=>{
    const value=draft.current
    if(composing.current&&reason!=='unmount'){flushAfterComposition.current=true;return}
    draft.current=null;markDirty(false)
    const next=value?.text.trim()
    if(value&&next&&next!==value.base.pages[pageId]?.title){
      const operations:ArtifactOperation[]=[{type:'page.patch',pageId,patch:{title:next}}]
      if(composing.current)retain(operations)
      else commit(operations,value.base)
    }
    if(reason!=='unmount')setEditing(false)
  }
  const markDirty=useLocalDraft(finish)
  const change=(value:string)=>{if(!draft.current)return;draft.current.text=value;setText(value);markDirty(value!==draft.current.base.pages[pageId]?.title||composing.current)}
  return <div className="native-board-heading" {...heading} onDoubleClick={event=>{
    if(!writable||editing||(event.target as Element).closest('.native-board-heading-actions'))return
    event.stopPropagation();draft.current={base:getBase(),text:title};setText(title);setEditing(true)
  }}>{editing?<input
    className="native-board-rename"
    aria-label="画板名称"
    value={text}
    readOnly={!writable}
    maxLength={1000}
    autoFocus
    onFocus={event=>event.currentTarget.select()}
    onPointerDown={event=>event.stopPropagation()}
    onChange={event=>change(event.target.value)}
    onCompositionStart={()=>{composing.current=true;markDirty(true)}}
    onCompositionEnd={event=>{composing.current=false;change(event.currentTarget.value);if(flushAfterComposition.current){flushAfterComposition.current=false;finish()}}}
    onBlur={()=>finish()}
    onKeyDown={event=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s')return
      event.stopPropagation()
      if(composing.current||event.nativeEvent.isComposing||event.keyCode===229)return
      if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur()}
      else if(event.key==='Escape'){event.preventDefault();draft.current=null;markDirty(false);setEditing(false);queueMicrotask(()=>button.current?.focus({preventScroll:true}))}
    }}
  />:<button ref={button} type="button" className="native-board-label" onClick={onSelect}>{title}</button>}{editing?<span className="native-board-heading-actions"/>:children}</div>
}
