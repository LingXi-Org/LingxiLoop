import assert from 'node:assert/strict'
import test from 'node:test'
import { findRemendWindowStart, normalizeMathDelimiters, tailBoundedRemend } from '@assistant-ui/react-streamdown'

// Dependency regression: paragraph-dense input must not ask indexOf to scan
// the entire remaining suffix for a delimiter on every line. This records
// requested search spans, not CPU instructions or browser frame times.
test('the formal remend boundary scan bounds delimiter searches to the input size', () => {
  const text = '已完成段落，没有数学分隔符。\n\n'.repeat(1000) + '正在 **完成'
  const original = String.prototype.indexOf
  let delimiterSearchSpan = 0
  try {
    String.prototype.indexOf = function (search, position = 0) {
      const result = original.call(this, search, position)
      if (search === '$$') delimiterSearchSpan += (result < 0 ? this.length : result + search.length) - position
      return result
    }
    assert.equal(findRemendWindowStart(text), text.lastIndexOf('正在'))
  } finally { String.prototype.indexOf = original }
  assert.ok(delimiterSearchSpan <= text.length * 4, `requested delimiter search span: ${delimiterSearchSpan}, input: ${text.length}`)
})

test('settled numeric/comparison text keeps its meaning after a new paragraph begins', () => {
  assert.equal(tailBoundedRemend('20~25 and 30~35\n\n- > 25\n\n当前 **结论'), '20\\~25 and 30\\~35\n\n- \\> 25\n\n当前 **结论**')
  const literal = 'Use the <select element.\n\nA *dangling earlier paragraph\n\n下一段 **完成'
  assert.equal(tailBoundedRemend(literal), literal + '**')
})

test('math normalization preserves code examples and emits valid multiline math boundaries', () => {
  const code = '`\\(x\\)`\n\n~~~text\n\\[a\nb\\]\n~~~'
  assert.equal(normalizeMathDelimiters(code), code)
  assert.equal(normalizeMathDelimiters('解释 \\[a\nb\\] 继续'), '解释 \n$$\na\nb\n$$\n 继续')
})
