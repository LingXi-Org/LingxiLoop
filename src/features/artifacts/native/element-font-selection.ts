import type {ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import {editorFontChoice,type EditorFont,type EditorFontVariant} from './editor-fonts'
import {parseElementFontWeight} from './element-font-variant'
import {textPropertyPatch} from './element-text-properties'

export interface ElementFontState {
 value?:string|null
 fallback?:string|null
 companionValue?:string|null
 companionFallback?:string|null
}

export function elementFontSelectionVariantValue(state:ReturnType<typeof mergeElementFontStates>){
 return{weight:parseElementFontWeight(state.value??'')??parseElementFontWeight(state.fallback??'')??400,italic:/^(italic|oblique)/.test((state.companionValue??'').trim())}
}

/** 多选选择使用同一对声明；混合值必须提交，不能被单元素相同值短路。 */
export function elementFontSelectionVariantPatch(node:ArtifactNode,page:ArtifactPage,variant:Pick<EditorFontVariant,'weight'|'style'>|null,state:ReturnType<typeof mergeElementFontStates>):ReturnType<typeof textPropertyPatch>{
 if(variant===null)return textPropertyPatch(node,page,{'font-weight':null,'font-style':null})
 const current=elementFontSelectionVariantValue(state),explicit=!!(state.value||state.companionValue),mixed=state.mixed||state.companionMixed
 if(explicit&&!mixed&&variant.weight===current.weight&&(variant.style==='italic')===current.italic)return{patch:{},unset:[]}
 return textPropertyPatch(node,page,{'font-weight':String(variant.weight),'font-style':variant.style==='italic'?'italic':current.italic?'normal':state.companionValue||null})
}

/** 固定来源多选检查器合并声明；仅共同计算值保留为回退，不转成自有声明。 */
export function mergeElementFontStates(states:readonly ElementFontState[]){
 const values=states.map(state=>state.value??''),companions=states.map(state=>state.companionValue??''),fallbacks=states.map(state=>state.fallback??'')
 const mixed=values.some(value=>value!==values[0]),companionMixed=companions.some(value=>value!==companions[0])
 return{
  value:!mixed&&values[0]||null,
  companionValue:!companionMixed&&companions[0]||null,
  mixed,companionMixed,
  ...(!fallbacks.some(value=>value!==fallbacks[0])&&fallbacks[0]?{fallback:fallbacks[0]}:{})
 }
}

/** 来源混合组选择使用目录字体栈；自定义字体使用带引号的字面名称。 */
export function elementFontSelectionFamilyChoice(font:EditorFont):EditorFont{
 if(font.theme)return font
 const known=editorFontChoice(font.family)
 if(!known||known.theme)return{...font,family:`"${font.family.replaceAll('"','')}"`}
 const generic=known.family==='Courier New'?'monospace':['Georgia','Times New Roman','Garamond','Playfair Display','Merriweather','Lora'].includes(known.family)?'serif':'sans-serif'
 return{...font,family:`${known.family}, ${generic}`}
}
