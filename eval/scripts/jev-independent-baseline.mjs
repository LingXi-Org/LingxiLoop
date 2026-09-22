import { readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { candidateTarget } from '../src/models.ts'
import { datasetSchema, suiteSchema } from '../src/contracts.ts'
import { Store } from '../src/store.ts'
import { runJob } from '../src/runner.ts'
import { exportBaseline } from '../src/baseline.ts'

// Explicit comparison credentials only. Deterministic fixed-fact grading, no model judge.
const [credentialFile, priorReport] = process.argv.slice(2)
if (!credentialFile || !priorReport) throw new Error('explicit comparison env and prior spend report required')
const env = parseEnv(readFileSync(credentialFile, 'utf8'))
const prior = JSON.parse(readFileSync(priorReport, 'utf8'))
const dataset = datasetSchema.parse(JSON.parse(readFileSync(new URL('../datasets/jev-atomic-holdout.v1.json', import.meta.url), 'utf8')))
const suite = suiteSchema.parse(JSON.parse(readFileSync(new URL('../suites/jev-atomic-holdout.v1.json', import.meta.url), 'utf8')))
if (new URL(env.OPENAI_BASE_URL).origin !== 'https://api.siliconflow.cn' || env.OPENAI_MODEL !== 'deepseek-ai/DeepSeek-V4-Flash') throw new Error('comparison price not verified')
// Reserve the entire run before any request. CNY numeric amount is a conservative USD ceiling.
const reserve = dataset.cases.reduce((sum, row) => sum + ((Buffer.byteLength(row.input) + 4096) * 3 + 128 * 9) / 1e6, 0)
if (!Number.isFinite(prior.chargedUpperUsd) || prior.chargedUpperUsd + reserve > 10) throw new Error('budget_exhausted')
writeFileSync(new URL('../results/jev-independent.v1.json', import.meta.url), JSON.stringify({ phase: 'reserved', maximumReservedUpperUsd: prior.chargedUpperUsd + reserve }), { flag: 'wx' })
const target = candidateTarget({ baseURL: env.OPENAI_BASE_URL, model: env.OPENAI_MODEL, apiKey: env.OPENAI_API_KEY,
  inputCnyPerMillion: 3, outputCnyPerMillion: 9, maxTokens: 128, timeoutMs: 45000, enableThinking: false })
const store = new Store(new URL('../results/jev-independent.v1.sqlite', import.meta.url).pathname.replace(/^\/(.:)/, '$1'))
try {
  const manifest = { schemaVersion: 2, engine: 'black-box-eval/2', dataset, suite, target: target.identity, judge: null, seed: 42,
    provenance: { revision: 'jev-v5-atomic-fixed-facts-v1' }, baseline: null }
  const id = store.create(manifest)
  const report = await runJob(store, id, target)
  writeFileSync(new URL('../results/jev-independent.v1.json', import.meta.url), JSON.stringify({ report, reserveUsd: reserve,
    totalUpperUsd: prior.chargedUpperUsd + reserve, note: 'Entire baseline reservation charged conservatively, including failed requests. Synthetic component baseline, not production runtime acceptance.' }, null, 2))
  if (report.eligible) {
    store.promote('jev-atomic-fixed-facts-v1', id, 'Independent generation baseline on frozen authored facts; no Jev judge or production data. Component comparison only.')
    writeFileSync(new URL('../results/jev-atomic-baseline.v1.json', import.meta.url), JSON.stringify(exportBaseline(store, 'jev-atomic-fixed-facts-v1'), null, 2), { flag: 'wx' })
  }
  console.log(JSON.stringify({ id, eligible: report.eligible, gate: report.gate, totalUpperUsd: prior.chargedUpperUsd + reserve }))
} finally { store.db.close() }
