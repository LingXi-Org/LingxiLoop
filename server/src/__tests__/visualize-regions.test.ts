import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { renderNumericChart } from '../im/visualize-numeric.js'

const chart = { kind: 'linear', title: 'Plans', inputLabel: 'Uses', inputUnit: 'times', valueUnit: 'cost', prefer: 'lower', preferenceBands: true,
  domain: { min: 0, max: 100 }, series: [{ label: 'A', intercept: 100, slope: 2 }, { label: 'B', intercept: 0, slope: 5 }] }
const rects = (html: string) => [...html.matchAll(/<rect class="lx-preference-band" x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/g)].map(m => m.slice(1).map(Number))
test('frozen wrong plot-region boxes map to same-source intervals, widths and intersection marks', () => {
  const historical = readFileSync(new URL('../../../artifacts/issue-217-quality/provider-repair1/comparison-answer.md', import.meta.url), 'utf8')
  assert.match(historical, /<rect x="70" y="40" width="212\.7"/)
  assert.ok(Math.abs(70 + (100 / 3) / 100 * 530 - 282.7) > 30, 'retain the actual historical error, not a rewritten fixture')
  const result = renderNumericChart(chart)
  assert.equal(result.summary.kind, 'linear'); if (result.summary.kind !== 'linear') return
  assert.deepEqual(result.summary.bands.map(b => b.preferred), [['B'], ['A']])
  assert.equal(result.summary.bands[0]!.to, result.summary.intersections[0]!.x)
  const boxes = rects(result.html), crossX = Number(/<circle cx="([\d.-]+)"/.exec(result.html)![1])
  assert.equal(boxes.length, 2); assert.equal(boxes[0]![0]! + boxes[0]![2]!, crossX)
  assert.equal(boxes[1]![0], crossX); assert.equal(boxes[1]![0]! + boxes[1]![2]!, 604)
  assert.equal(boxes[0]![0], 64); assert.ok(boxes.every(r => r[2]! > 0 && r[1] === 36 && r[3] === 212))
  assert.match(result.html, /interval interiors/i)
})
test('intervals cover negative domains, higher preference, ties and more than two functions', () => {
  const result = renderNumericChart({ ...chart, prefer: 'higher', domain: { min: -3, max: 3 }, series: [
    { label: 'Up', intercept: 0, slope: 1 }, { label: 'Down', intercept: 0, slope: -1 }, { label: 'Base', intercept: -100, slope: 0 }] })
  assert.equal(result.summary.kind, 'linear'); if (result.summary.kind !== 'linear') return
  assert.deepEqual(result.summary.bands.map(b => b.preferred), [['Down'], ['Up']])
  assert.equal(result.summary.bands[0]!.from, -3); assert.equal(result.summary.bands.at(-1)!.to, 3)
  const ties = renderNumericChart({ ...chart, series: [{ label: 'A', intercept: 5, slope: 0 }, { label: 'B', intercept: 5, slope: 0 }] })
  assert.equal(ties.summary.kind, 'linear'); if (ties.summary.kind === 'linear') assert.deepEqual(ties.summary.bands[0]!.preferred, ['A', 'B'])
  assert.equal(rects(renderNumericChart({ ...chart, preferenceBands: false }).html).length, 0)
})
test('bands reject subpixel degenerate intervals instead of emitting zero-width rectangles', () => {
  assert.throws(() => renderNumericChart({ ...chart, domain: { min: 0, max: 1 }, series: [{ label: 'A', intercept: 1e-10, slope: 0 }, { label: 'B', intercept: 0, slope: 1 }] }))
})

test('midpoint cancellation cannot manufacture a whole-interval tie', () => {
  assert.throws(() => renderNumericChart({ kind: 'linear', title: 'Precision', inputLabel: 'x', inputUnit: 'unit', valueUnit: 'unit', prefer: 'lower', preferenceBands: true,
    domain: { min: 0, max: 100 }, samples: [1, 50, 99], series: [{ label: 'Flat', intercept: 1e12, slope: 0 }, { label: 'Rising', intercept: 1e12, slope: 1e-6 }] }))
})
