import assert from 'node:assert/strict'
import { test } from 'node:test'
import { knowledgeSearchStatus } from './knowledgeSearch'

test('course search state comes only from actual search receipts, not embeddings or source reads',()=>{
  assert.equal(knowledgeSearchStatus([]),'not_run')
  assert.equal(knowledgeSearchStatus([{toolName:'embedding',result:{status:'completed'}},{toolName:'knowledge.read_source',result:{status:'completed'}}]),'not_run')
  assert.equal(knowledgeSearchStatus([{toolName:'knowledge__search'}]),'running')
  assert.equal(knowledgeSearchStatus([{toolName:'knowledge.search'}],true),'failed')
  assert.equal(knowledgeSearchStatus([{toolName:'knowledge.search',isError:true}]),'failed')
  for(const status of ['matched','no_matches','no_sources','processing','not_applicable'] as const)
    assert.equal(knowledgeSearchStatus([{toolName:'knowledge.search',result:{status:'completed',sourceStatus:status}}]),status)
  for(const result of [{status:'failed'},{status:'cancelled'},{status:'completed',sourceStatus:'unavailable'}])
    assert.equal(knowledgeSearchStatus([{toolName:'knowledge.search',result}]),'failed')
  assert.equal(knowledgeSearchStatus([{toolName:'knowledge.search',result:{status:'completed'}}]),'unknown')
  assert.equal(knowledgeSearchStatus([{toolName:'knowledge.search',result:{status:'completed',sourceStatus:'matched'}},{toolName:'knowledge.search',result:{status:'failed'}}]),'failed')
})
