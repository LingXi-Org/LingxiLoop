import assert from 'node:assert/strict'
import test from 'node:test'
import {publicEvidence} from './native-artifact-ci.mjs'
import {diagnosticBreakdown} from './native-artifact-diagnostic-breakdown.mjs'

test('诊断分解保留实际数值与有限分布，不输出请求标识或私有字符串',()=>{
 const roles={renderer:{bytes:100,processes:2},gpu:{bytes:50,processes:1}}
 const sample={inputSamplesMs:[12,23,Infinity,'private'],run:1,arm:'candidate',kind:'slides',mode:'workbenchOpen',hostOnlyPss:{bytes:150,observations:[{processRoles:roles},{processRoles:{renderer:{bytes:300,processes:4},gpu:{bytes:50,processes:1}}}]},firstEditablePss:{bytes:500,processRoles:roles},afterTraversalPss:{bytes:700,spreadBytes:12,observations:[{processRoles:roles}]},firstDocumentState:[{mountedPages:1,src:'private'}],afterTraversalDocumentState:Array.from({length:20},()=>({mountedPages:1,htmlImages:2,rootJsHeapBytes:1000,src:'private'})),requestsAtEditable:Array.from({length:40},(_,i)=>({url:`https://private.invalid/assets/${i}.js?token=private`,type:'Script',targetType:'page',decodedBytes:1000+i,transferredBytes:500+i,headers:'private'}))}
 const report=diagnosticBreakdown({measurement:publicEvidence({samples:[sample]})});const result=report.samples[0]
 assert.deepEqual(result.inputSamplesMs,[12,23]);assert.equal(report.sampleCount,1);assert.equal(result.memory.host.roleMeans.renderer.bytes,200);assert.equal(result.memory.host.roleMeans.renderer.processes,3)
 assert.equal(result.memory.afterTraversal.spreadBytes,12);assert.equal(result.documents.afterTraversal.frameCount,20);assert.equal(result.documents.afterTraversal.frames.length,12)
 assert.equal(result.scriptsAtEditable.requestCount,40);assert.equal(result.scriptsAtEditable.largestBuckets.length,24);assert.equal(result.scriptsAtEditable.omittedBuckets,16)
 assert.equal(result.scriptsAtEditable.largestBuckets[0].decodedBytes,1039)
 assert.doesNotMatch(JSON.stringify(report),/private|token|resourceHash|url|headers|src/)
})
test('缺失观测不伪造成已测量数值，诊断记录数量有界且不改变资格',()=>{
 const report=diagnosticBreakdown({qualified:false,measurement:{samples:Array.from({length:10},()=>({run:1,arm:'baseline',kind:'design',mode:'fullNavigation'}))}})
 assert.equal(report.sampleCount,10);assert.equal(report.samples.length,8);assert.equal(report.omittedSamples,2)
 assert.equal(report.samples[0].memory.host,null);assert.equal(report.samples[0].documents.afterTraversal,null)
 assert.equal(report.samples[0].scriptsAtEditable,null);assert.equal(report.qualified,undefined)
})
