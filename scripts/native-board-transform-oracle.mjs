// 固定参考的纯几何函数只在独立取证环境执行，不进入产品包。
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {moveBoardRects,resizeBoardRect,resizeBoardSelection} from '../shared/artifact-board-transform.ts'
const [path,output='/tmp/lingxi-board-oracle.json']=process.argv.slice(2)
const bytes=await readFile(path),sha256=createHash('sha256').update(bytes).digest('hex')
assert.equal(sha256,'2680772536cc2009f905e18926b1215008c3e5cd8dc2976d8fe93a8bed6eac08')
const source=bytes.toString('utf8'),reference={},modules=[['Sz',3147037,3148757],['wz',3148757,3150798],['eU',5073877,5076690],['U9',5015588,5019712]].map(([name,start,end])=>({name,start,end,sha256:createHash('sha256').update(source.slice(start,end)).digest('hex')}))
// U9仅借助验证模块的初始化入口装配纯变换函数，不运行编辑器或SDK。
reference.initializeEditorAttributeValidation=()=>{}
reference.PlatformFileContentConstant_16=120;reference.PlatformFileContentLimit_6=8000
for(const module of modules)runInNewContext(source.slice(module.start,module.end)+`;${module.name}(e)${module.name==='U9'?'()':''}`,{e:reference,t:(object,name,get)=>Object.defineProperty(object,name,{get})},{timeout:1000})
const rect=value=>({x:value.x,y:value.y,w:value.width,h:value.height}),native=value=>({x:value.x,y:value.y,width:value.w,height:value.h})
let seed=707,assertions=0
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
for(let i=0;i<300;i++){
  const page={x:random()*1000-500,y:random()*1000-500,width:120+random()*4000,height:120+random()*4000},others=Array.from({length:3},()=>({x:random()*3000-1500,y:random()*3000-1500,width:120+random()*4000,height:120+random()*4000})),dx=random()*1200-600,dy=random()*1200-600,scale=[.1,420/1900,.5,1][i%4],lines=reference.rectangleSnapGuides(others.map(rect))
  for(const handle of ['n','e','s','w','nw','ne','se','sw'])for(const ratio of [false,true]){
    const sides={x:handle.includes('w')?'left':handle.includes('e')?'right':null,y:handle.includes('n')?'top':handle.includes('s')?'bottom':null},snapped=reference.snapResize(rect(page),sides,dx,dy,lines,8/scale),corner=handle.length===2,method=ratio&&corner?'resizeRectKeepingAspect':'resizeRect'
    let expected=reference[method](rect(page),sides,Math.round(snapped.dx),Math.round(snapped.dy),{w:120,h:120},{w:8000,h:8000})
    if(ratio&&corner)expected=Object.fromEntries(Object.entries(expected).map(([key,value])=>[key,Math.round(value)]))
    const actual=resizeBoardRect(page,handle,dx,dy,others,scale,ratio)
    assert.deepEqual(actual.rect,native(expected),`缩放样本${i}/${handle}/${ratio}`)
    assert.deepEqual(actual.guides,JSON.parse(JSON.stringify(reference.activeResizeGuides(expected,sides,snapped.guides).map(value=>({axis:value.axis,at:value.pos})))));assertions+=2
  }
  // 此处隔离边/中心吸附；完整编辑器的等距分布辅助线另列未完成项。
  const snapped=reference.snapCanvasDrag(dx,dy,{box:rect(page),lines},8/scale,false),rounded={x:Math.round(page.x+snapped.dx),y:Math.round(page.y+snapped.dy)},position=reference.preserveUnroundedDragPosition(page,rounded)
  assert.deepEqual(moveBoardRects([page],dx,dy,others,scale).rects[0],{...page,...JSON.parse(JSON.stringify(position))},`移动样本${i}`);assertions++
}
const individualAssertions=assertions
for(let i=0;i<120;i++){
  const pages=Array.from({length:2+i%3},(_,index)=>({x:random()*4000-2000,y:random()*4000-2000,width:30+random()*10000,height:30+random()*10000,...(index===0&&i%7===0?{frameless:true}:{})})),old=pages.map(page=>({...rect(page),...(page.frameless?{frameless:true}:{})})),before=reference.unionRects(old),limits=reference.selectionScaleLimits(before,old,[]),others=[{x:4160,y:0,width:1920,height:1080}],lines=reference.rectangleSnapGuides(others.map(rect)),dx=random()*2400-1200,dy=random()*2400-1200,scale=[.1,420/1900,.5,1][i%4]
  for(const handle of ['n','e','s','w','nw','ne','se','sw'])for(const ratio of [false,true]){
    const sides={x:handle.includes('w')?'left':handle.includes('e')?'right':null,y:handle.includes('n')?'top':handle.includes('s')?'bottom':null},axes={x:sides.x!==null,y:sides.y!==null},snapped=reference.snapResize(before,sides,dx,dy,lines,8/scale),method=ratio&&handle.length===2?'resizeRectKeepingAspect':'resizeRect',expected=reference[method](before,sides,snapped.dx,snapped.dy,limits.min,limits.max),actual=resizeBoardSelection(pages,handle,dx,dy,others,scale,ratio)
    for(const [key,value]of Object.entries(native(expected)))assert.ok(Math.abs(actual.rect[key]-value)<1e-8,`组外框${i}/${handle}/${ratio}/${key}`)
    const members=old.map(page=>native({...page,...reference.transformArtboardBounds(page,before,expected,axes)}))
    assert.deepEqual(actual.rects,members,`组成员${i}/${handle}/${ratio}`)
    assert.deepEqual(actual.guides,JSON.parse(JSON.stringify(reference.activeResizeGuides(expected,sides,snapped.guides).map(value=>({axis:value.axis,at:value.pos})))));assertions+=6
  }
}
const result={sourceCommit:'016b39d7fdcc30bfacee31ea5541498ac53921c6',sourceSha256:sha256,offsetUnit:'UTF-16 code units',modules,comparedAssertions:assertions,individualAssertions,groupAssertions:assertions-individualAssertions,allEqual:true,scope:'单画板/多选组的八向几何、角等比、小数与旧越界值保留、无边框页、边/中心吸附及有效辅助线；未覆盖等距分布、触摸与完整编辑器视觉。',qualified:false}
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result))
