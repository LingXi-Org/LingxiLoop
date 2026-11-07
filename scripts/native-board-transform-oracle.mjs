// 固定参考的纯几何函数只在独立取证环境执行，不进入产品包。
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {moveBoardRects,resizeBoardRect} from '../shared/artifact-board-transform.ts'
const [path,output='/tmp/lingxi-board-oracle.json']=process.argv.slice(2)
const bytes=await readFile(path),sha256=createHash('sha256').update(bytes).digest('hex')
assert.equal(sha256,'2680772536cc2009f905e18926b1215008c3e5cd8dc2976d8fe93a8bed6eac08')
const source=bytes.toString('utf8'),reference={},modules=[['Sz',3147037,3148757],['wz',3148757,3150798],['eU',5073877,5076690]].map(([name,start,end])=>({name,start,end,sha256:createHash('sha256').update(source.slice(start,end)).digest('hex')}))
for(const module of modules)runInNewContext(source.slice(module.start,module.end)+`;${module.name}(e)`,{e:reference,t:(object,name,get)=>Object.defineProperty(object,name,{get})},{timeout:1000})
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
const result={sourceCommit:'016b39d7fdcc30bfacee31ea5541498ac53921c6',sourceSha256:sha256,offsetUnit:'UTF-16 code units',modules,comparedAssertions:assertions,allEqual:true,scope:'纯八向几何、角等比、分数坐标保留、边/中心类型吸附及有效缩放辅助线；未覆盖等距分布、触摸与完整编辑器视觉。',qualified:false}
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result))
