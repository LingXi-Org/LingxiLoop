import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { createEvidenceClaim, createEvidenceRecord, readProductEvidenceChain } from '../modules/evidence/public.js'

const input = {
  id: 'evidence-1',
  companyId: 'company-1',
  projectId: 'project-1',
  level: 'L1' as const,
  derivation: 'OBSERVED' as const,
  kind: 'LEARNER_SUBMISSION',
  subjectUserId: 'learner-1',
  data: { answer: 'bounded learner work' },
  createdBy: { type: 'USER' as const, id: 'learner-1' },
}

function recordRow(data = input.data) {
  return {
    id: input.id,
    company_id: input.companyId,
    project_id: input.projectId,
    level: input.level,
    derivation: input.derivation,
    kind: input.kind,
    subject_user_id: input.subjectUserId,
    data,
    created_by_type: input.createdBy.type,
    created_by_id: input.createdBy.id,
    created_at: '2026-08-30T01:00:00.000Z',
  }
}

test('Evidence creation is exact-idempotent and rejects changed content', async () => {
  let existing: ReturnType<typeof recordRow> | undefined
  let inserts = 0
  const db: Queryable = {
    query: async (text) => {
      if (text.includes('SELECT * FROM evidence_records')) {
        return { rows: existing ? [existing] : [], rowCount: existing ? 1 : 0 } as never
      }
      if (text.includes('INSERT INTO evidence_records')) {
        inserts += 1
        existing = recordRow()
        return { rows: [existing], rowCount: 1 } as never
      }
      throw new Error(`unexpected query: ${text}`)
    },
  }
  const transaction = <T>(work: (client: Queryable) => Promise<T>) => work(db)

  const created = await createEvidenceRecord(transaction, input)
  const replayed = await createEvidenceRecord(transaction, input)

  assert.deepEqual(replayed, created)
  assert.equal(inserts, 1)
  await assert.rejects(
    () => createEvidenceRecord(transaction, { ...input, data: { answer: 'changed' } }),
    /different content/,
  )
})

test('Evidence links reject a target outside the current Project', async () => {
  const statements: string[] = []
  const db: Queryable = {
    query: async (text) => {
      statements.push(text)
      if (text.includes('SELECT * FROM evidence_records')) return { rows: [], rowCount: 0 } as never
      if (text.includes('INSERT INTO evidence_records')) return { rows: [recordRow()], rowCount: 1 } as never
      if (text.includes('FROM learning_attempts')) return { rows: [], rowCount: 0 } as never
      throw new Error(`unexpected query: ${text}`)
    },
  }

  await assert.rejects(
    () => createEvidenceRecord((work) => work(db), input, [{
      relation: 'SOURCE', targetLevel: 'L1', targetKind: 'LEARNING_ATTEMPT', targetId: 'other-attempt',
    }]),
    /outside the current Project/,
  )
  assert.equal(statements.some((text) => text.includes('INSERT INTO evidence_links')), false)
})

test('Inferred Claims require a same-tenant model run and scoped Evidence IDs', async () => {
  const statements: string[] = []
  const db: Queryable = {
    query: async (text) => {
      statements.push(text)
      if (text.includes('SELECT 1 FROM agent_runs')) return { rows: [{ '?column?': 1 }], rowCount: 1 } as never
      if (text.includes('COUNT(*)::int')) return { rows: [{ count: 1 }], rowCount: 1 } as never
      if (text.includes('INSERT INTO evidence_claims')) return { rows: [], rowCount: 1 } as never
      if (text.includes('INSERT INTO evidence_claim_evidence')) return { rows: [], rowCount: 1 } as never
      throw new Error(`unexpected query: ${text}`)
    },
  }
  const transaction = <T>(work: (client: Queryable) => Promise<T>) => work(db)

  const claim = await createEvidenceClaim(transaction, {
    id: 'claim-1', companyId: 'company-1', projectId: 'project-1', subjectUserId: 'learner-1',
    claimType: 'NEEDS_SUPPORT', statement: 'The learner may need a different example.',
    modelRunId: 'run-1', evidenceIds: ['evidence-1'],
  })

  assert.deepEqual(claim, { id: 'claim-1', status: 'PENDING', humanReviewRequired: true })
  assert.equal(statements.some((text) => text.includes('human_review_required')), true)
  await assert.rejects(
    () => createEvidenceClaim(transaction, {
      id: 'claim-2', companyId: 'company-1', projectId: 'project-1',
      claimType: 'EMPTY', statement: 'No evidence.', modelRunId: 'run-1', evidenceIds: [],
    }),
    /require between 1 and 64 Evidence IDs/,
  )
})

test('Product Evidence queries cap records and links by layer and fail closed for L4', async () => {
  let values: readonly unknown[] | undefined
  let queries = 0
  const db: Queryable = {
    query: async (_text, params) => {
      queries += 1
      values = params
      return { rows: [{
        ...recordRow(),
        links: [{
          relation: 'SOURCE', targetLevel: 'L2', targetKind: 'LEARNING_ATTEMPT', targetId: 'attempt-1',
        }],
      }], rowCount: 1 } as never
    },
  }

  const records = await readProductEvidenceChain(db, {
    companyId: 'company-1', projectId: 'project-1', subjectUserId: 'learner-1',
    maximumLevel: 'L2', limit: 20,
  })

  assert.equal(records[0]?.id, 'evidence-1')
  assert.deepEqual(values, [
    'company-1', 'project-1', 'learner-1', ['L1', 'L2'], ['L0', 'L1', 'L2'], 20,
  ])
  assert.deepEqual(await readProductEvidenceChain(db, {
    companyId: 'company-1', projectId: 'project-1', maximumLevel: 'L0',
  }), [])
  assert.equal(queries, 1)
  assert.throws(() => readProductEvidenceChain(db, {
    companyId: 'company-1', projectId: 'project-1', maximumLevel: 'L4',
  } as never), /L4 Evidence is unavailable/)
})
