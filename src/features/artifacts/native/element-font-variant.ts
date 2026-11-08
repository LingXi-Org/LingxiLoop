import type {ArtifactNode} from '../../../../shared/artifact-document'

/** 原版仅把normal、bold和无符号十进制字面值交给字形菜单。 */
export function parseElementFontWeight(value:string):number|undefined{
 const text=value.trim()
 return text==='bold'?700:text==='normal'?400:/^\d+(\.\d+)?$/.test(text)?Number(text):undefined
}
export function elementFontWeightText(node:ArtifactNode):string{
 return node.css?.['font-weight']??(node.style.fontWeight===undefined?'':String(node.style.fontWeight))
}
