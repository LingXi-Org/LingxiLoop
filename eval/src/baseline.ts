import { z } from 'zod'
import { EvaluationError, hash, id, manifestSchema, sampleSchema } from './contracts.js'
import { buildReport } from './report.js'
import type { Store } from './store.js'

const portableSchema = z.object({ schemaVersion: z.literal(2), name: id, reason: z.string().min(1).max(500),
  manifest: manifestSchema, samples: z.array(sampleSchema).min(1).max(100000), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export function exportBaseline(store: Store, name: string) {
  const job = store.baseline(name)
  const row = store.db.prepare('SELECT reason FROM baselines WHERE name=?').get(name)!
  const data = { schemaVersion: 2 as const, name, reason: String(row.reason), manifest: job.manifest, samples: store.samples(job.id) }
  return { ...data, digest: hash(data) }
}
export function importBaseline(store: Store, input: unknown): string {
  const { digest, ...data } = portableSchema.parse(input)
  if (hash(data) !== digest) throw new EvaluationError('baseline_digest_mismatch')
  const expected = new Set(data.manifest.dataset.cases.flatMap(c => Array.from({ length: data.manifest.suite.samples }, (_, i) => `${c.id}:${i}`)))
  for (const s of data.samples) {
    if (!expected.delete(`${s.caseId}:${s.index}`) || s.status === 'error' || !s.candidate
      || s.grades.length !== data.manifest.suite.graders.length) throw new EvaluationError('invalid_baseline_samples')
    const seen = new Set<string>()
    for (const g of s.grades) {
      const config = data.manifest.suite.graders.find(c => c.id === g.id)
      if (!config || seen.has(g.id) || g.passed !== (g.score >= config.threshold)) throw new EvaluationError('invalid_baseline_grades')
      seen.add(g.id)
    }
    if (s.score !== s.grades.reduce((sum, g) => sum + g.score, 0) / s.grades.length
      || (s.status === 'pass') !== s.grades.every(g => g.passed)) throw new EvaluationError('invalid_baseline_score')
  }
  if (expected.size) throw new EvaluationError('incomplete_baseline')
  // Hash proves integrity, not authorship: portable baselines require repository review.
  const jobId = `baseline-${digest}`
  const report = buildReport({ id: jobId, manifest: data.manifest, status: 'completed', createdAt: 0, report: null }, data.samples)
  if (!report.eligible) throw new EvaluationError('baseline_not_eligible')
  store.transaction(() => {
    store.create(data.manifest, jobId)
    const owner = store.claim(jobId, 60_000)
    for (const sample of data.samples) store.saveSample(jobId, owner, sample)
    store.finish(jobId, owner, report)
    store.promote(data.name, jobId, data.reason)
  })
  return data.name
}
