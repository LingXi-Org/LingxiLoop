import assert from 'node:assert/strict'
import test from 'node:test'
import { retainedAppendText } from '../__integration__/_retained-answer-measurement.js'

// Pending replacements are invisible until committed. Their deltas must never
// improve pre-save first-useful timing, including on a later append event.
test('retained replacement text does not contribute to early visible text',()=>{
  const sources=[{partId:'a'},{partId:'replace'}]
  const parts=new Map([['a',{text:'Gather collects items. ',operation:'append'}],
    ['replace',{text:'Check reviews those items.',operation:'replace'}]])
  assert.equal(retainedAppendText(sources,parts),'Gather collects items. ')
  parts.set('b',{text:'Next.',operation:'append'});sources.push({partId:'b'})
  assert.equal(retainedAppendText(sources,parts),'Gather collects items. Next.')
})
test('only new retained append sources contribute in final source order',()=>{
  const parts=new Map([['old',{text:'History is not a new answer.',operation:'append'}],
    ['b',{text:'\n\nCheck reviews items.',operation:'append'}],['a',{text:'Gather collects items.',operation:'append'}]])
  assert.equal(retainedAppendText([{partId:'a'},{partId:'b'}],parts),'Gather collects items.\n\nCheck reviews items.')
  assert.equal(retainedAppendText([{partId:'history-only'}],parts),'')
})
test('missing or unsupported operation never creates early visible text',()=>{
  assert.equal(retainedAppendText([{partId:'a'}],new Map([['a',{text:'must not qualify',operation:'unknown'}]])),'')
})
