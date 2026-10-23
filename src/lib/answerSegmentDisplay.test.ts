import assert from 'node:assert/strict'
import test from 'node:test'
import { answerDisplaySlice } from './answerSegmentDisplay'
import { projectGenUiReferences } from '../features/chat/visualize/zcode/gen-ui/domain/references'

// Failure model: canonical citation/directive tokens can cross a native source
// boundary. Per-part parsing must not break a delivered reference or duplicate it.
const parts = (texts: string[]) => {
  let offset = 0
  return texts.map((text,index) => {
    const start = offset; offset += text.length
    return {type:'text',text,providerMetadata:{lingxiloop:{answerSegment:{version:3,messageId:'answer:run:v1',segmentId:String(index),partId:String(index),start,end:offset}}}}
  })
}
test('a citation crossing sources is rendered once at its true UTF-16 position', () => {
  const texts = ['中文😀 [依','据](#cite-S1)\n结束。'], content=parts(texts), body=texts.join('')
  const start=body.indexOf('['),end=body.indexOf(')')+1
  assert.deepEqual(answerDisplaySlice(content,0,[{start,end}]),{text:body.slice(0,end),offset:0})
  assert.deepEqual(answerDisplaySlice(content,1,[{start,end}]),{text:body.slice(end),offset:end})
})
test('a cross-source visualize reference is kept complete exactly once without changing copied source text', () => {
  const body='解释。\n::visualize{path="visualize/example.html" title="Example"}',cut=body.indexOf('example'),content=parts([body.slice(0,cut),body.slice(cut)])
  assert.deepEqual(answerDisplaySlice(content,0,[]),{text:body,offset:0})
  assert.deepEqual(answerDisplaySlice(content,1,[]),{text:'',offset:body.length})
  assert.equal(content.map(part=>part.text).join(''),body)
})
test('normal segments remain independent and missing ranges never synthesize a complete source set', () => {
  const content=parts(['First.','\n\nSecond.'])
  assert.deepEqual(answerDisplaySlice(content,0,[]),{text:'First.',offset:0})
  assert.deepEqual(answerDisplaySlice(content,1,[]),{text:'\n\nSecond.',offset:6})
  assert.equal(answerDisplaySlice([content[1]],0,[]),undefined)
})
test('literal visualize examples in Markdown code never acquire a cross-source renderer', () => {
  const body='```text\n::visualize{path="visualize/example.html" title="Example"}\n```',cut=body.indexOf('example'),content=parts([body.slice(0,cut),body.slice(cut)])
  const display=answerDisplaySlice(content,0,[])!
  assert.deepEqual(display,{text:body,offset:0})
  assert.deepEqual(answerDisplaySlice(content,1,[]),{text:'',offset:body.length})
  assert.equal(projectGenUiReferences(display.text,true).some(part=>part.kind==='ui'),false)
})
