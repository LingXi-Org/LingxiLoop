#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { validateEvalRunInput } from '../server/src/eval/contracts.js'
import { evaluateRun } from '../server/src/eval/evaluator.js'
import { compareEvalReport, evalGateMarkdown, validateEvalBaseline } from '../server/src/eval/harness.js'

function option(name: string): string {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value || value.startsWith('--')) throw new Error(`${name} is required`)
  return value
}

const suitePath = resolve(option('--suite'))
const baselinePath = resolve(option('--baseline'))
const reportPath = resolve(option('--report'))
const suite = validateEvalRunInput(JSON.parse(await readFile(suitePath, 'utf8')))
const baseline = validateEvalBaseline(JSON.parse(await readFile(baselinePath, 'utf8')))
const nonHermetic = suite.cases.filter((item) => item.sourceAgentRunId || !item.observation).map((item) => item.caseId)
if (nonHermetic.length) throw new Error(`offline Eval suites require inline observations: ${nonHermetic.join(', ')}`)
suite.target = {
  ...(suite.target ?? {}),
  ...(process.env.GITHUB_SHA ? { commitSha: process.env.GITHUB_SHA } : {}),
}
const observations = new Map(suite.cases.map((item) => [item.caseId, item.observation ?? {}]))
const report = evaluateRun(suite, observations)
const gate = compareEvalReport(report, baseline)
const artifact = {
  schemaVersion: 'lingxiloop.eval-artifact.v1',
  suitePath,
  baselinePath,
  report,
  gate,
}
await mkdir(dirname(reportPath), { recursive: true })
await writeFile(reportPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
const markdown = evalGateMarkdown(report, baseline, gate)
process.stdout.write(markdown)
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, markdown, { flag: 'a' })
if (!gate.passed) process.exitCode = 1
