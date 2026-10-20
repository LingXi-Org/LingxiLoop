import { z } from 'zod'

const text = z.string().trim().min(1).max(200)
const number = z.number().finite().min(-1e12).max(1e12)
const common = { title: text, decimals: z.number().int().min(0).max(6).default(2) }
export const numericChartSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('linear'), inputLabel: text, inputUnit: text, valueUnit: text,
    prefer: z.enum(['lower', 'higher']), domain: z.object({ min: number, max: number }).strict(),
    samples: z.array(number).min(1).max(12).optional(),
    series: z.array(z.object({ label: text, intercept: number, slope: number }).strict()).min(2).max(6),
  }).strict(),
  z.object({ ...common, kind: z.literal('trend'), unit: text, periods: z.array(text).min(2).max(60),
    series: z.array(z.object({ label: text, values: z.array(number).min(2).max(60) }).strict()).min(1).max(6),
    differences: z.array(z.object({ label: text, minuend: text, subtrahend: text }).strict()).max(4).default([]),
  }).strict(),
])
export class NumericChartError extends Error {}
function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new NumericChartError('Numeric chart data is ambiguous or outside supported bounds.')
}
function finite(value: number) {
  requireValue(Number.isFinite(value) && Math.abs(value) <= 1e15)
  return Object.is(value, -0) ? 0 : value
}
function distinct(values: readonly (string | number)[]) { requireValue(new Set(values).size === values.length) }
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const colors = ['#2563eb', '#dc2626', '#15803d', '#9333ea', '#b45309', '#0891b2', '#be185d', '#4f46e5', '#525252', '#4d7c0f']
type Line = { label: string; points: Array<{ x: number; value: number }> }
type LinearSummary = { kind: 'linear'; samples: Array<{ x: number; values: Array<{ label: string; value: number }>; preferred: string[] }>;
  intersections: Array<{ left: string; right: string; x: number; value: number }> }
type TrendSummary = { kind: 'trend'; periods: string[]; series: Array<{ label: string; values: number[]; changes: Array<number | null>;
  percentageChanges: Array<number | null>; greatestIncrease: Array<{ period: string; change: number }> }> }

/** All marks, labels, tables and decisions consume these finite computed values.
 * Only typed coefficients/observations are accepted; no expressions or HTML run. */
