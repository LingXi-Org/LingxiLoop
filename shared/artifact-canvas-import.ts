import {canvasPages, canvasPageOf} from './artifact-canvas-pages.js'
import {createNode, createPage, type ArtifactDocument, type ArtifactNode} from './artifact-document.js'

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
const coordinate=(value:unknown,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?Math.max(-1_000_000,Math.min(1_000_000,value)):fallback
const dimension=(value:unknown,fallback:number)=>Math.max(1,coordinate(value,fallback))
const identity=(value:string)=>(['__proto__','constructor','prototype'].includes(value)?`canvas_${value}`:value.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,110))||'canvas_object'

/** Initial visibility hint; the browser measures natural note layout without rewriting the model. */
export function canvasNoteHeight(text:string,width:number,size:number) {
  const available=Math.max(size,width-24)
  const advance=(value:string,at=0)=>{
    if(value==='\t'){const stop=size*.4*8;return stop-at%stop}
    if(/\p{Mark}/u.test(value))return 0
    if(/\s/u.test(value))return size*.4
    if(/[ilI]/.test(value))return size*.35
    if(/[.,'!:;|]/.test(value))return size*.45
    if(/[MW@#%&]/.test(value))return size
    if(/[A-Z]/.test(value))return size*.85
    if(/^[\x00-\x7f]$/.test(value))return size*.65
    return size
  }
  let lines=0
  for(const paragraph of text.split(/\r?\n/)){
    let used=0;lines++
    for(const token of paragraph.match(/\s+|\S+/gu)??[]){
      const points=Array.from(token),lengthAt=(at:number)=>points.reduce((sum,point)=>sum+advance(point,at+sum),0)
      const length=lengthAt(used)
      if(length<=available){if(used&&used+length>available){lines++;used=0}used+=lengthAt(used)}
      else for(const point of points){let length=advance(point,used);if(used&&used+length>available+.001){lines++;used=0;length=advance(point,0)}used+=length}
    }
  }
  return Math.min(1_000_000,Math.max(40,Math.ceil(lines*size*1.45+20)))
}

/** Source canvas.json notes are independent world objects, never board speaker notes. */
export function importCanvasAnnotations(document:ArtifactDocument,input:unknown,warnings:string[]) {
  if(document.kind!=='design')return
  for(const [sourceId,value] of Object.entries(record(input))){
    if(!value||typeof value!=='object'||Array.isArray(value))continue
    const source=record(value),kind=typeof source.kind==='string'?source.kind:'note'
    let node:ArtifactNode
    const text=typeof source.text==='string'?source.text:''
    if(['note','title1','text'].includes(kind)){
      const sizes:Record<string,number>={s:14,m:24,l:40,xl:72,xxl:120},sourceSize=typeof source.size==='string'?sizes[source.size]:source.size,large=kind==='title1'||kind==='text'&&coordinate(sourceSize,14)>=40
      const size=Math.max(8,Math.min(400,typeof source.size==='string'?sizes[source.size]??(large?72:14):coordinate(source.size,large?72:14)))
      const width=dimension(source.w,large?640:240)
      node={...createNode(large?'text':'note',identity(sourceId)),text,width,height:large?Math.max(size*1.1,text.split('\n').length*size*1.1):canvasNoteHeight(text,width,size),style:{fontFamily:'system-ui',fontSize:size,lineHeight:large?1.1:1.45,fontWeight:source.bold===true||large&&source.bold!==false?700:400,fontStyle:source.italic===true?'italic':'normal',color:large?'#141413':'#4a4220',...(large?{}:{fill:'#fef3a2',padding:10,borderRadius:2})}}
    }else if(kind==='rect'||kind==='oval'){
      node={...createNode('shape',identity(sourceId)),shape:kind==='oval'?'ellipse':'rect',width:dimension(source.w,kind==='oval'?96:120),height:dimension(source.h,kind==='oval'?96:120),style:{fill:'#b6b0a7',borderRadius:kind==='rect'?8:0}}
    }else{
      warnings.push(`画布对象“${sourceId}”的类型尚未转换，原始文件已保留。`);continue
    }
    if(source.color&&source.color!=='default'||source.fill&&source.fill!=='default'||source.css||source.maxW||source.maxH)warnings.push(`画布对象“${sourceId}”的部分外观或裁切设置尚未转换，原始文件已保留。`)
    node.x=coordinate(source.x);node.y=coordinate(source.y);node.rotation=coordinate(source.rotate)
    if(source.flipX===true)node.flipX=true
    if(source.flipY===true)node.flipY=true
    const sheets=canvasPages(document),sheet=sheets.find(sheet=>sheet.id===identity(String(source.page??'')))??sheets[0]!
    let body=sheet.contentId?document.pages[sheet.contentId]:undefined
    if(!body){let bodyId=`canvas_content_${sheet.id}`.slice(0,115);for(let i=1;document.pages[bodyId];i++)bodyId=`canvas_content_${sheet.id}`.slice(0,110)+`_${i}`
      body={...createPage(bodyId,'画布内容'),x:0,y:0,width:0,height:0,background:'transparent',canvasPageId:sheet.id};delete body.themeBackground
      document.canvasPages=sheets.map(value=>value.id===sheet.id?{...value,contentId:bodyId}:value)
      document.pages[bodyId]=body
    }
    if(canvasPageOf(body)!==sheet.id)throw new Error('画布内容归属无效。')
    const preferred=node.id
    for(let i=1;body.nodes[node.id];i++)node.id=`${preferred}_${i}`
    body.nodes[node.id]=node;body.nodeOrder.push(node.id)
  }
}
