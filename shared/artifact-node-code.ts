import { parseInspectorCode } from './artifact-inspector-code'

const reserved = new Set(['__proto__','prototype','constructor'])
const decodeCss = (value:string) => value.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\\([0-9a-f]{1,6})\s?|\\([^\r\n\f])/gi,(_,hex:string,char:string)=>hex?String.fromCodePoint(Math.min(0x10ffff,parseInt(hex,16))):char)

/** Inline declarations only: selectors, handlers and executable sources stay isolated. */
export function isNativeCodeStyle(name:string,value:string):boolean {
  if(reserved.has(name)||!/^--[\w-]+$|^-?[a-z][a-z0-9-]*$/.test(name)||['behavior','-moz-binding'].includes(name)||value.length>10000||/[\u0000-\u001f\u007f]/.test(value))return false
  if(!parseInspectorCode(`${name}: ${value}`).ok)return false
  const decoded=decodeCss(value).replace(/\s/g,'').toLowerCase()
  return !/(?:expression\(|(?:javascript|vbscript):|@import|data:(?!image\/(?:png|gif|jpe?g|webp|avif|svg\+xml)[;,]))/.test(decoded)
}

export function isNativeCodeAttribute(name:string,value:string):boolean {
  if(value.length>10000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||reserved.has(name))return false
  if(/^data-(?!native(?:-|$)|node-(?:id|type)$|content-layer$)[a-z][a-z0-9-]*$/.test(name)||/^aria-[a-z][a-z-]*$/.test(name))return true
  if(['title','lang','role','id'].includes(name))return true
  if(name==='dir')return ['ltr','rtl','auto'].includes(value)
  if(name==='hidden')return value===''||value==='hidden'
  if(name==='tabindex')return value==='0'||value==='-1'
  if(name==='target')return value==='_blank'||value==='_self'
  if(name==='href')return /^(?:https?:\/\/|mailto:|tel:|#)/i.test(value)&&!/[\u0000-\u0020<>\\]/.test(value)
  return false
}

export function codeStyleProperties(css:Record<string,string>|undefined):Record<string,string> {
  return Object.fromEntries(Object.entries(css??{}).map(([key,value])=>[key.startsWith('--')?key:key.replace(/-([a-z])/g,(_,letter:string)=>letter.toUpperCase()),value.replace(/\s*!important\s*$/i,'')]))
}

export function codeAttributeProperties(attributes:Record<string,string>|undefined):Record<string,string|boolean|number> {
  return Object.fromEntries(Object.entries(attributes??{}).map(([key,value])=>key==='tabindex'?['tabIndex',Number(value)]:key==='hidden'?['hidden',true]:[key,value]))
}
