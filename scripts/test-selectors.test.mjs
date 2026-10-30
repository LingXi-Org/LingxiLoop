import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { SMOKE_FILES, parseIntegrationArgs, selectIntegrationFiles } from '../server/integration-suite.mjs'
import { partitionMigrationTests, assertHistoricalFixtureTarget, assertHistoricalArtifact, copyProduct54FixtureSource, copyProduct57FixtureSource, assertProduct54FixtureTarget } from '../server/run-historical-migration-tests.mjs'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Failure model: today's projection imports new runtime UI exports which the
// real historical3.8.2 package cannot expose. Pin the display and IM decoding leaves;
// preserve current migrations, identity, all historical assertions and helpers.
// Modified/missing snapshots must fail closed, never patch the old runtime.
test('historical fixture isolates pinned display leaves while retaining current migration coverage', async () => {
 const { copyHistoricalFixtureSource } = await import('../server/run-historical-migration-tests.mjs')
 assert.equal(typeof copyHistoricalFixtureSource,'function')
 const root=await mkdtemp(join(tmpdir(),'historical-source-owner-'))
 try {
  const source=join(root,'source'),fixture=join(root,'fixture')
  const retained=['package.json','package-lock.json','server/package.json','server/package-lock.json','server/src/db/migrate.ts','server/src/agent-runtime/identity.ts',
   'server/src/__integration__/run-presentation-contract.test.ts','src/lib/runActivity.ts']
  const pinned=['server/src/agent-runtime/message-projection.ts','src/lib/nativeMessage.ts','server/src/im/wukong.ts','server/src/im/message-types.ts']
  for(const path of [...retained,...pinned]){
   await mkdir(join(source,path,'..'),{recursive:true})
   await writeFile(join(source,path),'current source: '+path)
  }
  await mkdir(join(source,'server/src/db/migrations'),{recursive:true})
  for(let i=1;i<=55;i++)await writeFile(join(source,'server/src/db/migrations',String(i).padStart(4,'0')+'_fixture.sql'),'-- migration '+i+'\n')
  const snapshots='server/fixtures/historical-projection-3.8.2'
  await cp(new URL('../'+snapshots,import.meta.url),join(source,snapshots),{recursive:true})
  const receipt=await copyHistoricalFixtureSource(source,fixture)
  assert.equal(receipt.sourceCommit,'7a255c3fe95d832e77fd29c6db9a506d111d3cf2')
  assert.deepEqual(receipt.files.map(row=>row.path),pinned)
  for(const path of retained)assert.equal(await readFile(join(fixture,path),'utf8'),'current source: '+path)
  for(const row of receipt.files){
   const bytes=await readFile(join(fixture,row.path))
   assert.deepEqual(bytes,await readFile(join(source,snapshots,row.path)))
   assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256)
   assert.equal(await readFile(join(source,row.path),'utf8'),'current source: '+row.path)
  }
  await writeFile(join(source,snapshots,pinned[1]),'tampered historical source')
  await assert.rejects(copyHistoricalFixtureSource(source,join(root,'tampered')),/Historical projection source integrity changed/)
  await rm(join(source,snapshots,pinned[1]))
  await assert.rejects(copyHistoricalFixtureSource(source,join(root,'missing')),{code:'ENOENT'})
 }finally{await rm(root,{recursive:true,force:true})}
})

