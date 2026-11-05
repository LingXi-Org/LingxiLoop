import assert from 'node:assert/strict'
import test from 'node:test'
import { slidesSummary } from '../modules/artifacts/slides-observation.js'
import { artifactSkills } from '../modules/artifacts/skills.js'
import { createArtifactTools } from '../modules/artifacts/agent-tools.js'

test('Slides current summary observes saved v4 index title and order, including an empty deck', () => {
  assert.deepEqual(slidesSummary(JSON.stringify({ v: 4, title: 'Saved title', order: ['a', 'b'], slides: ['obsolete'] })), { title: 'Saved title', slideCount: 2 })
  assert.deepEqual(slidesSummary('{"title":"Empty","order":[]}'), { title: 'Empty', slideCount: 0 })
})

test('absent or malformed saved fields remain unobservable instead of looking complete', () => {
  for (const text of [undefined, '', 'not json', 'null', '[]', '{}']) assert.deepEqual(slidesSummary(text), {})
  assert.deepEqual(slidesSummary('{"title":3,"order":["a"]}'), { slideCount: 1 })
  for (const order of [null, ['a', 'a'], [1], [''], {}]) assert.deepEqual(slidesSummary(JSON.stringify({ title: 'Title', order })), { title: 'Title' })
})

test('model sees the actual shallow resource contract and bounded incremental authoring guidance', () => {
  const slides = createArtifactTools('slides', async () => { throw new Error('not used') })
  assert.match(slides.find(tool => tool.action === 'slides.current')!.description, /top-level.*title.*slideCount/)
  assert.match(slides.find(tool => tool.action === 'slides.current')!.description, /native document.*page order/)
  assert.match(slides.find(tool => tool.action === 'slides.check')!.description, /structural.*does not verify.*browser rendering/i)
  assert.match(slides.find(tool => tool.action === 'slides.read_page')!.description, /atSeq.*sourceVersion/)
  const skill = artifactSkills.find(skill => skill.name === 'claude-slides')!.body
  assert.match(skill, /not_observed/)
  assert.match(skill, /first editable slide/i)
  assert.match(skill, /Preserve saved content and original files/i)
  assert.match(skill, /slides\.apply_ops.*expectedVersions/)
})
