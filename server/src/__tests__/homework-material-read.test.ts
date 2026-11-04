import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

test('informational material reading retains safe partial statuses and frozen hashes without relaxing publication', async () => {
  const repository = await import('../modules/learning/homework-repository.js')
  const source = 'attachments/company/material.docx'
  const material = { source, hash: 'a'.repeat(64), text: '', contentStatus: 'failed' }
  let mode: unknown
  mock.module('../modules/learning/homework-repository.js', { namedExports: { ...repository,
    homeworkScope: async () => {}, assertHomeworkPublished: () => {},
    homeworkRow: async () => ({ id: 'homework', materials: [material] }),
    homeworkState: async () => ({}), studentHomeworkView: async () => ({}),
  } })
  const effects = await import('../modules/learning/homework-effects.js')
  mock.module('../modules/learning/homework-effects.js', { namedExports: { ...effects,
    readHomeworkMaterials: async (...args: unknown[]) => { mode = args[4]; return [material] },
  } })
  const { learnerHomeworkRead } = await import('../modules/learning/homework-reporting.js')
  const scope = { companyId: 'company', userId: 'student', projectId: 'course' }
  const result = await learnerHomeworkRead({} as never, scope, 'course', { homeworkId: 'homework', section: 'materials', offset: 0 }, new AbortController().signal)
  assert.equal(mode, 'read')
  assert.match(JSON.stringify(result), /attachment_extraction_failed/)
  assert.match(JSON.stringify(result), /aaaaaa/)
  mock.restoreAll()
})
