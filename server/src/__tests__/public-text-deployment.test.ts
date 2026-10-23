import assert from 'node:assert/strict'
import test from 'node:test'
import { publicTextDeployment, publicTextModelOptions } from '../agent-runtime/public-text-deployment.js'

test('deployment metadata is a pure immutable enabled producer configuration source',()=>{
  assert.deepEqual(publicTextDeployment,{reader:3,producer:'purpose-json-v3'})
  assert.equal(Object.isFrozen(publicTextDeployment),true)
  assert.deepEqual(publicTextModelOptions(),{publicTextProtocol:'purpose-json-v3'})
  assert.equal(Object.hasOwn(publicTextModelOptions(),'publicTextProtocol'),true)
})

// The public leaf must reach the real Worker configuration, not just metadata.
test('normal Worker model configuration consumes the same producer leaf without changing budgets',async()=>{
  const { runtimeModelConfiguration }=await import('../agent-runtime/runtime.js')
  const config=runtimeModelConfiguration({id:'synthetic-fixture',apiKey:'synthetic-key',baseUrl:'http://127.0.0.1:1/v1'},90000)
  assert.equal(config.publicTextProtocol,'purpose-json-v3')
  assert.deepEqual(config.recovery,{maxAttempts:3,totalTimeoutMs:120000})
  assert.equal(config.requestTimeoutMs,90000)
  assert.equal(config.firstByteTimeoutMs,30000)
  assert.equal(config.streamIdleTimeoutMs,30000)
  assert.equal(config.maxThinkingTokens,0)
  assert.deepEqual(config.capabilities,{parallelTools:false})
})

// Failure model: docs/evidence/issue-366/NATIVE-BUSINESS-SCHEMA-FAILURE-MODEL.md.
test('SiliconFlow DeepSeek retains native business schemas and the bounded v3 public channel',async()=>{
  const { runtimeModelConfiguration }=await import('../agent-runtime/runtime.js')
  const configured=runtimeModelConfiguration({id:'deepseek-ai/DeepSeek-V4.1-Flash',apiKey:'synthetic-key',baseUrl:'https://api.siliconflow.cn/v1'},90000)
  assert.equal(Reflect.get(configured.capabilities,'jsonObjectWithTools'),false)
  assert.equal(Object.hasOwn(configured,'nativeToolPublicOutput'),false)
  assert.equal(configured.capabilities.parallelTools,false)
  assert.equal(configured.publicTextProtocol,'purpose-json-v3')
  assert.equal(configured.maxThinkingTokens,0)
  assert.deepEqual(configured.recovery,{maxAttempts:3,totalTimeoutMs:120000})
  assert.equal(configured.requestTimeoutMs,90000)
  assert.equal(configured.firstByteTimeoutMs,30000)
  assert.equal(configured.streamIdleTimeoutMs,30000)
  assert.equal(configured.auxiliaryStreaming,true)
  for(const [id,baseUrl] of [
    ['zai-org/GLM-5.3-Flash','https://api.siliconflow.cn/v1'],
    ['deepseek-ai/DeepSeek-V4.1-Flash','https://other-provider.example/v1'],
    ['synthetic-fixture','https://api.siliconflow.cn/v1'],
  ]){
    const other=runtimeModelConfiguration({id:id!,apiKey:'synthetic-key',baseUrl:baseUrl!},90000)
    assert.equal(Reflect.get(other.capabilities,'jsonObjectWithTools'),undefined)
    assert.equal(Object.hasOwn(other,'nativeToolPublicOutput'),false)
  }
})
