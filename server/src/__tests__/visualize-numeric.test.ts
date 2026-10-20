import assert from 'node:assert/strict'
import test from 'node:test'
import { renderNumericChart } from '../im/visualize-numeric.js'

const linear = {
  kind: 'linear', title: 'Plan comparison', inputLabel: 'Uses', inputUnit: 'times', valueUnit: 'cost', prefer: 'lower',
  domain: { min: 0, max: 100 }, samples: [0, 20, 50, 100],
  series: [{ label: 'A', intercept: 100, slope: 2 }, { label: 'B', intercept: 0, slope: 5 }],
}
const trend = { kind: 'trend', title: 'Trend', unit: 'units', periods: ['1', '2', '3', '4', '5', '6'],
  series: [{ label: 'Revenue', values: [12, 18, 17, 25, 31, 40] }, { label: 'Cost', values: [8, 11, 12, 15, 17, 20] }],
  differences: [{ label: 'Profit', minuend: 'Revenue', subtrahend: 'Cost' }],
}
test('linear chart shares unrounded values across intersections, choices and rendered labels', () => {
  const result = renderNumericChart(linear)
  assert.equal(result.summary.kind, 'linear')
  if (result.summary.kind !== 'linear') return
  const cross = result.summary.intersections[0]
  assert.ok(Math.abs(cross.x - 100 / 3) < 1e-12)
  assert.ok(Math.abs(cross.value - 500 / 3) < 1e-12)
  assert.deepEqual(result.summary.samples[1].preferred, ['B'])
  assert.deepEqual(result.summary.samples[2].preferred, ['A'])
  assert.match(result.html, /166\.67/)
  assert.match(result.html, /100/)
  assert.doesNotMatch(result.html, /<script|\son\w+=|https?:|href=/i)
})
test('general coefficients, higher preference, ties, parallel lines and display rounding', () => {
  const result = renderNumericChart({ ...linear, prefer: 'higher', decimals: 0, domain: { min: -2, max: 4 }, samples: [-1, 0, 1],
    series: [{ label: 'One', intercept: 0.001, slope: 0 }, { label: 'Two', intercept: 0, slope: 0.001 }] })
  assert.equal(result.summary.kind, 'linear')
  if (result.summary.kind !== 'linear') return
  assert.deepEqual(result.summary.samples.map(s => s.preferred), [['One'], ['One'], ['One', 'Two']])
  assert.equal(result.summary.intersections[0].x, 1)
  const parallel = renderNumericChart({ ...linear, series: [{ label: 'One', intercept: 2, slope: 3 }, { label: 'Two', intercept: 7, slope: 3 }] })
  assert.equal(parallel.summary.kind, 'linear')
  if (parallel.summary.kind === 'linear') assert.deepEqual(parallel.summary.intersections, [])
})
test('intersection evaluation permits finite cancellation without rounding decisions', () => {
  const result = renderNumericChart({ ...linear, domain: { min: -2, max: 2 }, samples: [-1, 0, 1],
    series: [{ label: 'A', intercept: 1000, slope: 1000 }, { label: 'B', intercept: 0, slope: 1 }] })
  assert.equal(result.summary.kind, 'linear')
  if (result.summary.kind !== 'linear') return
  assert.ok(Math.abs(result.summary.intersections[0].x + 1000 / 999) < 1e-12)
  assert.ok(Math.abs(result.summary.intersections[0].value + 1000 / 999) < 1e-12)
  assert.deepEqual(result.summary.samples[0].preferred, ['B'])
})
test('trend differences, absolute changes, percentages and extrema use each actual series', () => {
  const result = renderNumericChart(trend)
  assert.equal(result.summary.kind, 'trend')
  if (result.summary.kind !== 'trend') return
  const profit = result.summary.series[2]
  assert.deepEqual(profit.values, [4, 7, 5, 10, 14, 20])
  assert.deepEqual(profit.changes, [null, 3, -2, 5, 4, 6])
  assert.deepEqual(profit.greatestIncrease, [{ period: '6', change: 6 }])
  assert.equal(profit.percentageChanges[3], 100)
  assert.match(result.html, /Profit/)
  assert.match(result.html, /-2/)
})
test('nonpositive previous values have no percent rate; tied increases and decreases are retained', () => {
  const result = renderNumericChart({ ...trend, periods: ['a', 'b', 'c', 'd'], differences: [],
    series: [{ label: 'X', values: [-1, 0, 2, 4] }, { label: 'Y', values: [4, 3, 2, 1] }] })
  assert.equal(result.summary.kind, 'trend')
  if (result.summary.kind !== 'trend') return
  assert.deepEqual(result.summary.series[0].percentageChanges, [null, null, null, 100])
  assert.deepEqual(result.summary.series[0].greatestIncrease, [{ period: 'c', change: 2 }, { period: 'd', change: 2 }])
  assert.deepEqual(result.summary.series[1].greatestIncrease, [])
})
test('ambiguous, missing, unbounded and nonfinite inputs fail before rendering', () => {
  for (const bad of [
    { ...linear, samples: [20, 20] }, { ...linear, samples: [101] }, { ...linear, domain: { min: 1, max: 1 } },
    { ...linear, series: [{ label: 'A', intercept: NaN, slope: 2 }, linear.series[1]] },
    { ...linear, series: [{ label: 'A', intercept: 0, slope: 1e12 }, linear.series[1]], domain: { min: 0, max: 1e12 } },
    { ...trend, periods: ['same', 'same'] }, { ...trend, series: [{ label: 'A', values: [1] }] },
    { ...trend, series: [trend.series[0], trend.series[0]] },
    { ...trend, differences: [{ label: 'X', minuend: 'missing', subtrahend: 'Cost' }] },
    { ...trend, series: [{ label: 'X', values: [1, 2, 3, 4, 5, Infinity] }] },
  ]) assert.throws(() => renderNumericChart(bad))
})
test('all untrusted labels and units are escaped and remain inert SVG/HTML text', () => {
  const attack = '</script><img src=x onerror="alert(1)"><svg><a href="https://evil.invalid">&'
  const result = renderNumericChart({ ...linear, title: attack, inputLabel: attack, inputUnit: attack, valueUnit: attack,
    series: [{ label: attack, intercept: 3, slope: 2 }, linear.series[1]] })
  assert.ok(result.html.includes('&lt;/script&gt;'))
  assert.ok(result.html.includes('&quot;'))
  assert.ok(!result.html.includes(attack))
  assert.doesNotMatch(result.html, /<script|<img|<a\s|onerror="alert/i)
})
test('abort before numeric work is preserved rather than converted into a successful chart', () => {
  const controller = new AbortController(); controller.abort()
  assert.throws(() => renderNumericChart(linear, controller.signal), { name: 'AbortError' })
})
