import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { load } from 'cheerio'
import { createElement, type ComponentType, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import type { LearningGrowthLearner } from '../contracts'
import * as vineModel from './learningVineModel'
import { layoutLearningVine, VINE_ORIGIN, vineScrollTarget, vineSurfaceY, visibleVineWaypoints } from './learningVineModel'

const learner = (id: string, points: number): LearningGrowthLearner => ({
  learnerId: id, displayName: id, avatarUrl: null, points,
  evidenceCount: 0, acceptedCount: 0, independentCount: 0, masteryPoints: 0, waypoints: [],
})

test('the footer follows the signed-in user, including empty and unavailable growth data', () => {
  const source = readFileSync(new URL('./LearningGrowthVine.tsx', import.meta.url), 'utf8')
  const require = createRequire(import.meta.url)
  const exports: { LearningGrowthVine?: ComponentType<{ projectId: string }> } = {}
  let currentUser = 'me'
  let growth = { learners: [learner('other', 100), { ...learner('me', 3), acceptedCount: 1, evidenceCount: 2, independentCount: 1 }], loading: false, error: '' }
  const children = ({ children }: { children: ReactNode }) => children
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports,
    require: (name: string) => {
      if (name === '@/stores/auth') return { useAuth: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: currentUser } }) }
      if (name === './useLearningGrowth') return { useLearningGrowth: () => growth }
      if (name === './learningVineModel') return vineModel
      if (name === '@/components/Avatar') return { Avatar: () => null }
      if (name === '@/components/ui/popover') return { Popover: children, PopoverTrigger: children, PopoverContent: () => null }
      if (name.endsWith('.webp') || name.endsWith('.css')) return {}
      return require(name)
    },
  })
  assert.ok(exports.LearningGrowthVine)
  const render = () => load(renderToStaticMarkup(createElement(exports.LearningGrowthVine!, { projectId: 'course' })))
  const html = render()
  assert.deepEqual(html('footer dd').map((_, element) => html(element).text()).get(), ['3', '1 / 2', '1'])
  assert.equal(html('footer button, footer select').length, 0)
  assert.match(html('.vine-learner[data-selected="true"]').text(), /me（我）/)
  currentUser = 'missing'
  assert.equal(render()('footer dd').first().text(), '0')
  growth = { learners: [], loading: false, error: '' }
  assert.equal(render()('footer dd').first().text(), '0')
  growth = { ...growth, loading: true }
  assert.equal(render()('footer dd').first().text(), '—')
  growth = { ...growth, loading: false, error: '无法加载' }
  assert.equal(render()('footer dd').first().text(), '—')
})

test('scrolling keeps its position after React clears the event before a queued state update', () => {
  const source = ts.createSourceFile('LearningGrowthVine.tsx', readFileSync(new URL('./LearningGrowthVine.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let callback: ts.Expression | undefined
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'onScroll' && node.initializer && ts.isJsxExpression(node.initializer)) callback = node.initializer.expression
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(callback, 'the vine viewport handles scrolling')
  type View = { width: number; left: number }
  const updates: Array<(view: View) => View> = []
  const onScroll = runInNewContext(`(${callback.getText(source)})`, { setView: (update: (view: View) => View) => updates.push(update) })
  let view = { width: 320, left: 0 }
  for (const left of [185, 0, 59_680]) {
    const event: { currentTarget: { scrollLeft: number } | null } = { currentTarget: { scrollLeft: left } }
    onScroll(event)
    event.currentTarget = null
    assert.equal(updates.length, 1)
    view = updates.shift()!(view)
    assert.deepEqual({ ...view }, { width: 320, left })
  }
})

test('the shared origin and furthest evidence bound every viewport, even on an extremely long vine', () => {
  for (const width of [320, 900, 1280]) {
    const empty = layoutLearningVine([], width)
    assert.equal(empty.width, width)
    assert.equal(empty.x(0), VINE_ORIGIN)
    assert.equal(vineScrollTarget(Infinity, empty, width), 0)

    const layout = layoutLearningVine([learner('new', 0), learner('a', 14), learner('b', 35), learner('far', 1_000_000)], width)
    assert.equal(layout.furthest, 1_000_000)
    assert.equal(layout.width, 60_000)
    assert.equal(layout.x(-1), VINE_ORIGIN)
    assert.equal(layout.x(Infinity), layout.width - VINE_ORIGIN)
    assert.equal(vineScrollTarget(-1, layout, width), 0)
    assert.equal(vineScrollTarget(Infinity, layout, width), layout.width - width)
    assert.ok(layout.x(35) > layout.x(14))
    assert.equal(layout.groups.flatMap((group) => group.learners).length, 4)
  }
})

test('dense avatars share a group without losing members, while nearby milestones keep all contributions', () => {
  const members = Array.from({ length: 140 }, (_, index) => learner(`student-${index}`, 0))
  const layout = layoutLearningVine(members, 900)
  assert.equal(layout.groups.length, 1)
  assert.equal(layout.groups[0].x, VINE_ORIGIN)
  assert.equal(layout.groups[0].learners.length, 140)
  const points = Array.from({ length: 20 }, (_, index) => ({ position: index + 1, evidenceCount: 1, objectiveCount: 2 }))
  const merged = visibleVineWaypoints(points, 4)
  assert.equal(merged.length, 3)
  assert.equal(merged.at(-1)?.position, 20)
  assert.deepEqual(merged.reduce((total, point) => [total[0] + point.evidenceCount, total[1] + point.objectiveCount], [0, 0]), [20, 40])
  assert.equal(points[0].position, 1)
  assert.equal(vineSurfaceY(125), vineSurfaceY(1325))
  assert.ok(vineSurfaceY(0) > 110 && vineSurfaceY(0) < 310)
})
