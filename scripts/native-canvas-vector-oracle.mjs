// Reference-only pure mathematics comparison. The editor never imports this file.
// node --import tsx scripts/native-canvas-vector-oracle.mjs /path/to/pinned/index-CYLuwRoc.js /tmp/vector-oracle.json
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {canvasVectorGeometry,vectorDraftPath} from '../shared/artifact-vector.ts'

const source=readFileSync(process.argv[2],'utf8')
const sourceSha256=createHash('sha256').update(source).digest('hex')
assert.equal(sourceSha256,'2680772536cc2009f905e18926b1215008c3e5cd8dc2976d8fe93a8bed6eac08','只接受固定版本参考源码')
const bind=(object,key,get,set)=>Object.defineProperty(object,key,{get,set,configurable:true}),api={}
for(const [start,end] of [[3152243,3156813],[3905254,3916706],[3928691,3939964]])Function('t','return ('+source.slice(start,end)+')')(bind)(api)()
const trim=Function('At','Fe','return ('+source.slice(2589511,source.indexOf(',Qe=',2589511))+')')(24000,8000)
let seed=707
const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296)
const cases=[]
for(let i=0;i<150;i++){
  const length=2+Math.floor(random()*100),span=i%13===0?20000:500,closed=i%3===0
  const anchors=Array.from({length},()=>{const point={x:(random()-.5)*span,y:(random()-.5)*span};if(random()>.5)point.out={x:point.x+(random()-.5)*span,y:point.y+(random()-.5)*span};return point})
  const path={contours:[api.draftToVectorContour(anchors,closed)]}
  let original=null
  for(const precision of api.vectorPathPrecisions){
    const raw=api.serializeVectorPathBounds(path,precision)
    if(raw&&trim(raw.d)!==null){if(raw.w<=8000&&raw.h<=8000)original={x:Math.round(raw.x*10)/10,y:Math.round(raw.y*10)/10,w:Math.max(2,raw.w),h:Math.max(2,raw.h),d:raw.d};break}
  }
  const native=canvasVectorGeometry(anchors,closed)
  try{assert.deepEqual(native,original);assert.equal(vectorDraftPath(anchors,closed),api.vectorPathSvgData(path))}catch(error){writeFileSync((process.argv[3]??'/tmp/lingxi-vector-oracle.json')+'.failure.json',JSON.stringify({i,anchors,closed,original,native},null,2));throw error}
  cases.push({i,length,closed,pathCharacters:native?.d.length??0,rejected:!native})
}
writeFileSync(process.argv[3]??'/tmp/lingxi-vector-oracle.json',JSON.stringify({fixedCommit:'016b39d7fdcc30bfacee31ea5541498ac53921c6',sourceSha256,seed:707,cases,passed:true}))
console.log(JSON.stringify({cases:cases.length,passed:true,scope:'纯数学固定源码对照；不代替完整控制点编辑、浏览器性能或视觉验收'}))
