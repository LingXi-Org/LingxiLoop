import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {ArtifactDocument,ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import {artifactVersionKey,type ArtifactOperation} from '../../../../shared/artifact-operations'
import {elementSizingPatch,elementSizingValue,sizingLabels,type SizingProperty} from './element-sizing'
import {EditorIcon,IconButton,Menu,MenuItem} from './EditorPrimitives'
import {useLocalDraft} from './draft-context'
import type {DraftFlushReason} from './drafts'

interface Props {
  node:ArtifactNode;page:ArtifactPage;writable:boolean
  getBase():ArtifactDocument|null
  commit(operations:ArtifactOperation[],base:ArtifactDocument,readKeys?:readonly string[]):boolean
  retain(operations:ArtifactOperation[]):void
  onNotice(message:string):void
  onHistory(direction:'undo'|'redo'):void
}
type Changes=Partial<Record<SizingProperty,string|null>>

function SizingInput({property,value,placeholder,writable,getBase,apply,retain,onHistory,numeric=false}:{
  property:SizingProperty;value:string;placeholder?:string;writable:boolean;numeric?:boolean
  getBase():ArtifactDocument|null
  apply(changes:Changes,base:ArtifactDocument):void
  retain(changes:Changes,base:ArtifactDocument):void
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
    const next=Math.round((Number(parsed?.[1]??0)+direction*amount)*100)/100,value=['width','height','min-width','max-width','min-height','max-height'].includes(property)?Math.max(0,next):next
    change(`${value}${numeric&&unit==='px'?'':unit}`);save();field.current?.focus({preventScroll:true});field.current?.select()
  }
  return <span className={`native-sizing-input${numeric?' native-sizing-number':''}`}><input ref={field} aria-label={sizingLabels[property]} value={text} placeholder={placeholder} readOnly={!writable} spellCheck={false}
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
    }}/>{numeric&&<span className="native-sizing-number-end"><span className="native-sizing-unit">像素</span><span className="native-sizing-steps">{([1,-1] as const).map(direction=><button key={direction} type="button" disabled={!writable} aria-label={`${direction>0?'增大':'减小'}${sizingLabels[property]}`} onPointerDown={event=>event.preventDefault()} onClick={event=>step(direction,event)}><EditorIcon name="chevron" size={10}/></button>)}</span></span>}{error&&<span role="alert">{error}</span>}</span>
}

