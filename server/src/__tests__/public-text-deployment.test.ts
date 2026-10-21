import assert from 'node:assert/strict'
import test from 'node:test'
import { publicTextDeployment, publicTextModelOptions } from '../agent-runtime/public-text-deployment.js'

test('deployment metadata is a pure immutable reader-only configuration source',()=>{
  assert.deepEqual(publicTextDeployment,{reader:2,producer:'disabled'})
  assert.equal(Object.isFrozen(publicTextDeployment),true)
  assert.deepEqual(publicTextModelOptions(),{})
  assert.equal(Object.hasOwn(publicTextModelOptions(),'publicTextProtocol'),false)
})