test('historical migration routing retains every requested file and adds current-package owning checks',()=>{
 const historical=['migration.test.ts','conversation-repair-provenance-migration.test.ts','public-purpose-reader-migration.test.ts','run-trace-provenance-migration.test.ts','run-presentation-contract.test.ts']
 const result=partitionMigrationTests([...historical,'closed-education.test.ts'])
 assert.deepEqual(result.historical,historical)
 assert.deepEqual(result.current,['closed-education.test.ts'])
 assert.deepEqual(result.patch54,['runtime-patch-provenance.test.ts'])
 assert.deepEqual(partitionMigrationTests(['runtime-patch57-provenance.test.ts','homework-findings-migration.test.ts']),{current:['homework-findings-migration.test.ts'],patch54:[],patch57:['runtime-patch57-provenance.test.ts'],patch58:[],historical:[]})
 assert.deepEqual(partitionMigrationTests(['runtime-patch-provenance.test.ts']),{current:[],patch54:['runtime-patch-provenance.test.ts'],patch57:[],patch58:[],historical:[]})
 assert.deepEqual(partitionMigrationTests(['runtime-patch58-provenance.test.ts','presentation-retirement-migration.test.ts']),{current:['presentation-retirement-migration.test.ts'],patch54:[],patch57:[],patch58:['runtime-patch58-provenance.test.ts'],historical:[]})
})
test('product54 fixture copies the exact contiguous prefix and four current manifests without mutating55 source',async()=>{
 const root=await mkdtemp(join(tmpdir(),'product54-source-owner-'))
 try{
  const source=join(root,'source'),fixture=join(root,'fixture')
  const paths=['package.json','package-lock.json','server/package.json','server/package-lock.json','server/src/db/runtime-patch.ts','src/lib/nativeMessage.ts']
  for(const path of paths){await mkdir(join(source,path,'..'),{recursive:true});await writeFile(join(source,path),'exact current bytes '+path)}
  const migrations=join(source,'server/src/db/migrations');await mkdir(migrations,{recursive:true})
  for(let i=1;i<=55;i++)await writeFile(join(migrations,String(i).padStart(4,'0')+'_fixture.sql'),'-- migration '+i+'\n')
  const result=await copyProduct54FixtureSource(source,fixture);assert.equal(result.migrations.length,54)
  for(const [i,row] of result.migrations.entries()){
   const name=String(i+1).padStart(4,'0')+'_fixture.sql',bytes=await readFile(join(migrations,name));assert.deepEqual(await readFile(join(fixture,'server/src/db/migrations',name)),bytes);assert.equal(row.checksum,createHash('sha256').update(bytes).digest('hex'))
  }
  await assert.rejects(readFile(join(fixture,'server/src/db/migrations/0055_fixture.sql')),{code:'ENOENT'});assert.match(await readFile(join(migrations,'0055_fixture.sql'),'utf8'),/55/)
  for(const path of paths)assert.deepEqual(await readFile(join(fixture,path)),await readFile(join(source,path)))
  await rm(join(migrations,'0030_fixture.sql'));await assert.rejects(copyProduct54FixtureSource(source,join(root,'gap')),/contiguous/)
 }finally{await rm(root,{recursive:true,force:true})}
})

test('product57 fixture keeps CAS57 exact without removing product58 from the real source',async()=>{
 const root=await mkdtemp(join(tmpdir(),'product57-source-owner-'))
 try{
  const source=join(root,'source'),fixture=join(root,'fixture')
  const paths=['package.json','package-lock.json','server/package.json','server/package-lock.json','server/src/db/runtime-patch.ts','src/lib/nativeMessage.ts']
  for(const path of paths){await mkdir(join(source,path,'..'),{recursive:true});await writeFile(join(source,path),'exact current bytes '+path)}
  const migrations=join(source,'server/src/db/migrations');await mkdir(migrations,{recursive:true})
  for(let i=1;i<=58;i++)await writeFile(join(migrations,String(i).padStart(4,'0')+'_fixture.sql'),'-- migration '+i+'\n')
  const result=await copyProduct57FixtureSource(source,fixture);assert.equal(result.migrations.length,57)
  for(const [i,row] of result.migrations.entries()){
   const name=String(i+1).padStart(4,'0')+'_fixture.sql',bytes=await readFile(join(migrations,name));assert.deepEqual(await readFile(join(fixture,'server/src/db/migrations',name)),bytes);assert.equal(row.checksum,createHash('sha256').update(bytes).digest('hex'))
  }
  await assert.rejects(readFile(join(fixture,'server/src/db/migrations/0058_fixture.sql')),{code:'ENOENT'});assert.match(await readFile(join(migrations,'0058_fixture.sql'),'utf8'),/58/)
  for(const path of paths)assert.deepEqual(await readFile(join(fixture,path)),await readFile(join(source,path)))
  await rm(join(migrations,'0030_fixture.sql'));await assert.rejects(copyProduct57FixtureSource(source,join(root,'gap')),/contiguous/)
 }finally{await rm(root,{recursive:true,force:true})}
})

