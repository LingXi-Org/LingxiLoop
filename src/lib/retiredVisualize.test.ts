import assert from 'node:assert/strict'
import test from 'node:test'
import { legacyVisualizeReferences } from '../../shared/retired-visualize.js'

test('historical references recognize all saved wire forms without changing the body', () => {
  const body = '前文\n::visualize{path="/work/first-page.html" title="原始页" mode="wide"}\n中间\n::visualize{"path":"/work/second-page.html"}\nvisualize{"path":"/work/third-page.html"}\n后文'
  const references = legacyVisualizeReferences(body)
  assert.deepEqual(references.map(reference => reference.path), ['/work/first-page.html','/work/second-page.html','/work/third-page.html'])
  assert.equal(references[0].title, '原始页')
  for (const reference of references) assert.equal(body.slice(reference.start, reference.end), reference.raw)
})

test('code, incomplete or unsafe references remain inert text rather than archive targets', () => {
  for (const body of [
    '`::visualize{"path":"/work/code.html"}`',
    '```\n::visualize{"path":"/work/code.html"}\n```',
    '<pre>::visualize{"path":"/work/code.html"}</pre>',
    '::visualize{"path":',
    '::visualize{"path":"relative.html"}',
    '::visualize{"path":"/work/../secret.html"}',
    '::visualize{"path":"javascript:alert.html"}',
    '::visualize{"path":"/work/file.html","script":"run"}',
    'visualize{"path":"/work/file.html"}',
  ]) assert.deepEqual(legacyVisualizeReferences(body), [], body)
})

test('source slices preserve historical reference bytes once across native segment boundaries', async () => {
  const { answerDisplaySlice } = await import('./answerSegmentDisplay.js')
  const body = '前文\n\n::visualize{"path":"/work/diagram.html"}\n\n后文'
  const boundary = body.indexOf('diagram') + 3
  const parts = [body.slice(0, boundary), body.slice(boundary)].map((text, index) => ({
    type: 'text', text, providerMetadata: { lingxiloop: { answerSegment: { version: 3, messageId: 'source',
      segmentId: `segment-${index}`, partId: `part-${index}`, start: index === 0 ? 0 : boundary, end: index === 0 ? boundary : body.length } } },
  }))
  const slices = parts.map((_, index) => answerDisplaySlice(parts, index, [])!)
  assert.equal(slices.map(slice => slice.text).join(''), body)
  assert.equal(slices[1].offset, slices[0].text.length)
  assert.equal(slices.flatMap(slice => legacyVisualizeReferences(slice.text)).length, 1)
})
