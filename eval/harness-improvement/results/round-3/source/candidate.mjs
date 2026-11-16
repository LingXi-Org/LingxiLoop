import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('./.state/candidate/', import.meta.url)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function identity() {
  const protocol = JSON.parse(await readFile(new URL('./protocol.json', import.meta.url)))
  const expected = protocol.runtimes['lingxios-candidate']
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(root), encoding: 'utf8' }).trim()
  assert.equal(source, expected.runtimeSourceCommit)
  const diff = execFileSync('git', ['diff', '--no-ext-diff', '--binary', 'HEAD'], { cwd: fileURLToPath(root) })
  assert.equal(sha(diff), expected.candidatePatchSha256, 'Candidate source differs from the frozen patch')
  assert.equal(sha(await readFile(new URL('./lingxios.patch', import.meta.url))), expected.candidatePatchSha256)
  const files = {}
  async function walk(dir) {
    for (const entry of (await readdir(new URL(dir, root), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const name = dir + entry.name
      if (entry.isDirectory()) await walk(name + '/')
      else files[name] = sha(await readFile(new URL(name, root)))
    }
  }
  await walk('dist/src/')
  return { source, patchSha256: sha(diff), files }
}
export async function verifyCandidate() {
  assert.deepEqual(await identity(), JSON.parse(await readFile(new URL('./.state/candidate-build.json', import.meta.url))))
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeFile(new URL('./.state/candidate-build.json', import.meta.url), JSON.stringify(await identity(), null, 2) + '\n')
  console.log('Candidate source and compiled file hashes recorded')
}
