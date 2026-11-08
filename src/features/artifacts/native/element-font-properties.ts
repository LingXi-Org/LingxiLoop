import type {ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import {editorFontKey,type EditorFont} from './editor-fonts'
import {displayFontFamily} from '../../../../shared/artifact-font-families'
import {textPropertyPatch} from './element-text-properties'

/** 字体选择只修改字体声明；原字重与斜体继续由作者控制。 */
export function elementFontFamilyPatch(node:ArtifactNode,page:ArtifactPage,font:EditorFont|null,unify=false):ReturnType<typeof textPropertyPatch>{
 const current=node.css?.['font-family']??node.style.fontFamily
 if(!unify&&font&&!font.theme&&node.style.themeFont===undefined&&node.style.themeFontFallback===undefined&&current&&editorFontKey(displayFontFamily(current))===editorFontKey(displayFontFamily(font.family)))return{patch:{},unset:[]}
 const result=textPropertyPatch(node,page,{'font-family':font?.theme?null:font?.family??null})
 if(font?.theme){
  result.patch.style={...result.patch.style,themeFont:font.theme,themeFontFallback:font.family}
  result.unset=result.unset.filter(field=>field!=='style.themeFont'&&field!=='style.themeFontFallback')
 }else{
  for(const field of ['themeFont','themeFontFallback']as const)if(node.style[field]!==undefined)result.unset.push(`style.${field}`)
 }
 if(font===null&&node.style.fontFamily!==undefined)result.unset.push('style.fontFamily')
 result.unset=[...new Set(result.unset)]
 return result
}
