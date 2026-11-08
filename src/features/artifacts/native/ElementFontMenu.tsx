import {Fragment,useId,useLayoutEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react'
import {EditorIcon} from './EditorPrimitives'
import {editorFontFamily,editorFontKey,type EditorFont} from './editor-fonts'
import {displayFontFamily} from '../../../../shared/artifact-font-families'
import {elementFontGroups} from './element-font-picker'

export default function ElementFontMenu({families=[],currentFamily,autoFocus=true,initialKey,onChange,onClose}:{families?:readonly string[];currentFamily?:string;autoFocus?:boolean;initialKey?:'ArrowDown'|'ArrowUp'|null;onChange(font:EditorFont):void;onClose(restoreFocus?:boolean):void}){
 const search=useRef<HTMLInputElement>(null),root=useRef<HTMLDivElement>(null),id=useId(),[query,setQuery]=useState('')
 const groups=useMemo(()=>elementFontGroups(families,currentFamily),[families,currentFamily]),needle=query.trim().toLocaleLowerCase(),filtered=groups.map(group=>({...group,fonts:group.fonts.filter(font=>`${font.label} ${font.family}`.toLocaleLowerCase().includes(needle))})).filter(group=>group.fonts.length)
 const current=currentFamily?editorFontKey(displayFontFamily(currentFamily)):undefined
 const items=()=>[...root.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')??[]]
 useLayoutEffect(()=>{if(!root.current?.closest('[popover]')?.matches(':popover-open'))return;if(initialKey){const rows=items();(rows.find(row=>row.getAttribute('aria-checked')==='true')??(initialKey==='ArrowUp'?rows.at(-1):rows[0]))?.focus({preventScroll:true})}else if(autoFocus)search.current?.focus({preventScroll:true})},[autoFocus,initialKey])
 const keyDown=(event:KeyboardEvent)=>{
  if(event.nativeEvent.isComposing||event.keyCode===229){event.stopPropagation();return}
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose(true);return}
  if(event.key==='Tab'){
   event.preventDefault();event.stopPropagation();const rows=items();if(event.target===search.current&&!event.shiftKey&&rows.length){(rows.find(row=>row.getAttribute('aria-checked')==='true')??rows[0]).focus();return}if(event.shiftKey){onClose(true);return}const field=root.current?.closest('.native-font-field'),next=field?.nextElementSibling?.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary:not([aria-disabled=true])');onClose(false);next?.focus();return
  }
  event.stopPropagation();const rows=items(),input=event.target===search.current
  if(input){if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();(event.key==='ArrowUp'?rows.at(-1):rows.find(row=>row.getAttribute('aria-checked')==='true')??rows[0])?.focus()}else if(event.key==='Enter'&&needle&&filtered[0]?.fonts[0]){event.preventDefault();onChange(filtered[0].fonts[0]);onClose(true)}}
  else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const index=rows.indexOf(document.activeElement as HTMLButtonElement);rows[event.key==='Home'?0:event.key==='End'?rows.length-1:(index+(event.key==='ArrowUp'?-1:1)+rows.length)%rows.length]?.focus()}
  else if(event.key.length===1&&event.key!==' '&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();setQuery(value=>value+event.key);search.current?.focus()}
 }
 return <div ref={root} className="native-element-font-menu" onKeyDown={keyDown}>
  <div className="native-font-search"><div className="native-font-search-box"><EditorIcon name="search" size={14}/><input ref={search} aria-label="搜索字体" placeholder="搜索字体" value={query} autoComplete="off" spellCheck={false} onChange={event=>setQuery(event.target.value)}/>{query&&<button type="button" className="native-font-clear" aria-label="清空字体搜索" tabIndex={-1} onMouseDown={event=>event.preventDefault()} onClick={()=>{setQuery('');search.current?.focus()}}><EditorIcon name="close" size={12}/></button>}</div></div>
  <div className="native-font-list" data-empty={!filtered.length||undefined}>{filtered.map((group,index)=><Fragment key={group.id}>{index>0&&<div role="separator" className="native-text-style-separator"/>}{group.label&&<div role="presentation" className="native-font-group-caption"><span id={`${id}-${group.id}`}>{group.label}</span></div>}<div role="group" aria-labelledby={group.label?`${id}-${group.id}`:undefined}>{group.fonts.map(font=><button key={font.value} type="button" className="native-font-option" role="menuitemradio" aria-checked={current===editorFontKey(font.value)} data-font-current={current===editorFontKey(font.value)||undefined} tabIndex={-1} onClick={()=>{onChange(font);onClose(true)}}><span style={{fontFamily:editorFontFamily(font.family)}}>{font.label}</span>{current===editorFontKey(font.value)&&<span className="native-font-indicator"><EditorIcon name="check" size={16}/></span>}</button>)}</div></Fragment>)}{!filtered.length&&<button type="button" role="menuitem" className="native-text-style-empty" disabled>未找到匹配字体</button>}</div>
 </div>
}
