import assert from 'node:assert/strict'
import test from 'node:test'
import {designPageLink,readDesignLink,copyDesignLinkParameters} from './artifact-links'

test('private design page links contain only the owning workspace, conversation and stable identities',()=>{
  const current=new URL('https://example.test/?project=course&view=conversations&conversation=room&token=do-not-copy#secret')
  const link=new URL(designPageLink(current,'artifact-1','canvas-page-2'))
  assert.equal(link.href,'https://example.test/?project=course&view=conversations&conversation=room&design=artifact-1&canvasPage=canvas-page-2')
  assert.deepEqual(readDesignLink(link.searchParams),{artifactId:'artifact-1',canvasPageId:'canvas-page-2'})
  assert.throws(()=>designPageLink(new URL('https://example.test/?view=slides'),'artifact-1','page'),/会话/)
})

test('authentication/restoration preserve the design destination only for its same conversation and workspace',()=>{
  const original=new URLSearchParams('project=course&view=conversations&conversation=room&design=artifact-1&canvasPage=canvas-page-2')
  const same=new URLSearchParams('project=course&view=conversations&conversation=room')
  copyDesignLinkParameters(original,same)
  assert.equal(same.get('canvasPage'),'canvas-page-2')
  for(const changed of ['project=other&view=conversations&conversation=room','project=course&view=slides','project=course&view=conversations&conversation=other']){
    const target=new URLSearchParams(changed);copyDesignLinkParameters(original,target);assert.equal(target.has('design'),false);assert.equal(target.has('canvasPage'),false)
  }
  for(const suffix of ['design=../../private&canvasPage=page','design=artifact&canvasPage='+ 'a'.repeat(129),'canvasPage=page'])assert.equal(readDesignLink(new URLSearchParams(suffix)),null)
})
