import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { useHistoricalRuntimeScope } from './formal19-test-fixture.mjs'
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
