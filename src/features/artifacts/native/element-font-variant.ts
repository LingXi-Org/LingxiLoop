import type {ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import type {EditorFontVariant} from './editor-fonts'
import {textPropertyPatch} from './element-text-properties'

export interface RenderedFontVariant{weight:number;italic:boolean}
/** 来源字重控件把weight/style作为同一字形操作，还原同时清除两项。 */
export function elementFontVariantPatch(node:ArtifactNode,page:ArtifactPage,variant:Pick<EditorFontVariant,'weight'|'style'>|null,current:RenderedFontVariant):ReturnType<typeof textPropertyPatch>{
 if(variant===null)return textPropertyPatch(node,page,{'font-weight':null,'font-style':null})
 const own=node.style.fontWeight!==undefined||node.style.fontStyle!==undefined||node.css?.['font-weight']!==undefined||node.css?.['font-style']!==undefined
 if(own&&variant.weight===current.weight&&(variant.style==='italic')===current.italic)return{patch:{},unset:[]}
 const companion=node.css?.['font-style']??node.style.fontStyle??'',style=variant.style==='italic'?'italic':current.italic?'normal':companion||null
 return textPropertyPatch(node,page,{'font-weight':String(variant.weight),'font-style':style})
}
