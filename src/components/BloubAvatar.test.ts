import assert from 'node:assert/strict'
import test from 'node:test'
import { load } from 'cheerio'
import { frameMarkup } from './BloubAvatar'
import { BotEngine } from '@/lib/bloub/engine'
import { EXPRESSION_BY_ID } from '@/lib/bloub/expressions'
import { RAYON } from '@/lib/bloub/repere'
import { SHAPE_BY_ID } from '@/lib/bloub/skins'

const engine = new BotEngine(RAYON, 'orbit', SHAPE_BY_ID.values().next().value!.radii, EXPRESSION_BY_ID.values().next().value!)

test('an animation frame paints a complete, self-referencing avatar without React', () => {
  const frame = engine.sample(1.3)
  const $ = load(`<svg>${frameMarkup(frame, { uid: 'bloub-a', ink: '#3b93f0', paper: 'var(--paper)', size: 40 })}</svg>`, { xml: true })
  assert.equal($('mask#bloub-a-mask').length, 1)
  assert.equal($('mask#bloub-a-mask > path').length, 1 + frame.eyes.length)
  assert.equal($('g[mask="url(#bloub-a-mask)"] rect').attr('fill'), '#3b93f0')
  assert.equal($('path[fill="var(--paper)"]').attr('d'), frame.bodyPath)
  for (const arc of frame.arcs) assert.equal($(`linearGradient#bloub-a-${arc.id}`).length, 1)
  assert.equal($('circle, g > path').length > 0, true)
})

test('caller-provided colors stay inside their attribute', () => {
  const markup = frameMarkup(engine.sample(0), { uid: 'bloub-b', ink: '#000', paper: '"><script>alert(1)</script>', size: 24 })
  assert.equal(markup.includes('<script>'), false)
  assert.equal(load(`<svg>${markup}</svg>`, { xml: true })('script').length, 0)
})