export function renderNumericChart(input: unknown, signal?: AbortSignal): { html: string; summary: LinearSummary | TrendSummary } {
  signal?.throwIfAborted()
  const chart = numericChartSchema.parse(input)
  distinct(chart.series.map(series => series.label))
  const format = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: chart.decimals }).format(value)
  const label = (value: number) => escapeHtml(format(value))
  const cell = (value: string) => `<td>${escapeHtml(value)}</td>`
  let lines: Line[], xMin: number, xMax: number, xLabel: string, unit: string, table: string, detail: string
  let summary: LinearSummary | TrendSummary
  if (chart.kind === 'linear') {
    xMin = chart.domain.min; xMax = chart.domain.max; requireValue(xMin < xMax)
    const samples = chart.samples ?? [...new Set([xMin, (xMin + xMax) / 2, xMax])]
    distinct(samples); requireValue(samples.every(x => x >= xMin && x <= xMax))
    const evaluate = (series: typeof chart.series[number], x: number) => finite(series.intercept + series.slope * x)
    lines = chart.series.map(series => ({ label: series.label, points: [xMin, xMax].map(x => ({ x, value: evaluate(series, x) })) }))
    const rows = samples.map(x => {
      const values = chart.series.map(series => ({ label: series.label, value: evaluate(series, x) }))
      const preferredValue = (chart.prefer === 'lower' ? Math.min : Math.max)(...values.map(v => v.value))
      // Ties are computed from actual values, never from rounded display strings.
      return { x, values, preferred: values.filter(v => v.value === preferredValue).map(v => v.label) }
    })
    const intersections: LinearSummary['intersections'] = []
    for (let a = 0; a < chart.series.length; a++) for (let b = a + 1; b < chart.series.length; b++) {
      const left = chart.series[a], right = chart.series[b], slopeDifference = left.slope - right.slope
      if (slopeDifference === 0) continue
      const x = (right.intercept - left.intercept) / slopeDifference
      // A remote intersection is outside this bounded chart, not a plotted mark.
      if (!Number.isFinite(x) || x < xMin || x > xMax) continue
      const value = evaluate(left, x), other = evaluate(right, x)
      // Cancellation can make the result much smaller than its operands.
      // Bound the residual by multiply/add scale, not the cancelled result.
      const evaluationScale = Math.max(1, Math.abs(left.intercept), Math.abs(left.slope * x),
        Math.abs(right.intercept), Math.abs(right.slope * x))
      requireValue(Math.abs(value - other) <= Number.EPSILON * 16 * evaluationScale)
      intersections.push({ left: left.label, right: right.label, x, value })
    }
    summary = { kind: 'linear', samples: rows, intersections }
    xLabel = `${chart.inputLabel} (${chart.inputUnit})`; unit = chart.valueUnit
    table = `<thead><tr><th>${escapeHtml(xLabel)}</th>${chart.series.map(s => `<th>${escapeHtml(s.label)} (${escapeHtml(unit)})</th>`).join('')}<th>Preferred (${chart.prefer})</th></tr></thead><tbody>`
      + rows.map(row => `<tr>${cell(format(row.x))}${row.values.map(v => cell(format(v.value))).join('')}${cell(row.preferred.join(' = '))}</tr>`).join('') + '</tbody>'
    detail = '<ul>' + intersections.map(cross => `<li>${escapeHtml(cross.left)} = ${escapeHtml(cross.right)}: ${label(cross.x)} ${escapeHtml(chart.inputUnit)}, ${label(cross.value)} ${escapeHtml(unit)}</li>`).join('') + '</ul>'
  } else {
    distinct(chart.periods)
    requireValue(chart.series.every(series => series.values.length === chart.periods.length))
    const series = chart.series.map(series => ({ label: series.label, values: series.values.map(finite) }))
    for (const difference of chart.differences) {
      const left = chart.series.find(s => s.label === difference.minuend), right = chart.series.find(s => s.label === difference.subtrahend)
      requireValue(left && right && !series.some(s => s.label === difference.label))
      series.push({ label: difference.label, values: left.values.map((value, i) => finite(value - right.values[i])) })
    }
    const computed = series.map(series => {
      const changes = series.values.map((value, i) => i === 0 ? null : finite(value - series.values[i - 1]))
      const percentageChanges = changes.map((change, i) => change === null || series.values[i - 1] <= 0 ? null : finite(change / series.values[i - 1] * 100))
      const maximum = Math.max(0, ...changes.filter((change): change is number => change !== null))
      return { ...series, changes, percentageChanges, greatestIncrease: maximum <= 0 ? [] : changes.flatMap((change, i) => change === maximum ? [{ period: chart.periods[i], change }] : []) }
    })
    summary = { kind: 'trend', periods: chart.periods, series: computed }
    xMin = 0; xMax = chart.periods.length - 1; xLabel = 'Period (input order)'; unit = chart.unit
    lines = computed.map(series => ({ label: series.label, points: series.values.map((value, x) => ({ x, value })) }))
    table = '<thead><tr><th>Period</th><th>Series</th><th>Value (' + escapeHtml(unit) + ')</th><th>Change (' + escapeHtml(unit) + ')</th><th>Change (%)</th></tr></thead><tbody>'
      + chart.periods.map((period, i) => computed.map(series => `<tr>${cell(period)}${cell(series.label)}${cell(format(series.values[i]))}${cell(series.changes[i] === null ? '—' : format(series.changes[i]!))}${cell(series.percentageChanges[i] === null ? '—' : format(series.percentageChanges[i]!))}</tr>`).join('')).join('') + '</tbody>'
    detail = '<p>Change is from the previous value of the same series. Percent change is unavailable for a nonpositive previous value.</p><ul>'
      + computed.map(series => `<li>${escapeHtml(series.label)} — greatest positive absolute increase: ${series.greatestIncrease.length ? series.greatestIncrease.map(max => `${escapeHtml(max.period)} (+${label(max.change)} ${escapeHtml(unit)})`).join(', ') : 'none'}</li>`).join('') + '</ul>'
  }
  const values = lines.flatMap(line => line.points.map(point => point.value))
  let yMin = Math.min(...values), yMax = Math.max(...values)
  if (yMin === yMax) { const margin = Math.max(1, Math.abs(yMin) * 0.05); yMin -= margin; yMax += margin }
  const xAt = (x: number) => 64 + (x - xMin) / (xMax - xMin) * 540
  const yAt = (y: number) => 248 - (y - yMin) / (yMax - yMin) * 212
  const coordinate = (value: number) => finite(value).toFixed(3)
  const svg = `<svg viewBox="0 0 640 300" role="img" aria-label="${escapeHtml(chart.title)}"><title>${escapeHtml(chart.title)} — ${escapeHtml(unit)}</title>`
    + '<path d="M64 36V248H604" fill="none" stroke="currentColor"/>'
    + `<text x="60" y="32" text-anchor="end">${label(yMax)}</text><text x="60" y="252" text-anchor="end">${label(yMin)}</text>`
    + `<text x="64" y="270">${escapeHtml(chart.kind === 'trend' ? chart.periods[0] : format(xMin))}</text><text x="604" y="270" text-anchor="end">${escapeHtml(chart.kind === 'trend' ? chart.periods.at(-1)! : format(xMax))}</text>`
    + `<text x="334" y="292" text-anchor="middle">${escapeHtml(xLabel)}</text>`
    + lines.map((line, i) => `<path d="${line.points.map((point, j) => `${j ? 'L' : 'M'}${coordinate(xAt(point.x))} ${coordinate(yAt(point.value))}`).join(' ')}" fill="none" stroke="${colors[i]}" stroke-width="2"><title>${escapeHtml(line.label)}</title></path>`).join('')
    + (summary.kind === 'linear' ? summary.intersections.map(cross => `<circle cx="${coordinate(xAt(cross.x))}" cy="${coordinate(yAt(cross.value))}" r="4" fill="currentColor"><title>${escapeHtml(cross.left)} = ${escapeHtml(cross.right)}: ${label(cross.x)}, ${label(cross.value)} ${escapeHtml(unit)}</title></circle>`).join('') : '') + '</svg>'
  signal?.throwIfAborted()
  const html = '<style>.lx-numeric{font:14px/1.5 system-ui;color:inherit}.lx-numeric svg{width:100%;height:auto}.lx-numeric text{fill:currentColor;font:12px system-ui}.lx-numeric table{border-collapse:collapse;width:100%}.lx-numeric th,.lx-numeric td{padding:.35em .6em;text-align:left;border-bottom:1px solid #8885}.lx-numeric .table-wrap{overflow:auto;max-height:26em}</style>'
    + `<section class="lx-numeric"><h3>${escapeHtml(chart.title)}</h3>${svg}<ul>${lines.map((line, i) => `<li><span style="color:${colors[i]}">●</span> ${escapeHtml(line.label)}</li>`).join('')}</ul><div class="table-wrap"><table>${table}</table></div>${detail}<p>Display rounding: at most ${chart.decimals} decimal places. Calculations and choices use unrounded values. All values use the stated common unit.</p></section>`
  return { html, summary }
}
