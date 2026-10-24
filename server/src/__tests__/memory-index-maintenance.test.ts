import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const source = new URL('../', import.meta.url)
const cli = new URL(process.env.NATIVE_INDEX_TEST_CLI || 'bin/memory-maintenance.ts',source)
const privateValue = 'PRIVATE_MEMORY_INDEX_SENTINEL'

function run(mode: string, scenario = 'partial', planHash?: string, limit?: string) {
  const script = `
    import {mock} from 'node:test';
    const options={id:'Pro/BAAI/bge-m3',apiKey:'synthetic-key',baseUrl:'https://provider.test/v1',expectedDimensions:1024};
    const key='a'.repeat(64);
    const events=[],scenario=${JSON.stringify(scenario)},privateValue=${JSON.stringify(privateValue)};
    const identity={tenantId:privateValue+'-company',principalId:privateValue+'-principal',agentId:'synthetic-agent',sessionId:'synthetic-session',runId:privateValue+'-run'};
    const scopes=[{tenantId:identity.tenantId,scopeType:'learner',scopeId:privateValue+'-scope-a'},{tenantId:identity.tenantId,scopeType:'session',scopeId:privateValue+'-scope-b'}];
    if(scenario==='cross-tenant')scopes[1].tenantId='other-company';
    if(scenario==='duplicate')scopes[1]=scopes[0];
    let inspections=0;
    mock.module('@lyyzka/lingxios',{namedExports:{readRunReference:async()=>{if(scenario==='binding-error')throw Error(privateValue);return scenario==='identity'?null:identity}}});
    mock.module(${JSON.stringify(new URL('db/pool.ts', source).href)},{namedExports:{pool:{},closeDatabasePools:async()=>events.push('database')}});
    mock.module(${JSON.stringify(new URL('redis.ts', source).href)},{namedExports:{sub:{disconnect:()=>events.push('subscriber')},redis:{disconnect:()=>events.push('redis')}}});
    mock.module(${JSON.stringify(new URL('modules/memory/configuration.ts', source).href)},{namedExports:{memoryEmbeddings:()=>scenario==='unconfigured'?undefined:options}});
    mock.module(${JSON.stringify(new URL('agent-runtime/runtime.ts', source).href)},{namedExports:{
      prepareLingxiOSWorkerContext:()=>{},stopLingxiOSControl:async()=>events.push('control'),
      lingxiOSControl:async()=>{if(scenario==='control-error')throw Error(privateValue);return {memory:{scopes:async()=>scenario==='empty'?[]:scopes,
        doctor:async()=>{inspections++;if(scenario==='revoked')throw Error(privateValue);return {
          conflicts:[{reason:privateValue}],brokenLinks:[{path:privateValue}],expired:[privateValue],
          ...(scenario==='unconfigured'?{}:{index:{key:scenario==='wrong-key'&&inspections===2?'f'.repeat(64):key,eligible:scenario==='plan-drift'?9:3,indexed:scenario==='invalid-count'?4:scenario==='complete'?3:1}})
        }},
        reindex:async(_identity,scope)=>{events.push('enqueue:'+scope.scopeType);if(scenario==='enqueue-failure')throw Error(privateValue);return {configured:true,queued:2}}
      }}}
    }});
    process.argv=['node','memory-maintenance',identity.tenantId,identity.principalId,identity.runId,${JSON.stringify(mode)},...${JSON.stringify([planHash,limit].filter(x => x !== undefined))}];
    try{await import(${JSON.stringify(cli.href)})}catch(error){process.exitCode=1;console.error(error)}
    console.log('SYNTHETIC_EVENTS='+JSON.stringify({events,inspections}));
  `
  const child = spawnSync(process.execPath, ['--import','tsx','--experimental-test-module-mocks','--input-type=module','-e',script], {
    cwd: new URL('../../../', import.meta.url), encoding:'utf8', timeout:10000,
  })
  assert.ifError(child.error)
  assert.doesNotMatch(child.stdout + child.stderr, new RegExp(privateValue))
  const lines = child.stdout.trim().split('\n')
  const events = JSON.parse(lines.find(line => line.startsWith('SYNTHETIC_EVENTS='))!.slice('SYNTHETIC_EVENTS='.length)) as {events:string[];inspections:number}
  assert.deepEqual(events.events.slice(-4),['control','subscriber','redis','database'])
  return {child,events,receipts:lines.filter(line=>line.startsWith('{')).map(line=>JSON.parse(line))}
}

test('native index status emits only the current model/key and hashed aggregate scope coverage',()=>{
  const {child,receipts}=run('index-status')
  assert.equal(child.status,0,child.stderr)
  const status=receipts[0]
  assert.equal(status.format,'native-memory-index-status/v1')
  assert.equal(status.model,'Pro/BAAI/bge-m3')
  assert.equal(status.configured,true)
  assert.equal(status.complete,false)
  assert.equal(status.eligible,6)
  assert.equal(status.indexed,2)
  assert.match(status.planHash,/^[a-f0-9]{64}$/)
  assert.equal(status.scopes.length,2)
  assert.deepEqual(Object.keys(status.scopes[0]).sort(),['eligible','indexed','key','scopeSha256','scopeType'])
})

test('complete scope coverage is distinct from partial, absent and empty configuration',()=>{
  assert.equal(run('index-status','complete').receipts[0].complete,true)
  for(const scenario of ['unconfigured','empty']) {
    const {child,receipts}=run('index-status',scenario)
    assert.equal(child.status,0,child.stderr)
    assert.equal(receipts[0].configured,false)
    assert.equal(receipts[0].complete,false)
  }
})

for(const scenario of ['identity','binding-error','control-error','cross-tenant','duplicate','wrong-key','invalid-count','revoked']) {
  test(`index inspection rejects ${scenario} without enqueue`,()=>{
    const {child,events}=run('index-status',scenario)
    assert.equal(child.status,1)
    assert.equal(events.events.filter(e=>e.startsWith('enqueue:')).length,0)
  })
}

test('index reindex requires the reviewed scope plan and an explicit sufficient bound',()=>{
  const plan=run('index-status').receipts[0].planHash as string
  for(const [scenario,hash,bound] of [['partial',plan,'5'],['plan-drift',plan,'100'],['partial','0'.repeat(64),'100'],['partial',plan,'0']] as const) {
    const {child,events}=run('index-reindex',scenario,hash,bound)
    assert.equal(child.status,1)
    assert.equal(events.events.filter(e=>e.startsWith('enqueue:')).length,0)
  }
  const {child,events,receipts}=run('index-reindex','partial',plan,'6')
  assert.equal(child.status,0,child.stderr)
  assert.deepEqual(events.events.slice(0,2),['enqueue:learner','enqueue:session'])
  const result=receipts.at(-1)
  assert.equal(result.complete,false)
  assert.equal(result.queued,4)
  assert.equal(result.coverageComplete,false)
})

test('uncertain enqueue stops without retry or enqueueing a remaining scope',()=>{
  const plan=run('index-status').receipts[0].planHash as string
  const {child,events,receipts}=run('index-reindex','enqueue-failure',plan,'6')
  assert.equal(child.status,1)
  assert.deepEqual(events.events.slice(0,-4),['enqueue:learner'])
  assert.equal(receipts.at(-1).status,'uncertain')
})
