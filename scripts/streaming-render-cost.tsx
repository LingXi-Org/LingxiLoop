// Opt-in synthetic CPU/markup measurement, not browser FPS or paint evidence.
// node --import tsx scripts/streaming-render-cost.tsx [component-module-path]
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'

const modulePath = process.argv[2] ?? 'src/components/assistant-ui/elements/streaming-text.tsx'
const { StreamingText } = await import(pathToFileURL(resolve(modulePath)).href)
const results = []
for (const characters of [1_000, 10_000]) {
  const text = '中文流式正文'.repeat(Math.ceil(characters / 6)).slice(0, characters)
  const tokens = Array.from(text, word => ({ word, separator: '' }))
  const samples = []
  let html = ''
  for (let sample = 0; sample < 4; sample++) {
    const start = performance.now()
    html = renderToStaticMarkup(createElement(StreamingText, { segments: [], tokens, count: tokens.length, streaming: true, inline: true }))
    if (sample > 0) samples.push(performance.now() - start)
  }
  const $ = load(html)
  if ($('[data-slot="streaming-text"]').text() !== text) throw new Error('Rendered text changed')
  results.push({ characters, inputSha256: createHash('sha256').update(text).digest('hex'),
    measured: 'SSR render + serialization; presegmented text; first sample excluded', samplesMs: samples,
    animationWords: $('[data-streaming-word]').length, freshWords: $('[data-streaming-fresh="true"]').length,
    carets: $('[data-streaming-caret]').length, htmlBytes: Buffer.byteLength(html) })
}
process.stdout.write(JSON.stringify({ node: process.version, component: modulePath, results }, null, 2) + '\n')
