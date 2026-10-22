import assert from 'node:assert/strict'
import { after } from 'node:test'
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

// Historical provenance tests must exercise their reviewed migration prefix.
// Later DDL must not leak into a fixture that asserts a provenance-only upgrade.
export async function migrationHistoryThrough(version: number): Promise<URL> {
  const source = new URL('../db/migrations/', import.meta.url)
  const files = (await readdir(source)).filter(file => /^\d{4}_[a-z0-9_]+\.sql$/.test(file) && Number(file.slice(0, 4)) <= version).sort()
  assert.equal(files.length, version)
  files.forEach((file, index) => { assert.equal(Number(file.slice(0, 4)), index + 1) })
  const directory = await mkdtemp(join(tmpdir(), 'lingxiloop-migration-history-'))
  after(async () => {
    assert.equal(dirname(directory), resolve(tmpdir()))
    await rm(directory, { recursive: true, force: true })
  })
  for (const file of files) await copyFile(new URL(file, source), join(directory, file))
  return pathToFileURL(`${directory}${sep}`)
}
