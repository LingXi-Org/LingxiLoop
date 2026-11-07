import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {fitDesignCamera} from './canvas-fit'
const source=JSON.parse(readFileSync(new URL('../../../../docs/evidence/issue-707/source-design-fit-camera.json',import.meta.url),'utf8'))
for(const sample of source.cases)test(`画布适配固定源码：${sample.name}，${sample.width}×${sample.height}`,()=>{
  assert.deepEqual(fitDesignCamera(sample.boards,sample.annotations,sample.width,sample.height),sample.result)
})
test('空画布不产生无效相机',()=>assert.equal(fitDesignCamera([],[],1440,1000),undefined))
