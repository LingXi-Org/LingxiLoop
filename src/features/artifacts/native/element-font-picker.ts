import {displayFontFamily} from '../../../../shared/artifact-font-families'
import {EDITOR_FONTS,editorFontChoice,editorFontKey,type EditorFont} from './editor-fonts'

export interface ElementFontOption extends EditorFont{preview:boolean}
export interface ElementFontGroup{id:'used'|'all';label?:string;fonts:ElementFontOption[]}
const previewFont=(family:string)=>/^(?:ui-)?(?:serif|sans-serif|monospace|rounded|cursive|fantasy|system-ui|math|emoji|fangsong)$/.test(family)||/^[\w .-]+$/.test(family)
/** 仅在按需字体菜单中构建；来源目录和文档字体分别成组，作者声明原样保存。 */
export function elementFontGroups(usedFamilies:readonly string[],currentFamily?:string):ElementFontGroup[]{
 const all=EDITOR_FONTS.filter(font=>!font.theme).map(font=>({...font,preview:true})).sort((a,b)=>a.family<b.family?-1:a.family>b.family?1:0)
 const names=new Map<string,string>()
 for(const family of usedFamilies)if(!names.has(editorFontKey(family)))names.set(editorFontKey(family),family)
 const current=currentFamily?displayFontFamily(currentFamily):''
 if(current&&!all.some(font=>editorFontKey(font.family)===editorFontKey(current))&&!names.has(editorFontKey(current))){const previous=[...names];names.clear();names.set(editorFontKey(current),current);for(const [key,value]of previous)names.set(key,value)}
 let custom=0
 const used=[...names.values()].map(name=>{
  const known=editorFontChoice(name),family=known&&!known.theme?known.family:name
  return{value:family,family,preview:previewFont(family),label:known?.label??`自定义字体 ${++custom}`}
 })
 return[...(used.length?[{id:'used' as const,label:'此设计中',fonts:used}]:[]),{id:'all',label:used.length?'全部字体':undefined,fonts:all}]
}