test('historical fixture rejects nonlocal/non-test targets, arbitrary files and altered pinned package bytes',()=>{
 const env={NODE_ENV:'test',INTEGRATION_DATABASE_URL:'postgres://postgres:fixture@127.0.0.1:5432/runtime_test'}
 assert.doesNotThrow(()=>assertHistoricalFixtureTarget(['migration.test.ts'],env))
 assert.doesNotThrow(()=>assertProduct54FixtureTarget(['runtime-patch-provenance.test.ts'],env))
 assert.throws(()=>assertProduct54FixtureTarget(['migration.test.ts'],env))
 assert.throws(()=>assertProduct54FixtureTarget(['runtime-patch-provenance.test.ts'],{...env,INTEGRATION_DATABASE_URL:'postgres://external.test/runtime_test'}))
 for(const value of [{...env,NODE_ENV:'production'},{...env,INTEGRATION_DATABASE_URL:'postgres://localhost/main'},
  {...env,INTEGRATION_DATABASE_URL:'postgres://external.test/runtime_test'}, {...env,INTEGRATION_DATABASE_URL:env.INTEGRATION_DATABASE_URL+'?host=remote.test'},
  {...env,INTEGRATION_DATABASE_URL:env.INTEGRATION_DATABASE_URL+'?hostaddr=203.0.113.10'}]){
  assert.throws(()=>assertHistoricalFixtureTarget(['migration.test.ts'],value))
 }
 assert.throws(()=>assertHistoricalFixtureTarget(['../migration.test.ts'],env))
 assert.throws(()=>assertHistoricalFixtureTarget(['runtime-patch-provenance.test.ts'],env))
 const bytes=Buffer.from('synthetic archive'),record={version:'3.8.2',resolved:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.2/fixture',integrity:'sha512-'+createHash('sha512').update(bytes).digest('base64')}
 assert.doesNotThrow(()=>assertHistoricalArtifact(bytes,record))
 assert.throws(()=>assertHistoricalArtifact(Buffer.from('changed'),record))
 assert.throws(()=>assertHistoricalArtifact(bytes,{...record,version:'3.8.3'}))
 assert.throws(()=>assertHistoricalArtifact(bytes,{...record,resolved:'https://other.test/package'}))
})

test('test selectors reject malformed and cross-scope paths before starting tests', () => {
  const run = (script, args, env) => spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8', env: { ...process.env, DOTENV_CONFIG_PATH: '__no_test_env__', INTEGRATION_DATABASE_URL: '', ...env },
  })
  for (const files of ['{}', '["admin/src/record-presentation.test.ts"]', '["src/../admin/test.test.ts"]']) {
    const result = run('scripts/run-tests.mjs', ['web'], { CI_TEST_FILES: files })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /CI_TEST_FILES/)
  }
  for (const files of ['{}', '["../migration.test.ts"]', '["unknown.test.ts"]', 'invalid']) {
    assert.equal(run('server/run-integration-tests.mjs', [], { INTEGRATION_TEST_FILES: files }).status, 2)
  }
  const selected = run('server/run-integration-tests.mjs', [], { INTEGRATION_TEST_FILES: '["migration.test.ts"]' })
  assert.equal(selected.status, 2)
  assert.match(selected.stdout, /selected 1\/\d+ file\(s\): migration\.test\.ts/)
  assert.match(selected.stderr, /INTEGRATION_DATABASE_URL is required/)
})

