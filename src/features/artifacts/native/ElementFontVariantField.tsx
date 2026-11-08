import {useEffect,useRef,useState} from 'react'
import {RotateCcw} from 'lucide-react'
import {EditorIcon,FloatingPopover} from './EditorPrimitives'
import {editorFontMenuVariants,editorFontVariantLabel,type EditorFontVariant} from './editor-fonts'

export default function ElementFontVariantField({family,weight,italic,explicit,disabled,onBegin,onReset,onChange}:{family?:string;weight:number;italic:boolean;explicit:boolean;disabled:boolean;onBegin():void;onReset():void;onChange(variant:EditorFontVariant):void}){
 const trigger=useRef<HTMLButtonElement>(null),restore=useRef(false),[open,setOpen]=useState(false),style=italic?'italic':'normal'
 const close=(focus=false)=>{restore.current=focus;setOpen(false)}
 useEffect(()=>{if(disabled)close()},[disabled])
 useEffect(()=>{if(!open&&restore.current){restore.current=false;if(!disabled)trigger.current?.focus()}},[open,disabled])
 const label=(variant:EditorFontVariant)=>variant.weight===400&&variant.style==='italic'?'斜体':editorFontVariantLabel(variant.weight,variant.style)
 const variants=editorFontMenuVariants(family,weight,style)
 return <div className="native-field native-font-field native-font-variants native-element-font-variant" data-inherited={!explicit||undefined} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))close()}}>
  <span className="native-font-label"><span className="native-font-label-text native-font-weight-label-text">字重</span>{explicit&&<span className="native-font-reset-wrap"><button type="button" className="native-font-reset" aria-label="还原字重" title="使用继承的字形" disabled={disabled} onClick={()=>{trigger.current?.focus();onBegin();onReset()}}><RotateCcw aria-hidden="true" size={12} strokeWidth={1.5}/></button></span>}</span>
  <button ref={trigger} type="button" aria-label="字重" aria-haspopup="menu" aria-expanded={open&&!disabled} disabled={disabled} onClick={()=>{if(open)close();else{onBegin();setOpen(true)}}} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();onBegin();setOpen(true)}}}><span>{label({weight,style,label:''})}</span><EditorIcon name="chevron" size={12}/></button>
  {open&&!disabled&&<FloatingPopover anchor={trigger} label="字形选项" role="menu" className="native-font-popup native-font-variant-popup" align="start" matchAnchorWidth gap={6} initialFocusSelector="[aria-checked=true]" onClose={close}>
   <div className="native-font-variant-list" onFocusCapture={event=>{const item=event.target as HTMLElement;if(item.getAttribute('role')!=='menuitemradio')return;const row=item.getBoundingClientRect(),viewport=event.currentTarget.getBoundingClientRect();if(row.top<viewport.top)event.currentTarget.scrollTop+=row.top-viewport.top;else if(row.bottom>viewport.bottom)event.currentTarget.scrollTop+=row.bottom-viewport.bottom}} onKeyDown={event=>{if(event.nativeEvent.isComposing){event.stopPropagation();return}if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return}if(event.key==='Tab'){event.preventDefault();event.stopPropagation();if(event.shiftKey)close(true);else{const next=trigger.current?.closest('.native-field')?.nextElementSibling?.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),summary:not([aria-disabled=true])');close();next?.focus()}return}event.stopPropagation();if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')),index=items.indexOf(document.activeElement as HTMLButtonElement);items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowUp'?-1:1)+items.length)%items.length]?.focus()}}}>
    {variants.map(variant=><button key={`${variant.weight}-${variant.style}`} type="button" role="menuitemradio" className="native-font-variant-option" tabIndex={-1} aria-checked={explicit&&variant.weight===weight&&variant.style===style} onClick={()=>{onChange(variant);close(true)}}><span>{label(variant)}</span>{explicit&&variant.weight===weight&&variant.style===style&&<EditorIcon name="check" size={16}/>}</button>)}
   </div>
  </FloatingPopover>}
 </div>
}
