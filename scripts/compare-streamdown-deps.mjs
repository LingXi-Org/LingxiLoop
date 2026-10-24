// Offline comparison of two already integrity-verified official package trees.
// No network, package install, provider, DB or browser access.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [beforeDirectory, afterDirectory] = process.argv.slice(2)
if (!beforeDirectory || !afterDirectory || process.argv.length !== 4) throw new Error('Usage: node scripts/compare-streamdown-deps.mjs <baseline-package> <candidate-package>')
const load = async directory => ({
  manifest: JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8')),
  module: await import(pathToFileURL(resolve(directory, 'dist/index.js')).href),
})
const before = await load(beforeDirectory), after = await load(afterDirectory)
const hash = value => createHash('sha256').update(value).digest('hex')
const cases = [
  ['mixed', '# 标题\n\n中文 **事实** [来源](#cite-S1) 与 @同事\n\n- 条目\n\n| 列 |\n| --- |\n| 值 |\n\n正在 **生成', false],
  ['fenced-code', '正文\n\n```js\nconst value = "$5"\n\nconsole.log(value)\n```\n\n完成', false],
  ['open-fence', '前文\n\n~~~text\n字面 $$ 与 \\(x\\)\n\n仍在代码内', false],
  ['math', '前文\n\n$$\n\\frac{a}{b}\n\n继续', false],
  ['unicode', '中́文 👨‍👩‍👧‍👦 café\n\n[未完成引用](https://example.', false],
  ['prefix-escapes', '20~25 and 30~35\n\n- > 25\n\n下一段 **文字', true],
]
const comparisons = cases.map(([name, input, expectedChange]) => {
  const oldOutput = before.module.tailBoundedRemend(input), newOutput = after.module.tailBoundedRemend(input)
  assert.equal(oldOutput !== newOutput, expectedChange, name)
  assert.equal(before.module.findRemendWindowStart(input), after.module.findRemendWindowStart(input), name)
  return { name, inputSha256: hash(input), inputUtf16: input.length, outputEqual: oldOutput === newOutput,
    oldOutputSha256: hash(oldOutput), newOutputSha256: hash(newOutput),
    ...(expectedChange ? { oldOutput, newOutput } : {}) }
})
const mathInput = '`\\(x\\)`\n\n~~~text\n\\[a\nb\\]\n~~~'
const math = { inputSha256: hash(mathInput), oldOutput: before.module.normalizeMathDelimiters(mathInput),
  newOutput: after.module.normalizeMathDelimiters(mathInput) }
assert.equal(math.newOutput, mathInput)
assert.notEqual(math.oldOutput, mathInput)
const scans = [1000, 4000].map(paragraphs => {
  const input = '已完成段落，没有数学分隔符。\n\n'.repeat(paragraphs) + '最后一段'
  const inspect = module => {
    const original = String.prototype.indexOf
    let delimiterSearchSpan = 0
    try {
      String.prototype.indexOf = function (search, position = 0) {
        const end = original.call(this, search, position)
        if (search === '$$') delimiterSearchSpan += (end < 0 ? this.length : end + search.length) - position
        return end
      }
      assert.equal(module.findRemendWindowStart(input), input.lastIndexOf('最后一段'))
    } finally { String.prototype.indexOf = original }
    module.findRemendWindowStart(input)
    const samplesMs = Array.from({ length: 3 }, () => {
      const start = performance.now()
      module.findRemendWindowStart(input)
      return performance.now() - start
    })
    return { delimiterSearchSpan, samplesMs }
  }
  return { paragraphs, inputUtf16: input.length, inputSha256: hash(input), before: inspect(before.module), after: inspect(after.module) }
})
console.log(JSON.stringify({ node: process.version, before: before.manifest.version, after: after.manifest.version,
  scope: 'Public package functions; requested delimiter search spans and warm Node CPU samples only, not whole remend cost or browser FPS.', comparisons, math, scans }, null, 2))
