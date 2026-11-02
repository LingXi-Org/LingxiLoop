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
