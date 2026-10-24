import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { OfficeParser, OfficeWarningType } from 'officeparser'
import { extractHomeworkPresentationText, HomeworkPresentationMaterialError } from '../modules/learning/homework-presentation.js'

const fixture = (name: string) => readFile(new URL(`./fixtures/homework-presentations/${name}`, import.meta.url))

test('PPTX extracts actual reordered slide text, Chinese, tables and speaker notes', async () => {
  const text = await extractHomeworkPresentationText(await fixture('material.pptx'), 'pptx')
  assert.match(text, /独立说明加法/)
  assert.match(text, /Input 输入/)
  assert.match(text, /Output 输出/)
  assert.match(text, /Synthetic speaker notes 说明推理/)
  assert.ok(text.indexOf('Second slide 第二页') < text.indexOf('Synthetic material 合成课程'))
  assert.doesNotMatch(text, /<a:t>|PK\x03\x04/)
})

test('image-only PPTX yields no readable text or generated image placeholders', async () => {
  assert.equal((await extractHomeworkPresentationText(await fixture('image-only.pptx'), 'pptx')).trim(), '')
})

test('legacy binary PPT explicitly requests conversion instead of decoding binary as text', async () => {
  await assert.rejects(extractHomeworkPresentationText(await fixture('material.ppt'), 'ppt'), error => {
    assert.ok(error instanceof HomeworkPresentationMaterialError)
    assert.equal(error.contentStatus, 'unsupported')
    assert.match(error.message, /PPTX/)
    return true
  })
})

test('malformed and truncated PPTX cannot be reported as successfully read', async () => {
  for (const bytes of [Buffer.from('Synthetic text is not a presentation'), (await fixture('material.pptx')).subarray(0, 200)]) {
    await assert.rejects(extractHomeworkPresentationText(bytes, 'pptx'), HomeworkPresentationMaterialError)
  }
})

test('PPTX limits input bytes and expanded archive bytes before accepting text', async () => {
  for (const bytes of [new Uint8Array(16 * 1024 * 1024 + 1), await fixture('expanded-limit.pptx')]) {
    await assert.rejects(extractHomeworkPresentationText(bytes, 'pptx'), error => {
      assert.ok(error instanceof HomeworkPresentationMaterialError)
      assert.equal(error.contentStatus, 'too_large')
      return true
    })
  }
})

test('cancellation keeps the original operational abort rather than a material error', async () => {
  const controller = new AbortController(), reason = new Error('synthetic cancellation')
  controller.abort(reason)
  await assert.rejects(extractHomeworkPresentationText(await fixture('material.pptx'), 'pptx', controller.signal), error => error === reason)
})

test('upstream content omissions fail closed even when the parser returns an AST', async t => {
  const original = OfficeParser.parseOffice.bind(OfficeParser)
  t.mock.method(OfficeParser, 'parseOffice', async (bytes: Parameters<typeof OfficeParser.parseOffice>[0], config: Parameters<typeof OfficeParser.parseOffice>[1]) => {
    assert.ok(config && typeof config !== 'function')
    config.onWarning?.({ type: 'warning', code: OfficeWarningType.CONTENT_PART_NOT_READ, message: 'synthetic unreadable part' })
    return original(bytes, config)
  })
  await assert.rejects(extractHomeworkPresentationText(await fixture('material.pptx'), 'pptx'), error => {
    assert.ok(error instanceof HomeworkPresentationMaterialError)
    assert.equal(error.contentStatus, 'failed')
    return true
  })
})

test('unexpected parser or dependency failures remain operational and retryable', async t => {
  const failure = new Error('synthetic parser runtime failure')
  t.mock.method(OfficeParser, 'parseOffice', async () => { throw failure })
  await assert.rejects(extractHomeworkPresentationText(await fixture('material.pptx'), 'pptx'), error => error === failure)
})
