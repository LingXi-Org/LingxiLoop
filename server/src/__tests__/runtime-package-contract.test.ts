import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// Failure model: CI's root install can pass while the independently installed
// server image pins an older runtime/schema, or resolves a different artifact.
test('server image and root qualification install the same exact published runtime artifact', async () => {
  const read = async (path: string) => JSON.parse(await readFile(new URL(`../../../${path}`,import.meta.url),'utf8'))
  const root = await read('package.json'), server = await read('server/package.json')
  const rootLock = await read('package-lock.json'), serverLock = await read('server/package-lock.json')
  const name = '@lyyzka/lingxios', expected = root.dependencies[name]
  assert.match(expected,/^\d+\.\d+\.\d+$/,'runtime must be pinned exactly')
  assert.equal(server.dependencies[name],expected,'production server manifest must match qualified root runtime')
  for (const [label,lock] of [['root',rootLock],['server',serverLock]] as const) {
    assert.equal(lock.packages[''].dependencies[name],expected,`${label} lock root must match`)
    const artifact = lock.packages[`node_modules/${name}`]
    assert.equal(artifact.version,expected,`${label} resolved runtime version must match`)
    assert.equal(artifact.resolved,rootLock.packages[`node_modules/${name}`].resolved,`${label} tarball must match`)
    assert.equal(artifact.integrity,rootLock.packages[`node_modules/${name}`].integrity,`${label} integrity must match`)
  }
})
