import type {ArtifactDocument,ArtifactNode,ArtifactPage} from './artifact-document.js'

/** 排版命名依据 baoyu-design v2.8.0；来源与MIT许可见 THIRD_PARTY_NOTICES.md。派生摘要不作为可编辑文档字段或页体。 */
import {typographyRoleOrder,type TypographyRole} from './artifact-typography-roles.js'
export {typographyRoleOrder,type TypographyRole} from './artifact-typography-roles.js'
export interface TypographyUsage {size:number;roles:Partial<Record<TypographyRole,number>>;families:Record<string,number>}
export type TypographyCensus=Record<string,TypographyUsage[]>
const roleNames:Record<TypographyRole,string>={Display:'展示文字','Heading 1':'标题 1','Heading 2':'标题 2','Heading 3':'标题 3','Heading 4':'标题 4','Heading 5':'标题 5','Heading 6':'标题 6',Lead:'引导文字',Eyebrow:'眉题',Body:'正文',Button:'按钮',Link:'链接',Stat:'数据文字',Wordmark:'品牌文字',Quote:'引文',Code:'代码文字',Label:'标签',Caption:'说明文字',Strong:'强调文字'}
const heading=(role:string)=>/^Heading( [1-6])?$/.test(role)
const tagRoles:Record<string,TypographyRole>={h1:'Heading 1',h2:'Heading 2',h3:'Heading 3',h4:'Heading 4',h5:'Heading 5',h6:'Heading 6',p:'Body',li:'Body',td:'Body',th:'Body',dd:'Body',dt:'Body',div:'Body',button:'Button',a:'Link',blockquote:'Quote',q:'Quote',code:'Code',pre:'Code',kbd:'Code',small:'Caption',figcaption:'Caption',caption:'Caption',label:'Label',span:'Caption',b:'Strong',strong:'Strong',em:'Body',i:'Body'}
const classRoles:Array<[RegExp,TypographyRole]>=[[/eyebrow|kicker|overline/i,'Eyebrow'],[/subhead|\blead\b|\bdek\b|intro|standfirst/i,'Lead'],[/display|hero-?title/i,'Display'],[/caption|footnote|\bmeta\b|footer|fine-?print|muted|byline/i,'Caption'],[/quote/i,'Quote'],[/\bcode\b|mono/i,'Code'],[/\bstat|metric|kpi|figure|numeral/i,'Stat'],[/wordmark|logo|brand/i,'Wordmark'],[/\bbtn\b|button|cta/i,'Button'],[/\bnav|menu|link/i,'Link'],[/label|tag\b|badge|chip|pill/i,'Label']]
export function inferTypographyRole(tag:string,classes='',button=false):TypographyRole|undefined{
 if(button)return 'Button'
 if(/^h[1-6]$/.test(tag))return tagRoles[tag]
 return classRoles.find(([pattern])=>pattern.test(classes))?.[1]??tagRoles[tag]
}
export function authoredTypographySize(node:ArtifactNode):number|undefined{
 if(node.css&&Object.hasOwn(node.css,'font-size')){
  const match=/^(\d+(?:\.\d+)?)(px|pt)$/.exec(node.css['font-size'].trim().replace(/\s*!important\s*$/i,''))
  if(!match)return undefined
  const size=match[2]==='pt'?Math.round(Number(match[1])*4/3):Number(match[1]);return Number.isFinite(size)&&size>0?size:undefined
 }
 return node.style.fontSize
}
function nodeRole(node:ArtifactNode):TypographyRole{
 if(node.typographyRole)return node.typographyRole
 const first=node.richText?.content?.[0]
 if(first?.type==='heading')return `Heading ${first.attrs?.level??1}` as TypographyRole
 if(first?.type==='blockquote')return 'Quote'
 if(node.attributes?.role==='button')return 'Button'
 if(node.attributes?.href)return 'Link'
 return 'Body'
}
export function pageTypographyUsage(page:ArtifactPage):TypographyUsage[]{
 const sizes=new Map<number,TypographyUsage>()
 for(const id of page.nodeOrder){
  const node=page.nodes[id];if(!node)continue
  const size=authoredTypographySize(node);if(size===undefined)continue
  const entry=sizes.get(size)??{size,roles:{},families:{}}
  const role=nodeRole(node);entry.roles[role]=(entry.roles[role]??0)+1
  const raw=node.css?.['font-family']??node.style.fontFamily??'',match=/^(?:"([^"]*)"|'([^']*)'|([^"',]*?))\s*(?:,|$)/.exec(raw.trim()),family=(match?.[1]??match?.[2]??match?.[3]??'').trim()
  if(family&&!family.startsWith('var('))entry.families[family]=(entry.families[family]??0)+1
  sizes.set(size,entry)
 }
 return [...sizes.values()].sort((a,b)=>b.size-a.size)
}
export function artifactTypographyCensus(document:ArtifactDocument):TypographyCensus{
 return Object.fromEntries(document.pageOrder.map(id=>[id,pageTypographyUsage(document.pages[id])]))
}
export function documentTypographyUsage(document:ArtifactDocument,census:TypographyCensus|undefined,loadedIds:readonly string[]):TypographyUsage[]{
 const loaded=new Set(loadedIds)
 return document.pageOrder.flatMap(id=>loaded.has(id)||!census?.[id]?pageTypographyUsage(document.pages[id]):census[id])
}
/** Mirrors the pinned source's role precedence and fallback around the body size. */
export function summarizeTypographyUsage(input:TypographyUsage[]):Array<{size:number;name:string;family?:string}>{
 const usage=new Map<number,TypographyUsage>(),families=new Map<number,string>()
 for(const item of input){if(!families.has(item.size)){const family=Object.entries(item.families).sort(([,a],[,b])=>b-a)[0]?.[0];if(family)families.set(item.size,family)}const merged=usage.get(item.size)??{size:item.size,roles:{},families:{}};for(const role of typographyRoleOrder)if(item.roles[role])merged.roles[role]=(merged.roles[role]??0)+item.roles[role]!;for(const [family,count]of Object.entries(item.families))merged.families[family]=(merged.families[family]??0)+count;usage.set(item.size,merged)}
 const sizes=[...usage.keys()].sort((a,b)=>b-a),count=(size:number)=>Object.values(usage.get(size)!.roles).reduce((sum,value)=>sum+(value??0),0),candidates=new Map<number,string[]>()
 for(const size of sizes)candidates.set(size,Object.entries(usage.get(size)!.roles).sort(([a,ac],[b,bc])=>(bc??0)-(ac??0)||typographyRoleOrder.indexOf(a as TypographyRole)-typographyRoleOrder.indexOf(b as TypographyRole)).map(([role])=>role))
 const body=sizes.filter(size=>candidates.get(size)![0]==='Body').sort((a,b)=>count(b)-count(a)||a-b)[0]??[...sizes].sort((a,b)=>a-b)[Math.floor(sizes.length/2)]??16
 for(const size of sizes)candidates.get(size)!.push(size>body?'Heading':size===body?'Body':'Caption')
 const names=new Map<number,string>(),headings:number[]=[],remaining=new Set(sizes)
 for(const size of sizes)if(heading(candidates.get(size)![0])){headings.push(size);remaining.delete(size)}
 for(const role of typographyRoleOrder.filter(role=>!heading(role))){const size=[...remaining].filter(size=>candidates.get(size)!.includes(role)).sort((a,b)=>candidates.get(a)!.indexOf(role)-candidates.get(b)!.indexOf(role)||count(b)-count(a)||b-a)[0];if(size!==undefined){names.set(size,roleNames[role]);remaining.delete(size)}}
 for(const size of remaining)if(size>body)headings.push(size)
 headings.sort((a,b)=>b-a).forEach((size,index)=>names.set(size,`标题 ${index+1}`))
 return sizes.map(size=>({size,name:names.get(size)??'',family:families.get(size)}))
}
