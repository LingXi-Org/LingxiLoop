import assert from 'node:assert/strict'
import test from 'node:test'
import { publicTextDeployment, publicTextModelOptions } from '../agent-runtime/public-text-deployment.js'

test('deployment metadata is a pure immutable enabled producer configuration source',()=>{
  assert.deepEqual(publicTextDeployment,{reader:2,producer:'purpose-json-v1'})
  assert.equal(Object.isFrozen(publicTextDeployment),true)
  assert.deepEqual(publicTextModelOptions(),{publicTextProtocol:'purpose-json-v1'})
  assert.equal(Object.hasOwn(publicTextModelOptions(),'publicTextProtocol'),true)
})

// The public leaf must reach the real Worker configuration, not just metadata.
test('normal Worker model configuration consumes the same producer leaf without changing budgets',async()=>{
  const { runtimeModelConfiguration }=await import('../agent-runtime/runtime.js')
  const config=runtimeModelConfiguration({id:'synthetic-fixture',apiKey:'synthetic-key',baseUrl:'http://127.0.0.1:1/v1'},90000)
  assert.equal(config.publicTextProtocol,'purpose-json-v1')
  assert.deepEqual(config.recovery,{maxAttempts:3,totalTimeoutMs:120000})
  assert.equal(config.requestTimeoutMs,90000)
  assert.equal(config.firstByteTimeoutMs,30000)
  assert.equal(config.streamIdleTimeoutMs,30000)
  assert.equal(config.maxThinkingTokens,0)
  assert.deepEqual(config.capabilities,{parallelTools:false})
})
