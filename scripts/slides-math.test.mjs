import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
const bundled = await build({ entryPoints: ['third_party/baoyu-design/slides-source/math.js'], bundle: true, format: 'esm', write: false })
const { slideMathRuns, slideHasMath, isCodeText } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))

const math = text => slideMathRuns([{ text }]).filter(run => run.mathHtml)

test('Slides renders delimited inline, display, matrix and aligned math with the installed KaTeX', () => {
  for (const text of [String.raw`中文 \(x_i^2+\frac{1}{2}+\sqrt{x}\) English`,
    String.raw`$$\sum_{i=1}^n i$$`, String.raw`\[\begin{pmatrix}a&b\\c&d\end{pmatrix}\]`,
    String.raw`\[\begin{aligned}a&=b+c\\d&=e\end{aligned}\]`, '$x^2$']) {
    const runs = math(text)
    assert.equal(runs.length, 1, text)
    assert.match(runs[0].mathHtml, /class="katex/)
    assert.match(runs[0].mathHtml, /<math/)
  }
})

test('math keeps original text and rich marks across a formula, including line breaks', () => {
  const input = [{ text: 'Before \\(\\frac', bold: true }, { text: '{1}{2}\\) after', italic: true }]
  const output = slideMathRuns(input)
  assert.equal(output.map(run => run.text).join(''), input.map(run => run.text).join(''))
  assert.equal(output[0].bold, true)
  assert.equal(output.at(-1).italic, true)
  assert.equal(output.filter(run => run.mathHtml).length, 1)
  assert.equal(math('\\[\\begin{aligned}x&=1\\\\\ny&=2\\end{aligned}\\]').length, 1)
})

test('amounts, escaped delimiters, code and unmarked TeX stay literal', () => {
  for (const text of ['$5 and $10', '$5–$10', '$10.00', String.raw`\$x^2$`,
    String.raw`\frac{1}{2}`, String.raw`\(unfinished`, '`$x^2$`', '```tex\n$$x^2$$\n```']) {
    assert.deepEqual(slideMathRuns([{ text }]), [{ text }], text)
  }
})

test('an amount before explicit math cannot consume its delimiters', () => {
  for (const text of [String.raw`Price $5, formula \(x^2\)`, 'Price $5, formula $$x^2$$', 'Price $5, formula $x^2$']) {
    const output = slideMathRuns([{ text }])
    assert.equal(output.filter(run => run.mathHtml).length, 1)
    assert.equal(output.map(run => run.text).join(''), text)
    assert.equal(output.find(run => run.mathHtml).mathDisplay, text.endsWith('$$'))
  }
})

test('negative prices and prose stay literal without swallowing later Slides formulas', () => {
  for (const text of ['$-5$', '$-10.00$', '$hello world$']) {
    assert.deepEqual(slideMathRuns([{ text }]), [{ text }], text)
  }
  for (const prefix of ['Budget $-5; formula ', 'Budget $-5 and $-10; formula ', '$hello world$; formula ']) {
    for (const formula of ['$x^2$', String.raw`\(x^2\)`, '$$x^2$$']) {
      const text = prefix + formula
      const output = slideMathRuns([{ text }])
      assert.equal(output.filter(run => run.mathHtml).length, 1, text)
      assert.equal(output.find(run => run.mathHtml).text, formula, text)
      assert.equal(output.map(run => run.text).join(''), text)
    }
  }
  for (const text of ['$-2^n$', '$h_t = f(h_{t-1}, x_t)$']) assert.equal(math(text).length, 1, text)
})

test('invalid math and untrusted commands stay readable without executing HTML', () => {
  const invalid = slideMathRuns([{ text: String.raw`\(\notACommand{x}\)` }])
  assert.equal(invalid[0].mathHtml, undefined)
  assert.equal(invalid[0].text, String.raw`\(\notACommand{x}\)`)
  for (const text of [String.raw`\(\href{javascript:alert(1)}{x}\)`,
    String.raw`\(\htmlClass{evil}{x}\)`, String.raw`\(\includegraphics{https://evil.test/x}\)`]) {
    assert.doesNotMatch(slideMathRuns([{ text }]).map(run => run.mathHtml ?? '').join(''), /href=|src=|class="evil"/)
  }
})

test('existing monospace model values stay code and tables participate in formula export', () => {
  for (const fontFamily of ['mono', { family: 'Courier New', fallback: 'mono' }]) {
    const node = { kind: 'text', text: String.raw`\(x_i^2\)`, style: { fontFamily } }
    assert.equal(isCodeText(node), true)
    assert.equal(slideHasMath({ frames: [{ node }] }), false)
  }
  assert.equal(slideHasMath({ frames: [{ node: { kind: 'table', rows: [[String.raw`\(x^2\)`]] } }] }), true)
})

test('ordinary text does not request math; first use coalesces and a failed chunk can retry', async () => {
  const loading = await build({ entryPoints: ['third_party/baoyu-design/slides-source/math-loading.js'], bundle: true, format: 'esm', write: false })
  const { createSlideMathLoader, hasSlideMathSource } = await import('data:text/javascript;base64,' + Buffer.from(loading.outputFiles[0].text).toString('base64'))
  for (const text of ['Ordinary text', '$5 and $10', String.raw`\$x^2$`, '`$x^2$`']) assert.equal(hasSlideMathSource([{ text }]), false, text)
  for (const text of ['$x^2$', String.raw`\(x_i^2\)`, '$$x$$']) assert.equal(hasSlideMathSource([{ text }]), true, text)
  let calls = 0, finish
  const module = { slideMathRuns, installMathStyles() {} }
  const loader = createSlideMathLoader(() => {
    calls++
    return calls === 1 ? Promise.reject(Error('temporarily offline')) : new Promise(resolve => { finish = () => resolve(module) })
  })
  let notifications = 0
  const unsubscribe = loader.subscribe(() => { notifications++ })
  assert.equal(calls, 0)
  assert.equal(loader.current(), null)
  await assert.rejects(loader.load(), /offline/)
  const first = loader.load(), second = loader.load()
  assert.equal(first, second)
  finish()
  assert.equal(await first, module)
  assert.equal(loader.current(), module)
  assert.equal(notifications, 1, 'all formula readers observe the shared retry')
  unsubscribe()
  assert.equal(await loader.load(), module)
  assert.equal(calls, 2)
})

test('feature dependency preparation coalesces and a failed fetch never starts a cached module failure', async () => {
  const { prepareEditorFeature } = await import('../third_party/baoyu-design/slides-source/feature-resources.js')
  const priorDocument = globalThis.document, priorFetch = globalThis.fetch
  let calls = 0
  globalThis.document = { querySelector: selector => selector.startsWith('meta')
    ? { content: JSON.stringify({ math: ['math-SYNTHETIC.js'] }) }
    : { src: 'https://static.test/artifact-editor/slides-assets/editor-SYNTHETIC.js' } }
  globalThis.fetch = async (url, options) => {
    calls++
    assert.equal(String(url), 'https://static.test/artifact-editor/slides-assets/math-SYNTHETIC.js')
    assert.equal(options.credentials, 'omit')
    return new Response('synthetic module', { status: calls === 1 ? 503 : 200 })
  }
  try {
    await assert.rejects(prepareEditorFeature('math'), /重试/)
    const first = prepareEditorFeature('math'), second = prepareEditorFeature('math')
    assert.equal(first, second)
    await first
    await prepareEditorFeature('math')
    assert.equal(calls, 2)
  } finally {
    if (priorDocument === undefined) delete globalThis.document
    else globalThis.document = priorDocument
    globalThis.fetch = priorFetch
  }
})
