import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createNode, createPage } from '../../../../shared/artifact-document'
import {
  executableRootIds,
  navigationTransition,
  transitionTiming,
  transitionRect,
} from './presentation-transition'

const reference = JSON.parse(
  readFileSync(
    new URL('../../../../docs/evidence/issue-707/source-slides-transitions.json', import.meta.url),
    'utf8',
  ),
)
test('animation timing matches the immutable upstream browser records in both directions', () => {
  assert.equal(reference.sourceCommit, '016b39d7fdcc30bfacee31ea5541498ac53921c6')
  for (const row of reference.cases)
    for (const direction of ['forward', 'backward'])
      for (const animation of row[direction])
        assert.deepEqual(transitionTiming(row.kind), animation.timing)
  const magic = reference.cases
    .find((row: { kind: string }) => row.kind === 'magic')
    .forward.find((row: { frames: Keyframe[] }) => row.frames[0].left)
  assert.deepEqual(
    transitionRect({ left: 64, top: 40, width: 1152, height: 76 }, { left: 0, top: 0 }, 1),
    magic.frames[0],
  )
  assert.deepEqual(
    transitionRect({ left: 164, top: 40, width: 1152, height: 76 }, { left: 0, top: 0 }, 1),
    magic.frames[1],
  )
})

test('forward uses the outgoing slide; backward uses the earlier slide, including legacy slide values', () => {
  const a = { ...createPage('a'), transition: 'magic' as const },
    b = { ...createPage('b'), transition: 'push' as const }
  assert.equal(navigationTransition(a, b, false, false), 'magic')
  assert.equal(navigationTransition(b, a, true, false), 'magic')
  assert.equal(navigationTransition(a, b, false, true), null)
  assert.equal(navigationTransition({ ...a, transition: 'none' }, b, false, false), null)
  assert.equal(navigationTransition({ ...a, transition: 'slide' }, b, false, false), 'push')
  assert.deepEqual(transitionTiming('magic'), {
    duration: 480,
    easing: 'cubic-bezier(0.33, 0.01, 0.2, 1)',
    fill: 'forwards',
  })
  assert.equal(transitionTiming('fade').duration, 320)
  assert.equal(transitionTiming('push').duration, 420)
})
test('magic geometry is relative to each slide and independent of preview scaling', () => {
  assert.deepEqual(
    transitionRect({ left: 170, top: 95, width: 100, height: 50 }, { left: 120, top: 70 }, 0.5),
    {
      left: '100px',
      top: '50px',
      width: '200px',
      height: '100px',
      right: 'auto',
      bottom: 'auto',
      transform: 'none',
    },
  )
})

test('目标组后续加载的隔离内容也只能保留一个真实执行根', () => {
  const page = createPage('target')
  const group = createNode('group', 'root'),
    nested = { ...createNode('group', 'nested'), parentId: 'root' },
    embed = { ...createNode('embed', 'program'), parentId: 'nested' },
    image = createNode('image', 'image')
  page.nodes = { root: group, nested, program: embed, image }
  page.nodeOrder = ['root', 'nested', 'program', 'image']
  assert.deepEqual([...executableRootIds(page)], ['root'])
  const earlier = {
    ...page,
    nodes: { root: group, nested, image },
    nodeOrder: ['root', 'nested', 'image'],
  }
  assert.equal(executableRootIds(earlier).size, 0)
})
