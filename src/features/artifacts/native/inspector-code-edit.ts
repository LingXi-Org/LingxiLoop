import {artifactNodeSchema,type ArtifactNode,type ArtifactPage,type ArtifactStyle} from '../../../../shared/artifact-document'
import type {InspectorCodeEntry} from '../../../../shared/artifact-inspector-code'
import {isNativeCodeAttribute,isNativeCodeStyle} from '../../../../shared/artifact-node-code'
import {appearance,nodeTransform,paddingCss} from '../../../../shared/artifact-appearance'

const styleFields:Record<string,keyof ArtifactStyle>={color:'color',fill:'fill',stroke:'stroke','stroke-width':'strokeWidth','background-color':'backgroundColor','border-color':'borderColor','border-width':'borderWidth','border-style':'borderStyle',opacity:'opacity','border-radius':'borderRadius','font-family':'fontFamily','font-size':'fontSize','font-weight':'fontWeight','font-style':'fontStyle','text-align':'textAlign','text-decoration':'textDecoration','line-height':'lineHeight','letter-spacing':'letterSpacing',padding:'padding'}
const numeric=new Set(['strokeWidth','borderWidth','opacity','borderRadius','fontSize','fontWeight','lineHeight','letterSpacing','padding'])
const unitless=new Set(['opacity','fontWeight','lineHeight'])
const geometry:Record<string,'x'|'y'|'width'|'height'>={left:'x',top:'y',width:'width',height:'height'}
const pixel=(value:string)=>/^[+-]?(?:\d+\.?\d*|\.\d+)(?:px)?$/.test(value)?Number.parseFloat(value):undefined

export function nodeCodeEntries(node:ArtifactNode,page:ArtifactPage):InspectorCodeEntry[]{
  const parent=node.parentId?page.nodes[node.parentId]:undefined,flow=parent?.layout?.mode==='flex'||parent?.layout?.mode==='grid'
  const values=new Map<string,string>([['position',flow?'relative':'absolute'],...(!flow?[['left',`${node.x}px`],['top',`${node.y}px`]] as [string,string][]:[]),['width',`${node.width}px`],['height',`${node.height}px`]])
  if(node.rotation||node.flipX||node.flipY)values.set('transform',nodeTransform(node))
  for(const [name,field]of Object.entries(styleFields)){
    const value=node.style[field]
    if(value!==undefined)values.set(name,typeof value==='number'?`${value}${unitless.has(field)?'':'px'}`:String(value))
  }
  if(node.style.paddingX!==undefined||node.style.paddingY!==undefined)values.set('padding',paddingCss(node.style)??'0px')
  for(const [key,value]of Object.entries(appearance(node.style)))if(value!==undefined)values.set(key.replace(/[A-Z]/g,char=>`-${char.toLowerCase()}`),String(value))
  for(const [key,value]of Object.entries(node.css??{}))values.set(key,value)
  return [...values].map(([name,value])=>({name,value})).concat(Object.entries(node.attributes??{}).map(([name,value])=>({name:`@${name}`,value})))
}

/** Apply only edited declarations so mixed selections retain their other values. */
export function nodeCodePatch(node:ArtifactNode,before:readonly InspectorCodeEntry[],after:readonly InspectorCodeEntry[]):{patch:Partial<ArtifactNode>;unset:string[]}{
  const oldValues=new Map(before.map(entry=>[entry.name,entry.value])),newValues=new Map(after.map(entry=>[entry.name,entry.value]))
  const patch:Partial<ArtifactNode>={},unset:string[]=[],style:Record<string,unknown>={},css={...node.css},attributes={...node.attributes}
  let cssChanged=false,attributesChanged=false
  for(const name of new Set([...oldValues.keys(),...newValues.keys()])){
    const value=newValues.get(name)
    if(value===oldValues.get(name))continue
    if(name.startsWith('@')){
      const attribute=name.slice(1)
      if(value!==undefined&&!isNativeCodeAttribute(attribute,value))throw new Error(/^on/i.test(attribute)||attribute==='srcdoc'?'事件或网页源码属性请在对话中交给智能体修改。':`属性「${attribute}」不能直接应用到此对象。`)
      if(value===undefined)delete attributes[attribute];else attributes[attribute]=value
      attributesChanged=true;continue
    }
    if(value!==undefined&&!isNativeCodeStyle(name,value))throw new Error(`样式「${name}」格式无效或含有活动内容。`)
    const field=styleFields[name],number=value===undefined?undefined:pixel(value)
    if(geometry[name]&&number!==undefined){patch[geometry[name]]=number;delete css[name];cssChanged=cssChanged||Object.hasOwn(node.css??{},name)}
    else if(field&&(value===undefined||!numeric.has(field)||number!==undefined)){
      if(value===undefined)unset.push(`style.${field}`);else style[field]=numeric.has(field)?number:value
      if(name==='color')unset.push('style.themeColor')
      if(name==='fill')unset.push('style.themeFill')
      if(name==='font-family')unset.push('style.themeFont','style.themeFontFallback')
      delete css[name];cssChanged=cssChanged||Object.hasOwn(node.css??{},name)
    }else{
      if(value===undefined){if(Object.hasOwn(css,name))delete css[name];else if(geometry[name])css[name]='auto'}else css[name]=value
      cssChanged=true
    }
  }
  if(Object.keys(style).length)patch.style=style as ArtifactStyle
  if(cssChanged){if(Object.keys(css).length)patch.css=css;else unset.push('css')}
  if(attributesChanged){if(Object.keys(attributes).length)patch.attributes=attributes;else unset.push('attributes')}
  const candidate={...node,...patch,style:{...node.style,...patch.style}}
  if(!artifactNodeSchema.safeParse(candidate).success)throw new Error('样式值超出支持的范围，请检查尺寸和文字设置。')
  return {patch,unset:[...new Set(unset)]}
}
