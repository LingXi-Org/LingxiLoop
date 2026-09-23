// node --env-file=PATH scripts/benchmark-first-body.mjs OUTPUT.json [samples-per-profile=100]
// Direct provider baseline only: this does not measure browser or product latency.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'

const output = process.argv[2], count = Number(process.argv[3] ?? 100)
assert.ok(output && Number.isSafeInteger(count) && count >= 1 && count <= 1000)
const base = new URL(process.env.OPENAI_BASE_URL ?? 'https://api.siliconflow.cn/v1')
assert.equal(base.hostname, 'api.siliconflow.cn', 'this benchmark is pinned to SiliconFlow')
assert.ok(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is required')
const model = 'deepseek-ai/DeepSeek-V4-Flash'
const prompts = ['用一句话解释什么是缓存。', '请把“Good morning”翻译成中文。', '用一句话介绍太阳系。',
  '给我一句鼓励学习的话。', '“简洁”的反义词是什么？', '写一句礼貌的道谢。', '解释“循序渐进”的意思，一句话即可。',
  '给读书小组起一个简短的名字。', '用一句话区分比喻与拟人。', '请把“我们明天见”翻译成英文。']
const samples = [], startedAt = new Date().toISOString()
const quantiles = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  return { count: sorted.length, p50: sorted[Math.ceil(sorted.length * .5) - 1] ?? null,
    p95: sorted[Math.ceil(sorted.length * .95) - 1] ?? null }
}
async function run(index, profile) {
  const began = performance.now(), row = { index, profile, caseId: `ordinary-${index % prompts.length}` }
  let reader
  try {
    const response = await fetch(`${base.href.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(90_000), body: JSON.stringify({ model, stream: true, stream_options: { include_usage: true },
        max_tokens: 1024, enable_thinking: profile === 'deep', ...(profile === 'deep' ? { reasoning_effort: 'high' } : {}),
        messages: [{ role: 'user', content: prompts[index % prompts.length] }] }),
    })
    row.headersMs = performance.now() - began
    row.httpStatus = response.status
    if (!response.ok) { await response.body?.cancel(); row.failure = 'http'; return row }
    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = '', done = false, characters = 0
    while (!done) {
      const next = await reader.read()
      if (next.done) break
      pending += decoder.decode(next.value, { stream: true })
      assert.ok(pending.length < 1_000_000, 'provider frame exceeds limit')
      let end
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end).trim(); pending = pending.slice(end + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') { done = true; break }
        const event = JSON.parse(data), delta = event.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta.length) { row.firstBodyMs ??= performance.now() - began; characters += delta.length }
        if (event.choices?.[0]?.finish_reason) row.finishReason = event.choices[0].finish_reason
        if (event.usage) row.usage = event.usage
      }
    }
    row.characters = characters
    row.completeMs = performance.now() - began
    if (!done || row.firstBodyMs === undefined || row.finishReason !== 'stop') row.failure = 'incomplete'
  } catch (error) { row.failure = error instanceof Error ? error.name : 'unknown' }
  finally { await reader?.cancel().catch(() => {}); reader?.releaseLock() }
  return row
}
await mkdir(dirname(output), { recursive: true })
for (let index = 0; index < count; index++) {
  // Paired profiles share time-of-day and transport conditions. Concurrency is bounded at two.
  samples.push(...await Promise.all(['deep', 'fast'].map(profile => run(index, profile))))
  if ((index + 1) % 10 === 0) console.log(JSON.stringify({ completedPerProfile: index + 1, failed: samples.filter(row => row.failure).length }))
  await writeFile(output, JSON.stringify({ scope: 'provider-direct', startedAt, model,
    datasetSha256: createHash('sha256').update(JSON.stringify(prompts)).digest('hex'),
    summary: Object.fromEntries(['deep', 'fast'].map(profile => {
      const rows = samples.filter(row => row.profile === profile)
      return [profile, { total: rows.length, failures: rows.filter(row => row.failure).length,
        firstBodyMs: quantiles(rows.map(row => row.firstBodyMs)), completeMs: quantiles(rows.map(row => row.completeMs)) }]
    })), samples }, null, 2))
}
