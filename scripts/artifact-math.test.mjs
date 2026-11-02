import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { adaptDesignMath } from './build-artifact-math.mjs'

test('Design preview math covers both external and inline runtime without changing archived bytes', async () => {
  const original = await readFile('third_party/baoyu-design/upstream/claude-design/scripts/editor/assets/index-DavTckY0.js','utf8')
  const adapted = adaptDesignMath(original, '/* math regression marker */')
  assert.ok(adapted.includes('supportJs:e.dcSupportSource+'))
  assert.ok(adapted.includes('/* math regression marker */'))
  assert.throws(() => adaptDesignMath('unknown upstream', 'math'), /pinned Design/)
})

test('math injection preserves replacement tokens and minified dollar identifiers literally', () => {
  const math = 'class $ {}; const a = new $; if (a instanceof $&&true) { "x".replace(/x/, "$&"); } // $$ $` $\''
  const output = adaptDesignMath('supportJs:e.dcSupportSource}', math)
  assert.equal(JSON.parse(output.slice('supportJs:e.dcSupportSource+'.length, -1)), '\n;' + math)
})

const { build } = await import('esbuild')
const bundled = await build({entryPoints:['shared/artifact-math-source.ts'],bundle:true,format:'esm',write:false})
const { inlineDollarRanges } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const sources = (text) => inlineDollarRanges(text).map(range => range.source)
test('the public Roadmap RNN and independent Attention samples are recognized as inline math', () => {
  assert.deepEqual(sources('$h_t = f(h_{t-1}, x_t)$'), ['h_t = f(h_{t-1}, x_t)'])
  const attention = String.raw`\operatorname{Attention}(Q,K,V)=\operatorname{softmax}(\frac{QK^{\mathsf T}}{\sqrt{d_k}})V`
  assert.deepEqual(sources(`$${attention}$`), [attention])
})

test('currency does not consume a subsequent formula delimiter', () => {
  assert.deepEqual(sources('Budget $5 and $10; RNN $h_t=f(x_t)$'), ['h_t=f(x_t)'])
  assert.deepEqual(sources('Budget $5; math $x^2$; $10.00'), ['x^2'])
  for (const text of ['Budget $5 and $10', '$20.50', '$5$', '$100 USD$', '$5 (USD)$', '$-5$', '$-10.00$', '$ prices $', '$hello world$', '$x']) assert.deepEqual(sources(text), [], text)
  assert.deepEqual(sources('$2^n$ and $x$/$y$'), ['2^n', 'x', 'y'])
})

test('backticks, escaped dollars and explicit math delimiters keep their source boundary', () => {
  const text = String.raw`\$x$; \`$y$\`; $$\text{$z$}$$; \(\text{$q$}\); $x_{\text{a$b}}$`.replaceAll('\\`', '`')
  assert.deepEqual(sources(text), [String.raw`x_{\text{a$b}}`])
})
