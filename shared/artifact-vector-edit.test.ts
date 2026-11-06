import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {parseEditableVector,normalizeEditableVector,moveVectorPart,toggleVectorSmooth,pullVectorHandles,deleteVectorPoint,nearestVectorSegment,splitVectorSegment,breakVectorTangent} from './artifact-vector-edit.js'

const source=JSON.parse(readFileSync(new URL('../docs/evidence/issue-707/source-design-vector-edit.json',import.meta.url),'utf8'))
const rounded=(value:unknown):unknown=>typeof value==='number'?Math.round(value*1e6)/1e6:Array.isArray(value)?value.map(rounded):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rounded(item)])):value
for(const sample of source.cases)test(`控制点数学对照固定源码：${sample.name}`,()=>{
  const path=parseEditableVector(sample.d,sample.transform,sample.tolerance)
  assert.ok(path);assert.deepEqual(rounded(path),rounded(sample.parsed))
  const before=JSON.stringify(path)
  for(const step of sample.steps){
    const args=step.args
    const result=step.action==='原路径'?path:step.action==='移动锚点'||step.action==='移动切线'?moveVectorPart(path,args.sel,args.to):step.action==='切换平滑点'?toggleVectorSmooth(path,args.sel):step.action==='拉出对称切线'?pullVectorHandles(path,args.sel,args.to):step.action==='删除锚点保持曲线'?deleteVectorPoint(path,args.sel):step.action==='最近线段'?nearestVectorSegment(path,args.point,args.radius):step.action==='插入控制点'?splitVectorSegment(path,args.nearest)?.path:step.action==='断开切线'?breakVectorTangent(path,args.sel):undefined
    assert.deepEqual(rounded(result),rounded(step.result),step.action)
    if(step.normalized!==undefined&&step.action!=='最近线段')assert.deepEqual(result?normalizeEditableVector(result):null,step.normalized,step.action+'的持久化几何')
    assert.equal(JSON.stringify(path),before,'点编辑不能改写原始文档或历史对象')
  }
})
