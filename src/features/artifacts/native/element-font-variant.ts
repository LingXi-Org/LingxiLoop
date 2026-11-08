import type {ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import type {EditorFontVariant} from './editor-fonts'
import {textPropertyPatch} from './element-text-properties'

export interface RenderedFontVariant{weight:number;italic:boolean}
/** 来源字重控件把weight/style作为同一字形操作，还原同时清除两项。 */
export function elementFontVariantPatch(node:ArtifactNode,page:ArtifactPage,variant:Pick<EditorFontVariant,'weight'|'style'>|null,current:RenderedFontVariant):ReturnType<typeof textPropertyPatch>{
 if(variant===null)return textPropertyPatch(node,page,{'font-weight':null,'font-style':null})
 current=elementFontVariantValue(node,current)
 const own=node.style.fontWeight!==undefined||node.style.fontStyle!==undefined||node.css?.['font-weight']!==undefined||node.css?.['font-style']!==undefined
 if(own&&variant.weight===current.weight&&(variant.style==='italic')===current.italic)return{patch:{},unset:[]}
 const companion=node.css?.['font-style']??node.style.fontStyle??'',style=variant.style==='italic'?'italic':current.italic?'normal':companion||null
 return textPropertyPatch(node,page,{'font-weight':String(variant.weight),'font-style':style})
}

/** 原版仅把normal、bold和无符号十进制字面值交给字形菜单。 */
export function parseElementFontWeight(value:string):number|undefined{
 const text=value.trim()
 return text==='bold'?700:text==='normal'?400:/^\d+(\.\d+)?$/.test(text)?Number(text):undefined
}
export function elementFontWeightText(node:ArtifactNode):string{
 return node.css?.['font-weight']??(node.style.fontWeight===undefined?'':String(node.style.fontWeight))
}

/** 自有字面值与伴随声明决定菜单当前项；缺省值才取实际计算结果。 */
export function elementFontVariantValue(node:ArtifactNode,rendered:RenderedFontVariant):RenderedFontVariant{
 const companion=(node.css?.['font-style']??node.style.fontStyle??'').trim()
 return{weight:parseElementFontWeight(elementFontWeightText(node))??rendered.weight,italic:companion?/^(italic|oblique)/.test(companion):rendered.italic}
}
