import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { addLegacyMedia } from './slides-workspace-fixture.mjs'

function verifyInjection(files, firstSlidePath) {
  const original = new Map(files)
  assert.equal(addLegacyMedia(files, firstSlidePath), files)
  assert.deepEqual([...files.keys()], [...original.keys()], 'legacy injection must not create an unindexed page')
  assert.match(files.get(firstSlidePath).toString(), /<video\b/)
  assert.match(files.get(firstSlidePath).toString(), /data-video-youtube="abcdefghijk"/)
  for (const [path, bytes] of original) {
    if (path !== firstSlidePath) assert.deepEqual(files.get(path), bytes, `${path} must remain untouched`)
  }
}

test('legacy media is injected into the generated snapshot’s indexed goal page', async () => {
  const directory = new URL('../perf/issue-683/whole-01/', import.meta.url)
  const evidence = JSON.parse(await readFile(new URL('result.json', directory), 'utf8'))
  const files = new Map(await Promise.all(evidence.files.map(async ({path}) =>
    [path, await readFile(new URL(path.replaceAll('/', '-'), directory))])))
  const index = JSON.parse(files.get('project/deck.json').toString())
  const firstSlidePath = `project/slides/${index.order[0]}.html`
  assert.equal(firstSlidePath, 'project/slides/goal.html')
  verifyInjection(files, firstSlidePath)
  assert.equal(files.has('project/slides/slide-1.html'), false)
})

test('legacy media still targets slide-1 in the default benchmark fixture', () => {
  const files = new Map([
    ['project/deck.json', Buffer.from('{"order":["slide-1","slide-2"]}')],
    ['project/slides/slide-1.html', Buffer.from('<section><h1>First</h1></section>')],
    ['project/slides/slide-2.html', Buffer.from('<section><h1>Second</h1></section>')],
  ])
  verifyInjection(files, 'project/slides/slide-1.html')
})
