import assert from 'node:assert/strict'
import test from 'node:test'
import { answerSegment, answerTextOffset } from './answerSegment'

// Failure model: issue-366/PRODUCT-FAILURE-MODEL.md. Ranges come from the native
// canonical source projection, not from content matching or browser inference.
const part = (text: string, start: number, id: string) => ({ type: 'text',text,providerMetadata: { lingxiloop: {
  activity: { version: 1,id,kind: 'answer',label: '答复' },
  answerSegment: { version: 3,messageId: 'answer:run:v1',segmentId: id,partId: id,start,end: start + text.length },
} } })
test('native source offsets count UTF-16 and contain no invented separator', () => {
  const a = part('中文😀 ',0,'a'), b = part('[依据](#cite-S1)',a.text.length,'b')
  assert.equal(answerTextOffset([a,b],1),5)
  assert.equal(answerSegment(b)?.start,5)
  assert.equal(answerTextOffset([{type:'text',text:'legacy'}, {type:'text',text:'next'}],1),7)
})
test('malformed scope/ranges are not accepted as canonical source metadata', () => {
  const valid = part('text',0,'a')
  for (const update of [{version:2},{end:999},{start:-1},{messageId:''},{partId:''}]) {
    const value = structuredClone(valid)
    Object.assign(value.providerMetadata.lingxiloop.answerSegment,update)
    assert.equal(answerSegment(value),undefined)
  }
})
