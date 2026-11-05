import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { useHistoricalRuntimeScope } from './formal19-test-fixture.mjs'
import { bootstrapFailure, bootstrapFailureAnnotation, escapeWorkflowCommandData, markBootstrapFailure } from './bootstrap-diagnostics.mjs'
import { assertHistoricalDependencies, historicalDependencySource } from './historical-runtime-dependencies.mjs'
import { fileURLToPath } from 'node:url'
import {assertRuntimePatchTestTarget} from './bootstrap-runtime-patch-test-db.mjs'

test('source bootstrap rejects production, remote, overridden and untracked target names',()=>{
 const url='postgresql://postgres:fixture@127.0.0.1:5432/lingxiloop_test'
 const env={NODE_ENV:'test',DATABASE_URL:url,INTEGRATION_DATABASE_URL:url}
 assert.equal(assertRuntimePatchTestTarget(env),url)
 const dedicated=url.replace(':5432',':25432')
 assert.equal(assertRuntimePatchTestTarget({...env,DATABASE_URL:dedicated,INTEGRATION_DATABASE_URL:dedicated}),dedicated)
 assert.throws(()=>assertRuntimePatchTestTarget({...env,NODE_ENV:'production'}))
 assert.throws(()=>assertRuntimePatchTestTarget({...env,PGPORT:'6543',DATABASE_URL:url.replace(':5432',''),INTEGRATION_DATABASE_URL:url.replace(':5432','')}))
 for(const target of [url.replace('127.0.0.1','db.example.test'),url.replace('lingxiloop_test','production_test'),url+'?host=remote',url.replace('5432','18438'),url.replace('lingxiloop_test','lingxiloop')]){
  assert.throws(()=>assertRuntimePatchTestTarget({...env,DATABASE_URL:target,INTEGRATION_DATABASE_URL:target}))
 }
 assert.throws(()=>assertRuntimePatchTestTarget({...env,DATABASE_URL:url.replace('lingxiloop_test','other_test')}))
})

test('bootstrap diagnostics classify registry and nested child failures without exposing stderr or credentials', () => {
 const secret='sentinel-secret-token'
 const registry=markBootstrapFailure(Object.assign(new Error(`npm pack https://user:${secret}@registry.invalid/package`),{
  code:1,stderr:`npm error code E401\nnpm error ${secret}\n`,
 }),'formal3.8.25.archive-download')
 assert.deepEqual(bootstrapFailure(registry),{testBootstrap:'refused',phase:'formal3.8.25.archive-download',code:'E401'})
 const child={testBootstrap:'refused',phase:'formal3.8.24.fixture-run',causePhase:'formal3.8.19.archive-download',code:'E403',message:secret,url:`https://${secret}.invalid`}
 const nested=markBootstrapFailure(Object.assign(new Error(secret),{code:1,stderr:JSON.stringify(child)+'\n'}),'formal3.8.25.fixture-run')
 assert.deepEqual(bootstrapFailure(nested),{testBootstrap:'refused',phase:'formal3.8.25.fixture-run',code:'E403',causePhase:'formal3.8.19.archive-download'})
 const missing=Object.assign(new Error(`Cannot find package '@lyyzka/lingxios' imported from /${secret}/file.mjs`),{code:'ERR_MODULE_NOT_FOUND'})
 assert.deepEqual(bootstrapFailure(missing,'bootstrap.runtime-load'),{testBootstrap:'refused',phase:'bootstrap.runtime-load',code:'ERR_MODULE_NOT_FOUND',reason:'module_missing',package:'@lyyzka/lingxios'})
 for(const error of [registry,nested,missing])assert.doesNotMatch(JSON.stringify(bootstrapFailure(error)),new RegExp(secret+'|https:|stderr|registry.invalid'))
 assert.deepEqual(bootstrapFailure({code:secret,message:secret,bootstrapPhase:secret,stderr:JSON.stringify({testBootstrap:'refused',phase:secret,code:secret,package:secret})}),
  {testBootstrap:'refused',phase:'bootstrap',code:'BOOTSTRAP_REFUSED'})
})

