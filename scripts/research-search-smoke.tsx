// Run: node --import tsx scripts/research-search-smoke.tsx
// Live upstream -> search service -> persisted event projection -> official cards.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import type { RunEvent } from '@lyyzka/lingxios/ui'
import { searchResearch } from '../server/src/modules/research/search'
import { harnessToolParts } from '../src/features/chat/runtime/harness'
import { ResearchSources } from '../src/features/chat/components/ResearchSources'

const output = resolve('artifacts/research-search')
await mkdir(output, { recursive: true })
const samples = []
for (const [category, query] of [['教育', '光合作用 实验'], ['技术', 'TypeScript 中文文档'], ['资讯', '新华社 科技 新闻']]) {
  const value = await searchResearch(query, 8, AbortSignal.timeout(35_000))
  assert.ok(value.results.length > 0, `${category}: no live results`)
  assert.ok(JSON.stringify(value).length < 8000)
  const events: RunEvent[] = [
    { runId: category, seq: 1, kind: 'tool.started', stage: 'started', visibility: 'user', data: { toolCallId: `host:${category}`, name: 'research.search' } },
    { runId: category, seq: 2, kind: 'tool.completed', stage: 'completed', visibility: 'user', data: { toolCallId: `host:${category}`, result: { status: 'completed', value } } },
  ]
  const live = harnessToolParts(category, events.slice(1), harnessToolParts(category, events.slice(0, 1)))
  const replay = harnessToolParts(category, JSON.parse(JSON.stringify(events)))
  assert.deepEqual(live, replay)
  assert.deepEqual(harnessToolParts(category, events, replay), replay)
  const markup = renderToStaticMarkup(createElement(ResearchSources, { calls: replay, lifecycle: 'succeeded' }))
  assert.equal([...markup.matchAll(/data-slot="(?:citation|link-preview)"/g)].length, value.results.length)
  samples.push({ category, ...value, markup })
  console.log(`${category}: ${value.results.length} source cards; replay passed`)
}
const css = await postcss([tailwindcss()]).process(await readFile('src/styles/globals.css', 'utf8'), { from: resolve('src/styles/globals.css') })
await writeFile(resolve(output, 'styles.css'), css.css)
await writeFile(resolve(output, 'results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), samples: samples.map(({ markup: _markup, ...sample }) => sample) }, null, 2))
const mobile = samples[0].markup
const imageSource = samples.flatMap(sample => sample.results).find(source => source.image)
assert.ok(imageSource, 'live queries should provide a thumbnail for the with-image preview')
const single = renderToStaticMarkup(createElement(ResearchSources, { lifecycle: 'succeeded', calls: [{
  type: 'tool-call', toolCallId: 'host:single', toolName: 'research.search', args: {}, argsText: '{}',
  result: { status: 'completed', sources: [imageSource] },
}] }))
assert.match(single, /data-slot="link-preview"/)
assert.match(single, /<img[^>]+loading="lazy"/)
await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>国内搜索来源卡片验收</title><link rel="stylesheet" href="styles.css"><body style="margin:0;padding:24px;font-family:system-ui;background:var(--background);color:var(--foreground)"><main style="max-width:1000px;margin:auto"><h1 style="font-size:24px;margin-bottom:16px">国内搜索来源卡片验收</h1><p style="margin-bottom:24px">复现：node --import tsx scripts/research-search-smoke.tsx · 实际搜索结果，刷新回放已校验。</p><section style="width:320px;max-width:100%;margin-bottom:32px"><h2 style="font-size:18px;margin-bottom:12px">单条来源 · Link Preview</h2>${single}</section><section id="mobile" style="width:320px;max-width:100%;margin-bottom:32px"><h2 style="font-size:18px;margin-bottom:12px">移动端宽度（320px）</h2>${mobile}</section>${samples.map(sample => `<section style="max-width:640px;margin-bottom:32px"><h2 style="font-size:18px;margin-bottom:12px">${sample.category} · ${sample.results.length} 条</h2>${sample.markup}</section>`).join('')}</main></body></html>`)
console.log('Artifacts: artifacts/research-search/index.html and results.json')
