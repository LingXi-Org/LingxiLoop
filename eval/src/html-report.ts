import type { Report } from './report.js'
import type { Span } from './telemetry.js'

const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const percent = (value: number) => `${(value * 100).toFixed(1)}%`
const bar = (value: number, label: string) => `<meter min="0" max="1" value="${Math.max(0, Math.min(1, value))}" aria-label="${escapeHtml(label)}">${percent(value)}</meter> ${percent(value)}`

export function htmlReport(report: Report, spans: Span[]): string {
  const calls = spans.filter(s => s.name === 'eval.model' || s.name === 'eval.judge')
  const roleRows = (['candidate', 'judge'] as const).map(role => {
    const usage = report.usage[role]
    const events = calls.filter(s => s.attributes['eval.role'] === role)
    const latency = events.reduce((sum, s) => sum + Number(s.attributes['eval.latency.ms'] ?? 0), 0)
    const models = [...new Set(events.map(s => String(s.attributes['gen_ai.request.model'] ?? 'unknown')))].join(', ')
    return `<tr><th scope="row">${role}</th><td>${escapeHtml(models)}</td><td>${events.length}</td><td>${usage.inputTokens}</td><td>${usage.outputTokens}</td><td>¥${usage.costCny.toFixed(6)}</td><td>${events.length ? (latency / events.length).toFixed(0) : '—'} ms</td></tr>`
  }).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Black-box Eval ${escapeHtml(report.jobId)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f6fa;color:#172033;font:15px/1.6 system-ui,sans-serif}main{max-width:1180px;margin:auto;padding:32px 20px}h1,h2{line-height:1.2}h2{font-size:20px}section{margin:24px 0;padding:24px;background:white;border:1px solid #d8dfeb;border-radius:12px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px}.card{padding:18px;background:#fff;border:1px solid #d8dfeb;border-radius:10px}.card strong{display:block;font-size:28px}.muted{color:#526076}.pass{color:#176537}.fail{color:#aa2020}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:10px;border-bottom:1px solid #e3e7ef;vertical-align:top}thead{background:#edf1f8}meter{width:140px;max-width:100%}code{overflow-wrap:anywhere}summary{cursor:pointer;font-weight:600}summary:focus-visible{outline:3px solid #315edb;outline-offset:4px}@media print{body{background:white}section,.card{break-inside:avoid}main{padding:0}}
</style></head><body><main>
<p class="muted">Independent black-box evaluation · ${escapeHtml(report.engine)}</p><h1>Agent Eval report</h1>
<p>Run <code>${escapeHtml(report.jobId)}</code> · Revision <code>${escapeHtml(report.revision)}</code></p>
<p>Suite ${escapeHtml(report.suite.id)} / ${escapeHtml(report.suite.version)} · Dataset ${escapeHtml(report.dataset.id)} / ${escapeHtml(report.dataset.version)} · Seed ${report.seed}</p>
<div class="cards"><div class="card">Release gate<strong class="${report.gate.passed ? 'pass' : 'fail'}">${report.gate.passed ? 'PASS' : 'FAIL'}</strong></div><div class="card">Score<strong>${percent(report.score)}</strong></div><div class="card">Case pass rate<strong>${percent(report.passRate)}</strong></div><div class="card">Sample p95<strong>${report.p95LatencyMs.toFixed(0)} ms</strong></div></div>
<section><h2>Gate findings</h2>${report.gate.reasons.length ? `<ul>${report.gate.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : '<p>All configured release checks passed.</p>'}<p>Baseline eligibility: ${report.eligible ? 'eligible for explicit review' : 'not eligible'}. ${report.comparison ? `Compared with <code>${escapeHtml(report.comparison.baselineId)}</code>; score delta: ${report.comparison.scoreDelta?.toFixed(4) ?? 'incompatible'}.` : 'No baseline comparison; no reference is promoted automatically.'}</p></section>
<section><h2>Candidate and Judge accounting</h2><div class="scroll"><table><thead><tr><th>Role</th><th>Model</th><th>Calls</th><th>Input tokens</th><th>Output tokens</th><th>Estimated CNY</th><th>Mean call latency</th></tr></thead><tbody>${roleRows}</tbody></table></div><p class="muted">Costs use the supplied prices. Zero configured prices produce ¥0 estimates, not evidence of free API usage. Errors can leave provider usage unknown.</p></section>
<section><h2>Case scores</h2><div class="scroll"><table><thead><tr><th>Case</th><th>Score</th><th>Result</th><th>Baseline delta</th></tr></thead><tbody>${report.cases.map(c => `<tr><th scope="row">${escapeHtml(c.id)}</th><td>${bar(c.score, c.id)}</td><td class="${c.passed ? 'pass' : 'fail'}">${c.passed ? 'PASS' : 'FAIL'}</td><td>${report.comparison?.caseDeltas?.find(d => d.id === c.id)?.delta.toFixed(4) ?? '—'}</td></tr>`).join('')}</tbody></table></div></section>
<section><h2>Graders</h2>${report.graders.map(g => `<p>${escapeHtml(g.id)}: ${bar(g.score, g.id)}</p>`).join('')}</section>
<section><h2>Sample failures</h2>${Object.keys(report.failures).length ? `<ul>${Object.entries(report.failures).map(([reason, count]) => `<li>${escapeHtml(reason)}: ${count}</li>`).join('')}</ul>` : '<p>No sample failures.</p>'}</section>
<section><details><summary>Model/Judge trace records (${calls.length})</summary><p>Showing up to 200 calls. Full trace records are in the adjacent JSONL artifact.</p><div class="scroll"><table><thead><tr><th>Role</th><th>Trace ID</th><th>Latency</th><th>Status</th></tr></thead><tbody>${calls.slice(0, 200).map(s => `<tr><td>${escapeHtml(s.attributes['eval.role'])}</td><td><code>${escapeHtml(s.traceId)}</code></td><td>${escapeHtml(s.attributes['eval.latency.ms'])} ms</td><td>${escapeHtml(s.status.message ?? s.status.code)}</td></tr>`).join('')}</tbody></table></div></details></section>
<p class="muted">No prompts, answers or credentials are included. Model calls remain stochastic; this evaluates the configured Candidate API, not an AgentOS adapter.</p></main></body></html>`
}
