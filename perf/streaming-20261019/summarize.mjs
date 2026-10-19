import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
const root = 'perf/streaming-20261019'
const read = path => JSON.parse(readFileSync(`${root}/${path}`, 'utf8'))
const samples = dir => readdirSync(`${root}/${dir}`).filter(name => name.endsWith('.json')).map(name => read(`${dir}/${name}`))
const quantiles = values => {
  values.sort((a, b) => a - b)
  return Object.fromEntries([50, 75, 95].map(q => [`p${q}`, values[Math.ceil(q / 100 * values.length) - 1]]))
}
function aggregate(rows, metrics) {
  assert.equal(rows.length, 10)
  return { samples: rows.length, errors: rows.reduce((sum, row) => sum + row.errors, 0),
    metrics: Object.fromEntries(metrics.map(metric => [metric, quantiles(rows.map(row => row[metric]))])) }
}
const browser = samples('browser-results'), journeys = samples('journey-results')
const result = {
  protocol: read('paired.json').summary,
  browser: Object.fromEntries(['base', 'candidate'].map(variant => [variant, aggregate(browser.filter(row => row.variant === variant),
    ['interactiveMs','feedbackMs','firstBodyMs','completeMs','longTaskMs','requests','protocolRequests','heapBytes'])])),
  productBaseline: Object.fromEntries(['login', 'conversation'].map(scenario => [scenario, aggregate(journeys.filter(row => row.scenario === scenario),
    ['interactiveMs','inputConfirmedMs','workspaceMs','longTaskMs','requests','apiRequests','heapBytes'])])),
}
writeFileSync(`${root}/summary.json`, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({browser:result.browser,productBaseline:result.productBaseline},null,2))
