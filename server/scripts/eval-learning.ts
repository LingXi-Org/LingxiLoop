import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { projectMastery } from '../src/learning/mastery.js'
import type { MasteryProjectionInput } from '../src/learning/types.js'

interface Scenario {
  id: string
  kind: 'mastery' | 'source'
  input?: MasteryProjectionInput
  expect?: Record<string, unknown>
  file?: string
  contains?: string[]
}

const path = resolve('evals/learning/scenarios.jsonl')
const scenarios = (await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Scenario)
let failed = 0
for (const scenario of scenarios) {
  let errors: string[] = []
  if (scenario.kind === 'mastery') {
    const actual = projectMastery(scenario.input!) as unknown as Record<string, unknown>
    errors = Object.entries(scenario.expect ?? {}).filter(([key, value]) => actual[key] !== value).map(([key, value]) => `${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(actual[key])}`)
  } else {
    const source = await readFile(resolve(scenario.file!), 'utf8')
    errors = (scenario.contains ?? []).filter((value) => !source.includes(value)).map((value) => `missing ${JSON.stringify(value)}`)
  }
  if (errors.length) { failed++; console.error(`FAIL ${scenario.id}: ${errors.join('; ')}`) }
  else console.log(`PASS ${scenario.id}`)
}
console.log(`\nLearning eval: ${scenarios.length - failed}/${scenarios.length} passed`)
if (failed) process.exit(1)
