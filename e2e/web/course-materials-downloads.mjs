import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function validateMaterialDownloads(output) {
  const report = JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'))
  const result = report.run.results.find(result => result.selected && result.file === 'e2e/web/course-materials.e2e.ts'
    && result.titlePath.some(title => title.startsWith('student files upload,')))
  if (!result || result.status !== 'passed') return
  const artifacts = result.attempts.at(-1).artifacts.filter(artifact => artifact.kind === 'download')
  const root = path.resolve(output, 'artifacts')
  const verified = []
  for (const name of ['triangle.pdf', 'triangle.docx', 'triangle.pptx', 'triangle.xlsx', 'triangle.md', 'triangle.png', 'triangle.zip']) {
    const artifact = artifacts.find(artifact => artifact.path.endsWith(`-${name}`))
    assert.ok(artifact, `Missing actual UI download: ${name}`)
    const file = path.resolve(root, artifact.path)
    assert.ok(file.startsWith(`${root}${path.sep}`), 'Download must remain within report artifacts')
    const actual = await readFile(file)
    const expected = await readFile(path.join('e2e/fixtures/course-materials', name))
    assert.deepEqual(actual, expected, `Original bytes changed: ${name}`)
    const sha256 = createHash('sha256').update(actual).digest('hex')
    assert.equal(artifact.sha256, sha256, `Report checksum mismatch: ${name}`)
    verified.push({ name, bytes: actual.length, sha256, artifact: artifact.path })
  }
  await writeFile(path.join(output, 'course-materials-downloads.json'), JSON.stringify({ status: 'passed', runId: report.run.id, files: verified }, null, 2))
  console.log(`Course materials: ${verified.length} original downloads verified byte-for-byte.`)
}