test('GitHub bootstrap annotations contain only known labels and escape workflow command data', () => {
 const record={phase:'formal3.8.25.fixture-run',code:'ERR_MODULE_NOT_FOUND',causePhase:'formal3.8.19.dependencies',package:'@langchain/core',stderr:'sentinel-secret'}
 assert.equal(bootstrapFailureAnnotation(record,'true'),'::error title=Runtime test bootstrap failed::phase=formal3.8.25.fixture-run; code=ERR_MODULE_NOT_FOUND; causePhase=formal3.8.19.dependencies; package=@langchain/core')
 for(const enabled of ['false','',undefined])assert.equal(bootstrapFailureAnnotation(record,enabled ?? ''),null)
 const injection='sentinel-secret%\r\n::error::injected'
 const sanitized=bootstrapFailureAnnotation({phase:injection,code:injection,causePhase:injection,package:injection,stderr:injection},'true')
 assert.equal(sanitized,'::error title=Runtime test bootstrap failed::phase=bootstrap; code=BOOTSTRAP_REFUSED')
 assert.doesNotMatch(sanitized,/sentinel|injected|[\r\n]/)
 assert.equal(escapeWorkflowCommandData('100%\r\nnext'), '100%25%0D%0Anext')
})

test('historical SDK dependency closure is fixed independently of the SDK4 host and checked before execution', async () => {
 const root=fileURLToPath(new URL('../../',import.meta.url))
 const historical=await historicalDependencySource(root)
 const sdk=JSON.parse(await readFile(join(root,'server/fixtures/runtime-patch-source-3.8.25.json'),'utf8'))
 assert.doesNotThrow(()=>assertHistoricalDependencies(sdk.dependencies,historical.lock))
 const host=JSON.parse(await readFile(join(root,'server/build/integration/package-lock.json'),'utf8'))
 let failure
 try{assertHistoricalDependencies(sdk.dependencies,host)}catch(error){failure=markBootstrapFailure(error,'formal3.8.25.dependencies')}
 assert.deepEqual(bootstrapFailure(failure),{testBootstrap:'refused',phase:'formal3.8.25.dependencies',code:'HISTORICAL_DEPENDENCIES_MISSING',package:'@langchain/core'})
 const changed=structuredClone(historical.lock)
 changed.packages['node_modules/@langchain/core'].version='99.0.0'
 assert.throws(()=>assertHistoricalDependencies(sdk.dependencies,changed),{code:'HISTORICAL_DEPENDENCY_MISMATCH'})
 assert.equal(Object.keys(historical.lock.packages).length,79)
 assert.equal(historical.manifest.dependencies['@langchain/core'],'1.3.0')
 assert.equal(historical.manifest.dependencies['@langchain/langgraph'],'1.5.2')
})

test('historical host imports resolve the actual old package without changing archived source or receipts', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'lingxi-historical-scope-test-'))
  try {
    for (const path of ['server/src/db/migrations', 'server/scripts', 'shared', 'server/fixtures', 'node_modules/@lyyzka/lingxios']) await mkdir(join(fixture, path), { recursive: true })
    const source = `import { releaseVersions } from '@lingxi-org/lingxios'\nconst worker = await import('@lingxi-org/lingxios/worker')\nconst key = '@lingxi-org/lingxios'\nconst unrelated = '@lingxi-org/lingxios-other'\nconst url = 'https://npm.pkg.github.com/download/@lingxi-org/lingxios/4.0.0/archive'\n`
    await writeFile(join(fixture, 'server/src/runtime.ts'), source)
    await writeFile(join(fixture, 'server/scripts/fixture.mjs'), source)
    await writeFile(join(fixture, 'shared/runtime.ts'), source)
    const retained = ['server/src/db/migrations/0001_baseline.sql', 'server/fixtures/runtime-patch-source-3.8.25.json', 'node_modules/@lyyzka/lingxios/index.js']
    for (const path of retained) await writeFile(join(fixture, path), source)
    await useHistoricalRuntimeScope(fixture)
    for (const path of ['server/src/runtime.ts', 'server/scripts/fixture.mjs', 'shared/runtime.ts']) {
      const adapted = await readFile(join(fixture, path), 'utf8')
      assert.match(adapted, /from '@lyyzka\/lingxios'/)
      assert.match(adapted, /import\('@lyyzka\/lingxios\/worker'\)/)
      assert.match(adapted, /const key = '@lyyzka\/lingxios'/)
      assert.match(adapted, /'@lingxi-org\/lingxios-other'/)
      assert.match(adapted, /download\/@lingxi-org\/lingxios\/4\.0\.0\/archive/)
    }
    for (const path of retained) assert.equal(await readFile(join(fixture, path), 'utf8'), source)
    const once = await readFile(join(fixture, 'server/src/runtime.ts'), 'utf8')
    await useHistoricalRuntimeScope(fixture)
    assert.equal(await readFile(join(fixture, 'server/src/runtime.ts'), 'utf8'), once)
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
