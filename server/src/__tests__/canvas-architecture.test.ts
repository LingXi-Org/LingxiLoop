import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Canvas application receives domain transactions and typed publication without connection ownership', () => {
  const application = read('../modules/canvas/application.ts')
  const infrastructure = read('../modules/canvas/infrastructure.ts')
  const facade = read('../modules/canvas/facade.ts')

  assert.match(infrastructure, /withCanvasFence<T>\(canvasId: string, work: \(db: Queryable\)/)
  assert.match(infrastructure, /publishEvent\(event: CanvasEvent\)/)
  assert.doesNotMatch(infrastructure, /PoolClient|connect\(|release\(|acquireConnection|connectionTransaction/)
  assert.doesNotMatch(application, /PoolClient|\.connect\(|\.release\(|acquireCanvasSharedFence|releaseCanvasSharedFence/)
  assert.match(application, /withCanvasFence\(/)
  assert.match(facade, /acquireCanvasSharedFence/)
  assert.match(facade, /releaseCanvasSharedFence/)
})

test('Canvas report evidence is validated in one tenant-scoped repository query', () => {
  const application = read('../modules/canvas/reports-application.ts')
  const repository = read('../modules/canvas/reports-repository.ts')

  assert.match(repository, /jsonb_to_recordset\(\$3::jsonb\)/)
  assert.match(repository, /canvas\.company_id=\$2/)
  assert.equal((application.match(/missingEvidenceRefs\(/g) ?? []).length, 1)
  assert.doesNotMatch(application, /for \(const ref of input\.refs\) \{[^}]*await/s)
})

test('Canvas capabilities own separate application and repository modules', () => {
  const application = read('../modules/canvas/application.ts')
  const capabilities = [
    ['frames', 'createCanvasFrameApplication'],
    ['collaboration', 'createCanvasCollaborationApplication'],
    ['reports', 'createCanvasReportApplication'],
  ] as const
  for (const [capability, factory] of capabilities) {
    assert.match(application, new RegExp(factory))
    assert.match(read(`../modules/canvas/${capability}-application.ts`), /export function createCanvas/)
    assert.match(read(`../modules/canvas/${capability}-repository.ts`), /export async function/)
  }
})
