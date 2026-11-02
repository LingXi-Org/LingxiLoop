import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanExcerpt, focusExcerpt, matchSentence, pageLabel, readableTitle } from './citation-excerpt'

const chunk = '- 0.2483[0, 2] + 0.5035[3, 1] [1.7587, 1.0000].\n\n[[PAGE:15]]\n12 · 自注意力与交叉注意力 Q、K、V 可以来自不同序列\n注意力公式并不要求 Q、K、V 来自同一条序列。在编码器—解码器注意力中，查询来自解码器一侧，键和值来自编码器输出。'

test('source titles read as document names with a file kind', () => {
  assert.deepEqual(readableTitle('Understanding_Attention_Handbook_01_zh-CN.pdf'), { name: 'Understanding Attention Handbook 01 zh-CN', kind: 'PDF' })
  assert.deepEqual(readableTitle('学习指南'), { name: '学习指南', kind: '' })
  assert.deepEqual(readableTitle('v1.2 release notes'), { name: 'v1.2 release notes', kind: '' })
})

test('excerpts remove page markers without deleting the preceding evidence', () => {
  const { pages, text } = cleanExcerpt(chunk, true)
  assert.deepEqual(pages, [15])
  assert.doesNotMatch(text, /\[\[PAGE/)
  assert.match(text, /0\.2483/)
  assert.equal(cleanExcerpt(chunk, true).unpagedLead, true)
  assert.match(text, /编码器输出。…$/)
  assert.deepEqual(cleanExcerpt('[[PAGE:14]]\n上一页结尾\n[[PAGE:15]]\n下一页开头', false), { pages: [14, 15], text: '上一页结尾\n\n下一页开头', unpagedLead: false })
  assert.equal(cleanExcerpt('完整的一段话。', false).text, '完整的一段话。')
  assert.equal(cleanExcerpt('[[PAGE:2]]\n导读：介绍 Q、K、V。', true).text, '导读：介绍 Q、K、V。…')
})

test('page labels name a page or a range', () => {
  assert.equal(pageLabel([]), '')
  assert.equal(pageLabel([15]), '第 15 页')
  assert.equal(pageLabel([15, 14, 15]), '第 14–15 页')
})

test('the claimed sentence is highlighted only when it clearly overlaps', () => {
  const { text } = cleanExcerpt(chunk, true)
  assert.equal(matchSentence('交叉注意力中查询来自解码器，键和值来自编码器输出', text), '在编码器—解码器注意力中，查询来自解码器一侧，键和值来自编码器输出')
  assert.equal(matchSentence('间隔复习有助于长期记忆', text), null)
  assert.equal(matchSentence('', text), null)
})

test('collapsed excerpts open one sentence before the supporting sentence', () => {
  const text = '第一句。第二句。第三句。支持的句子。后文。'
  assert.equal(focusExcerpt(text, '支持的句子'), '…第三句。支持的句子。后文。')
  assert.equal(focusExcerpt(text, '第二句'), text)
  assert.equal(focusExcerpt(text, null), text)
  for (const structured of ['导言。\n\n- 第一项。\n- 支持的句子。', '导言。\n\n## 标题\n\n第二句。支持的句子。', '导言。\n\n| 列 |\n| --- |\n| 支持的句子 |', '导言。\n\n```\n代码。\n支持的句子\n```'])
    assert.equal(focusExcerpt(structured, '支持的句子'), structured)
})

test('matched sentences survive Markdown markers, hard wraps and English full stops', () => {
  assert.equal(matchSentence('查询来自解码器一侧', '前文。\n\n- 查询来自解码器一侧\n- 其他'), '查询来自解码器一侧')
  assert.equal(matchSentence('查询来自解码器一侧', '## 查询来自解码器一侧\n\n正文'), '查询来自解码器一侧')
  assert.equal(matchSentence('查询来自解码器，键和值来自编码器输出', '前文。查询来自解码器一侧，\n键和值来自编码器输出。后文。'), '查询来自解码器一侧，\n键和值来自编码器输出')
  assert.equal(matchSentence('queries come from the decoder side', 'Attention is general. In cross attention, queries come from the decoder side. Keys use 0.5 scale.'), 'In cross attention, queries come from the decoder side')
})


test('a truncated leading support sentence survives the complete expanded excerpt', () => {
  const support = '查询来自解码器，键和值来自编码器。'
  const result = cleanExcerpt(`${support}\n[[PAGE:15]]\n后续补充。`, true)
  assert.equal(result.text, `…${support}\n\n---\n\n后续补充。…`)
  assert.equal(result.unpagedLead, true)
  assert.deepEqual(result.pages, [15])
  const sentence = matchSentence('查询来自解码器，键和值来自编码器', result.text)
  assert.equal(sentence, support.slice(0, -1))
  assert.match(focusExcerpt(result.text, sentence), /查询来自解码器，键和值来自编码器/)
  assert.equal(cleanExcerpt('[[PAGE:15]]\n后续补充。', true).unpagedLead, false)
})
