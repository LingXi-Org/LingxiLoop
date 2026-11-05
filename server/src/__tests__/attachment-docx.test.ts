import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { mock, test } from 'node:test'
import { releaseVersions } from '@lingxi-org/lingxios'
import { installStorageProvider } from '../storage.js'

test('real DOCX extraction is repeatable and partial material reads preserve good text and exact raw hashes', async () => {
  const valid = await readFile(new URL('../__integration__/fixtures/homework/triangle-answer.docx', import.meta.url))
  const bad = Buffer.from('PK-invalid-DOCX-PRIVATE-CONTENT')
  const inputs = new Map([['attachments/company/good.docx', valid], ['attachments/company/bad.docx', bad]])
  let denied = false
  const access = await import('../modules/learning/submission-attachments.js')
  mock.module('../modules/learning/submission-attachments.js', { namedExports: { ...access, canReadLearningFile: async () => !denied } })
  installStorageProvider({ mode: 'r2',
    statObject: async (key: string) => ({ sizeBytes: inputs.get(key)!.length, contentType: key.endsWith('good.docx') ? 'application/zip' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', etag: null, lastModifiedMs: 1 }),
    readObjectBounded: async (key: string) => inputs.get(key)!,
  } as never)
  const { readHomeworkMaterials } = await import('../modules/learning/homework-effects.js')
  const scope = { companyId: 'company', userId: 'student', projectId: 'course' }
  const content = { links: [], attachments: [...inputs.keys()].map(key => ({ key, name: key.split('/').at(-1)! })) }
  let text: string | undefined
  try {
    for (let index = 0; index < 3; index++) {
      const result = await readHomeworkMaterials({} as never, scope, content, new AbortController().signal, 'read')
      assert.equal(result.length, 2)
      assert.equal(result[0].hash, createHash('sha256').update(valid).digest('hex'))
      assert.ok(result[0].text.length > 20)
      text ??= result[0].text
      assert.equal(result[0].text, text)
      assert.equal(result[1].contentStatus, 'failed')
      assert.equal(result[1].hash, createHash('sha256').update(bad).digest('hex'))
      assert.equal(result[1].text, '')
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE-CONTENT/)
    }
    await assert.rejects(readHomeworkMaterials({} as never, scope, content, new AbortController().signal), /无法完整提取/)
    denied = true
    await assert.rejects(readHomeworkMaterials({} as never, scope, content, new AbortController().signal, 'read'), /无法访问/)
    console.info(JSON.stringify({ qualification: 'repeat-real-docx-and-legacy-mime', runtime: releaseVersions.runtime, repeatedReads: 3, malformedStatus: 'failed', originalMaterialD: false }))
    denied = false
    const abort = new AbortController(); abort.abort()
    await assert.rejects(readHomeworkMaterials({} as never, scope, content, abort.signal, 'read'), { name: 'AbortError' })
  } finally { mock.restoreAll() }
})
