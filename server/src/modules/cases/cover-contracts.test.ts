import assert from 'node:assert/strict'
import { test } from 'node:test'
import { caseCoverFingerprint,caseCoverSnapshot } from './cover-contracts.js'
import type { CaseContent } from './contracts.js'
const content:CaseContent={title:'网络设备',summary:'连接网络',body:'路由器连接不同网络。',cover:null,category:'计算机',tags:['网络','硬件']}
test('cover identity excludes manual fallback and native editor block identities, and canonicalizes tags',()=>{
  const first=caseCoverFingerprint(caseCoverSnapshot(content))
  assert.equal(caseCoverFingerprint(caseCoverSnapshot({...content,cover:'/api/files?key=manual',tags:['硬件','网络','网络'],
    editorDocument:{format:'blocknote',version:1,projection:content.body,sections:[content.body],blocks:[{id:'new-editor-id',type:'paragraph'}]}})),first)
  for(const changed of [{title:'抽屉柜'},{body:'使用抽屉整理资料。'},{summary:'知识整理'},{category:'信息管理'},{tags:['资料']}]) {
    assert.notEqual(caseCoverFingerprint(caseCoverSnapshot({...content,...changed})),first)
  }
})
