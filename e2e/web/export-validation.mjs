import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function validateCanvasExport(output) {
  const report = JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'))
  const canvas = report.run.results.find(result => result.selected && result.file === 'e2e/web/canvas.e2e.ts')
  if (!canvas) {
    console.log('Canvas export validation: not applicable to this selection.')
    return
  }
  if (canvas.status !== 'passed') {
    console.log(`Canvas export validation: not verified; browser case ${canvas.status}.`)
    return
  }
  const expected = JSON.parse(await readFile(path.join(output, 'canvas-export-expected.json'), 'utf8'))
  const attempt = canvas.attempts.at(-1)
  const download = attempt.artifacts.find(artifact => artifact.kind === 'download' && artifact.path.endsWith(`/${expected.download}`))
  assert.ok(download, 'The successful canvas case must record its exact download artifact')
  const root = path.resolve(output, 'artifacts')
  const file = path.resolve(root, download.path)
  assert.ok(file.startsWith(`${root}${path.sep}`), 'Download artifact must stay inside the report artifacts')
  const actual = await readFile(file)
  assert.deepEqual(actual, Buffer.from(expected.content, 'utf8'), 'Exported Markdown must exactly match the saved canvas text')
  const sha256 = createHash('sha256').update(actual).digest('hex')
  assert.equal(sha256, download.sha256, 'Downloaded bytes must match the report checksum')
  await writeFile(path.join(output, 'export-validation.json'), JSON.stringify({
    status: 'passed', runId: report.run.id, testId: canvas.testId,
    artifact: download.path, bytes: actual.length, sha256,
  }, null, 2))
  console.log(`Canvas export validation: exact Markdown bytes verified (${actual.length} bytes).`)
}