test('integration runner refuses unsafe database targets without exposing credentials', () => {
  // Failure modes: credentials/hosts/query strings impersonate a test DB,
  // production names pass a substring check, malformed URLs, and secret logs.
  for (const databaseUrl of [
    'postgres://tester:sentinel-secret@localhost:1/lingxiloop',
    'postgres://user:sentinel-test-secret@localhost:1/lingxiloop',
    'postgres://user:sentinel-secret@test.localhost:1/lingxiloop',
    'postgres://user:sentinel-secret@localhost:1/lingxiloop?application_name=test',
    'postgres://user:sentinel-secret@localhost:1/latest',
    'postgres://user:sentinel-secret@localhost:1/production_test',
    'postgres://user:sentinel-secret@localhost:1/%70rod_test',
    'postgres://user:sentinel-secret@localhost:1/%zz_test',
    'postgres://user:sentinel-secret@localhost:1/prod',
    'postgres://user:sentinel-secret@production.example.test:1/lingxiloop_test',
    'postgres://user:sentinel-secret@localhost:1/lingxiloop_test?host=production.example.test',
    'postgres://user:sentinel-secret@localhost:1/lingxiloop_test?host=localhost&host=production.example.test',
    'postgres://user:sentinel-secret@%70roduction.example.test:1/lingxiloop_test',
    'https://user:sentinel-secret@localhost:1/lingxiloop_test',
    'sentinel-secret',
  ]) {
    const result = spawnSync(process.execPath, [
      'server/run-integration-tests.mjs', '--file', 'agent-protocols-live.test.ts',
    ], {
      encoding: 'utf8', timeout: 15_000,
      env: {
        ...process.env, DOTENV_CONFIG_PATH: '__no_test_env__',
        INTEGRATION_DATABASE_URL: databaseUrl, LINGXIOS_LIVE_PROTOCOL: '0',
      },
    })
    assert.equal(result.status, 2, 'unsafe target must fail before spawning integration tests')
    assert.match(result.stderr, /dedicated test database/i)
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /sentinel-secret|sentinel-test-secret/)
  }
})


test('integration modes are explicit and empty selections never mean full', () => {
  const availableFiles = [...SMOKE_FILES, 'migration.test.ts', 'runtime-model-context.test.ts']
  const choose = (argv = [], env = {}) => selectIntegrationFiles({ ...parseIntegrationArgs(argv, env), availableFiles })
  assert.deepEqual(choose(), SMOKE_FILES)
  assert.deepEqual(choose([], { INTEGRATION_TEST_FILES: '[]' }), SMOKE_FILES)
  assert.deepEqual(choose(['--mode', 'smoke']), SMOKE_FILES)
  assert.deepEqual(choose(['--file', 'migration.test.ts', '--file', 'migration.test.ts']), ['migration.test.ts'])
  assert.deepEqual(choose([], { INTEGRATION_TEST_MODE: 'selected', INTEGRATION_TEST_FILES: '["migration.test.ts"]' }), ['migration.test.ts'])
  assert.deepEqual(choose(['--mode', 'full']), availableFiles.toSorted())
  for (const argv of [['--mode', 'selected'], ['--mode', 'full', '--file', 'migration.test.ts'], ['--mode', 'smoke', '--file', 'migration.test.ts'], ['--mode', 'typo'], ['--mode'], ['--file'], ['--mode', 'smoke', '--mode', 'full'], ['--file', '../migration.test.ts'], ['--file', 'unknown.test.ts']]) {
    assert.throws(() => choose(argv), undefined, JSON.stringify(argv))
  }
  for (const files of ['{}', 'null', '[1]', 'invalid']) assert.throws(() => choose([], { INTEGRATION_TEST_FILES: files }))
  assert.throws(() => selectIntegrationFiles({ mode: 'smoke', files: [], availableFiles: [] }), /missing|unavailable/)
  assert.throws(() => selectIntegrationFiles({ mode: 'full', files: [], availableFiles: [] }), /empty/)
})

test('integration required services fail before any test is spawned', () => {
  const run = env => spawnSync(process.execPath, ['server/run-integration-tests.mjs', '--mode', 'smoke'], {
    encoding: 'utf8', env: { ...process.env, DOTENV_CONFIG_PATH: '__no_test_env__', INTEGRATION_TEST_FILES: '', INTEGRATION_TEST_MODE: '', INTEGRATION_DATABASE_URL: '', REDIS_URL: '', LINGXIOS_TEST_REDIS_URL: '', ...env },
  })
  const missingDb = run({})
  assert.equal(missingDb.status, 2)
  assert.match(missingDb.stderr, /INTEGRATION_DATABASE_URL is required/)
  assert.doesNotMatch(missingDb.stdout, /TAP version|skipped/)
  const missingRedis = run({ INTEGRATION_DATABASE_URL: 'postgres://test@127.0.0.1:1/ci_test' })
  assert.equal(missingRedis.status, 2)
  assert.match(missingRedis.stderr, /REDIS_URL is required/)
  assert.doesNotMatch(missingRedis.stdout, /TAP version|skipped/)
})
