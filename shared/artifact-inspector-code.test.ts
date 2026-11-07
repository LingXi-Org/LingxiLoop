import assert from 'node:assert/strict'
import test from 'node:test'
import { parseInspectorCode, serializeInspectorCode } from './artifact-inspector-code'

test('代码面板保留逐行样式、中文属性和自定义变量；属性单独成组', () => {
  const result = parseInspectorCode('position: relative;\nwidth: 1920px;\nbackgroundColor: #faf8f4;\n--MainColor: red;\n@data-label: 中文测试;\n@xlink:href: #paint')
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.entries, [
    { name: 'position', value: 'relative' }, { name: 'width', value: '1920px' },
    { name: 'background-color', value: '#faf8f4' }, { name: '--MainColor', value: 'red' },
    { name: '@data-label', value: '中文测试' }, { name: '@xlink:href', value: '#paint' },
  ])
  assert.equal(serializeInspectorCode(result.entries), 'position: relative;\nwidth: 1920px;\nbackground-color: #faf8f4;\n--MainColor: red;\n\n@data-label: 中文测试\n@xlink:href: #paint')
})

for (const value of [
  'calc(100% - 12px)', 'rgba(12, 24, 36, .5)', 'linear-gradient(90deg, red, blue)',
  'url("data:image/png;base64,abcd;")', 'url(data:image/png;base64,abcd)',
  '"有冒号: 和分号;的文字"', '{{ spacing }}px', '{{ "文字;" }}',
  'var(--色彩, rgb(12 24 36 / 50%))', '10px /* 行内说明 */', 'unknown-browser-value',
  '"网址示例 url(a b)"', 'url("https://example.test/?note=url(a b)")',
]) test(`完整样式值可读写：${value}`, () => {
  const result = parseInspectorCode(`--sample: ${value};`)
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.entries[0].value, value)
})

test('空行、单行注释和空属性值按原版声明格式读取', () => {
  const result = parseInspectorCode('\n// 说明\n/* 说明 */\n@hidden:\ncolor:red')
  assert.deepEqual(result, { ok: true, entries: [{ name: '@hidden', value: '' }, { name: 'color', value: 'red' }] })
})

for (const [line, message] of [
  ['width', '格式'], ['width:', '属性值'], ['width: calc(100%', '闭合'],
  ['width: 2px)', '括号'], ['content: "未结束', '闭合'], ['color: red; width: 2px', '分号'],
  ['color: red;;', '分号'], ['width: {{ value; other }}', '分号'],
  ['background: url(a b.png)', '引号'], ['content: "<div>"', '标签'],
  ['/* 未结束', '注释'], ['color: red\nCOLOR: blue', '重复'],
]) test(`错误定位到实际行并使用中文：${line}`, () => {
  const result = parseInspectorCode(`// 前置说明\n${line}`)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.line, line.includes('\n') ? 3 : 2)
  assert.ok(result.message.includes(message), result.message)
})

test('未改动的旧值可保留；新增同值仍需校验，结构错误始终拒绝', () => {
  const previous = new Map([['background', 'url(a b.png)']])
  assert.equal(parseInspectorCode('background: url(a b.png)', previous).ok, true)
  assert.equal(parseInspectorCode('background: url(a b.png)').ok, false)
  assert.equal(parseInspectorCode('width: calc(100%', new Map([['width', 'calc(100%']])).ok, false)
})
