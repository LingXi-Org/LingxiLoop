import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {canvasVectorGeometry,constrainVectorAngle,appendVectorPoint,canCloseVectorDraft,vectorDraftPath,type VectorDraftPoint} from './artifact-vector.js'
import {isArtifactPenPath} from './artifact-path.js'

const source=JSON.parse(readFileSync(new URL('../docs/evidence/issue-707/source-design-vector.json',import.meta.url),'utf8')) as {cases:Array<{name:string;anchors:VectorDraftPoint[];closed?:boolean;result:unknown;preview:string}>}
for(const sample of source.cases)test(`vector creation matches fixed source: ${sample.name}`,()=>{
  const before=JSON.stringify(sample.anchors),geometry=canvasVectorGeometry(sample.anchors,!!sample.closed)
  assert.deepEqual(geometry,sample.result);assert.equal(JSON.stringify(sample.anchors),before)
  assert.equal(vectorDraftPath(sample.anchors,!!sample.closed),sample.preview)
  if(geometry)assert.ok(isArtifactPenPath(geometry.d))
})
test('vector anchors retain screen hit distance and the source close condition',()=>{
  const first=[{x:0,y:0}]
  assert.equal(appendVectorPoint(first,{x:7,y:0},.5),first)
  assert.deepEqual(appendVectorPoint(first,{x:8,y:0},.5),[...first,{x:8,y:0}])
  assert.equal(canCloseVectorDraft([{x:0,y:0},{x:10,y:10}]),false)
  assert.equal(canCloseVectorDraft([{x:0,y:0,out:{x:1,y:0}},{x:10,y:10}]),true)
  assert.equal(canCloseVectorDraft([{x:0,y:0},{x:10,y:10},{x:20,y:0}]),true)
  const angle=constrainVectorAngle({x:10,y:20},{x:60,y:60})
  assert.ok(Math.abs(angle.x-10-(angle.y-20))<1e-10)
  assert.ok(Math.abs(Math.hypot(angle.x-10,angle.y-20)-Math.hypot(50,40))<1e-10)
})
test('curve samples extend normalization bounds beyond endpoint anchors',()=>{
  const anchors=[{x:-77.04799761995673,y:-200.2043720567599},{x:-22.578740841709077,y:239.43444062024355,out:{x:15.973009984008968,y:210.5116053717211}},{x:-164.308060426265,y:243.7529576709494,out:{x:-212.27536152582616,y:89.92419706191868}}]
  assert.deepEqual(canvasVectorGeometry(anchors),{x:-164.3,y:-200.2,w:148.676,h:505.398,d:'M87.26 0 C87.26 0 103.178 468.562 141.729 439.639 C144.583 437.498 146.5 436.541 147.585 436.541 C148.323 436.541 148.676 436.984 148.676 437.799 C148.676 447.144 102.303 505.398 58.669 505.398 C36.124 505.398 14.309 489.845 0 443.957'})
})