export default function ElementSizingProperties(props:Props){
  const {node,page,writable,getBase,commit,retain,onNotice,onHistory}=props,root=useRef<HTMLElement>(null)
  const [shownExtras,setShownExtras]=useState<SizingProperty[]>([])
  const [fallback,setFallback]=useState({width:node.width+'px',height:node.height+'px',right:'0px',bottom:'0px'})
  useLayoutEffect(()=>{const element=root.current?.closest('[data-native-artifact-editor]')?.querySelector<HTMLElement>(`[data-page-id="${page.id}"] [data-node-id="${node.id}"]`);if(!element)return;const style=getComputedStyle(element),round=(value:string)=>{const number=Number.parseFloat(value);return(Number.isFinite(number)?Math.abs(number)>20?Math.round(number):Math.round(number*100)/100:0)+'px'};setFallback({width:round(style.width),height:round(style.height),right:round(style.right),bottom:round(style.bottom)})},[node.id,page.id])
  const values=(property:SizingProperty)=>elementSizingValue(node,page,property)
  const retainChanges=(changes:Changes,base:ArtifactDocument)=>{
    const original=base.pages[page.id]?.nodes[node.id];if(!original)return
    // Recovery is data only: partial IME input never executes as a declaration.
    retain([{type:'node.patch',pageId:page.id,nodeId:node.id,patch:{css:{...original.css,...Object.fromEntries(Object.entries(changes).map(([key,value])=>[key,value??'auto']))}}}])
  }
  const apply=(changes:Changes,base=getBase())=>{
    const owner=base?.pages[page.id],original=owner?.nodes[node.id];if(!base||!owner||!original)return
    const {patch,unset}=elementSizingPatch(original,owner,changes)
    if(!Object.keys(patch).length&&!unset.length)return
    const geometry:Record<string,string[]>={width:['width','implicitWidth'],height:['height','implicitHeight'],left:['x'],top:['y']},keys=new Set(['css',...Object.keys(changes).flatMap(key=>geometry[key]??[])])
    commit([{type:'node.patch',pageId:page.id,nodeId:node.id,patch,...(unset.length?{unset}:{})}],base,[...keys].map(key=>artifactVersionKey.node(page.id,node.id,`field/${key}`)))
  }
  const instant=(changes:Changes)=>{try{apply(changes)}catch{onNotice('尺寸修改未能应用，请检查后重试。')}}
  const rendered=(axis:'width'|'height')=>fallback[axis]
  const extras=(['min-width','max-width','min-height','max-height','bottom','right'] as const)
  const input=(property:SizingProperty)=>{
    const numeric=extras.includes(property as typeof extras[number]),raw=values(property),axis=property==='width'||property==='height',value=axis&&!raw?fallback[property as 'width'|'height']:numeric&&!raw?property.startsWith('min-')?'0':property==='right'||property==='bottom'?fallback[property].replace(/px$/,''):'':numeric||property==='left'||property==='top'?raw.replace(/px$/,''):raw
    return <SizingInput key={property} property={property} value={value} placeholder={axis?rendered(property as 'width'|'height'):property.startsWith('max-')?'无':undefined} numeric={numeric} writable={writable} getBase={getBase} apply={apply} retain={retainChanges} onHistory={onHistory}/>
  }
  const extra=(property:typeof extras[number])=><div className="native-sizing-row" key={property}><span className="native-sizing-label">{sizingLabels[property]}<IconButton icon="close" label={`移除${sizingLabels[property]}`} disabled={!writable} onClick={()=>{setShownExtras(items=>items.filter(item=>item!==property));instant({[property]:null})}}/></span>{input(property)}</div>
  const visible=(property:typeof extras[number])=>!!values(property)||shownExtras.includes(property)
  const position=values('position'),positionLabels:Record<string,string>={static:'普通',relative:'相对',absolute:'绝对',fixed:'固定',sticky:'粘性'}
  return <section ref={root} className="native-property-section native-element-link native-element-sizing">
    <header><h3>尺寸</h3><Menu label="添加尺寸属性" icon="plus" disabled={!writable} popupRole="menu" minimumWidth={184}>{extras.filter(property=>!visible(property)).map(property=><MenuItem key={property} role="menuitem" onClick={()=>setShownExtras(items=>[...items,property])}>{sizingLabels[property]}</MenuItem>)}</Menu></header>
    {(['width','height'] as const).map(axis=>{
      const value=values(axis),mode=value==='auto'||!value?'hug':value==='100%'?'fill':'fixed',labels={hug:'自适应',fixed:'固定',fill:'填充'}
      return <div className="native-sizing-row" key={axis}><span className="native-sizing-label">{sizingLabels[axis]}<IconButton icon="undo" label={`还原${sizingLabels[axis]}`} disabled={!writable} onClick={()=>instant({[axis]:null})}/></span>{input(axis)}<Menu className="native-sizing-mode" label={`${sizingLabels[axis]}模式：${labels[mode]}`} text={labels[mode]} disabled={!writable} popupRole="menu" minimumWidth={144}>{(['hug','fixed','fill'] as const).map(choice=><MenuItem key={choice} role="menuitemradio" aria-checked={mode===choice} selected={mode===choice} onClick={()=>instant({[axis]:choice==='hug'?null:choice==='fill'?'100%':rendered(axis)})}>{labels[choice]}</MenuItem>)}</Menu></div>
    })}
    {extras.filter(property=>property.startsWith('min-')||property.startsWith('max-')).filter(visible).map(extra)}
    <div className="native-sizing-row"><span className="native-sizing-label">位置<IconButton icon="undo" label="还原位置" disabled={!writable} onClick={()=>instant({position:'static'})}/></span><Menu className="native-sizing-position" label={`位置：${positionLabels[position]??'自定义'}`} text={positionLabels[position]??'自定义'} disabled={!writable} popupRole="menu" minimumWidth={160}>{Object.entries(positionLabels).map(([value,label])=><MenuItem key={value} role="menuitemradio" selected={position===value} aria-checked={position===value} onClick={()=>instant({position:value})}>{label}</MenuItem>)}</Menu></div>
    {position!=='static'&&<div className="native-sizing-row"><span className="native-sizing-label">偏移<IconButton icon="undo" label="还原偏移" disabled={!writable} onClick={()=>instant({left:null,top:null})}/></span><div className="native-sizing-offset"><label><span>横</span>{input('left')}</label><label><span>纵</span>{input('top')}</label></div></div>}
    {extras.filter(property=>property==='right'||property==='bottom').filter(visible).map(extra)}
  </section>
}
