import assert from 'node:assert/strict'
import { after, mock, test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import * as React from 'react'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import type { Homework } from './contracts'

// Exercise the owning component's effects and async handlers without a browser.
// The shared controls are represented by named leaves; layout/physical keyboard
// focus and the browser's native scroll anchoring remain separate acceptance.
type Slot = { value?: unknown; deps?: readonly unknown[]; cleanup?: () => void }
let slots: Slot[] = [], cursor = 0, effects: (() => void)[] = []
const changed = (a: readonly unknown[] | undefined, b: readonly unknown[]) => !a || a.length !== b.length || a.some((item, i) => !Object.is(item, b[i]))
mock.module('react', { namedExports: {
  ...React,
  useId: () => { const i = cursor++; return (slots[i] ??= { value: `homework-${i}` }).value },
  useRef: (initial: unknown) => { const i = cursor++; return (slots[i] ??= { value: { current: initial } }).value },
  useState: (initial: unknown) => {
    const i = cursor++; slots[i] ??= { value: initial }
    return [slots[i].value, (next: unknown) => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next }]
  },
  useCallback: (fn: unknown, deps: readonly unknown[]) => {
    const i = cursor++
    if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn, deps }
    return slots[i].value
  },
  useEffect: (fn: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const i = cursor++
    if (!slots[i] || changed(slots[i].deps, deps)) {
      slots[i]?.cleanup?.(); slots[i] = { deps }
      effects.push(() => { slots[i].cleanup = fn() })
    }
  },
} })
mock.module('@assistant-ui/react', { namedExports: { useAuiState: () => false } })
for (const [path, names] of [
  ['@/components/ui/card', ['Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardContent']],
  ['@/components/ui/badge', ['Badge']], ['@/components/ui/button', ['Button']],
  ['@/components/ui/input', ['Input']], ['@/components/ui/label', ['Label']],
  ['@/components/assistant-ui/elements/collapsible-root', ['CollapsibleRoot', 'CollapsibleTrigger', 'CollapsibleContent']],
  ['./HomeworkSuggestions', ['HomeworkSuggestions']], ['./HomeworkValidation', ['HomeworkValidation']],
  ['../forum/ForumBody', ['ForumBody']],
] as const) mock.module(path, { namedExports: Object.fromEntries(names.map(name => [name, name])) })
mock.module('../forum/ForumContentFields', { namedExports: {
  ForumContentFields: 'ForumContentFields', ForumFiles: 'ForumFiles', contentLinks: (value: string) => value.split('\n').filter(Boolean),
} })
const forumViews: string[] = []
mock.module('@/stores/app', { namedExports: { useApp: { getState: () => ({ setView: (view: string) => forumViews.push(view) }) } } })
let stored: Homework
let publish: (input: unknown) => Promise<{ homework: Homework }>
const publishInputs: unknown[] = []
mock.module('./api', { namedExports: { homeworkApi: {
  detail: async () => ({ homework: stored }),
  publish: async (_course: string, _id: string, input: unknown) => { publishInputs.push(input); return publish(input) },
} } })
const { HomeworkDraftCard, HomeworkDraftTool } = await import('./HomeworkDraftCard')
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
after(() => {
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
  else Reflect.deleteProperty(globalThis, 'document')
})

type Element = { type: unknown; props: Record<string, any> }
function nodes(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!React.isValidElement(node)) return []
  const element = node as Element
  return [element, ...nodes(element.props.children), ...nodes(element.props.render)]
}
const matching = (tree: unknown, type: string) => nodes(tree).filter(node => node.type === type)
const button = (tree: unknown, text: string) => {
  const found = matching(tree, 'Button').find(node => node.props.children === text)
  assert.ok(found, `missing button: ${text}`); return found
}
function draft(): Homework {
  return { id: 'homework', courseId: 'course', title: '待发布标题', instructions: '草稿要求', criteria: ['独立解释'],
    links: ['https://example.test/material'], attachments: [{ key: 'file', name: 'material.pdf' }], dueAt: null,
    status: 'DRAFT', revision: 3, visibleHash: 'reviewed-hash', createdBy: 'teacher',
    validation: { status: 'READY', revision: 3, feedback: '' }, canPublish: true, canEditDraft: true }
}
const published = (): Homework => ({ ...draft(), title: '正式标题'.repeat(30), instructions: '服务端实际发布要求',
  criteria: ['实际发布标准'], status: 'PUBLISHED', canPublish: false, canEditDraft: false })
async function setup(homework = draft(), props: Partial<Parameters<typeof HomeworkDraftCard>[0]> = {}) {
  slots.forEach(slot => { slot.cleanup?.() }); slots = []; cursor = 0; effects = []; forumViews.length = 0; publishInputs.length = 0
  stored = homework; publish = async () => ({ homework: stored = published() })
  const document = { activeElement: null as unknown }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document })
  const render = () => {
    cursor = 0; effects = []
    const tree = HomeworkDraftCard({ courseId: 'course', homeworkId: 'homework', readOnly: false, preparing: false, collapsePublished: true, ...props })
    effects.forEach(effect => { effect() }); return tree
  }
  render(); await setImmediate()
  return { render, document }
}

test('chat tool opts into summaries; direct composer usage keeps its existing published view', async () => {
  const tool = HomeworkDraftTool({ result: { value: { result: { courseId: 'course', homeworkId: 'homework' } } }, status: { type: 'complete' }, readOnly: true } as ToolCallMessagePartProps & { readOnly: boolean })
  assert.equal(tool.props.collapsePublished, true)
  assert.equal(tool.props.readOnly, true)
  const { render } = await setup(published(), { collapsePublished: undefined })
  assert.equal(matching(render(), 'CollapsibleRoot').length, 0)
  assert.equal(matching(render(), 'ForumBody')[0].props.content, '服务端实际发布要求')
})

test('publish waits for the server, then collapses the same homework with read-only published fields', async () => {
  const { render, document } = await setup()
  let resolve!: (value: { homework: Homework }) => void
  publish = () => new Promise(done => { resolve = done })
  const origin = render(), publishButton = { tagName: 'BUTTON' }
  document.activeElement = publishButton
  const pending = button(origin, '确认发布').props.onClick({ currentTarget: publishButton })
  assert.equal(matching(render(), 'form').length, 1)
  assert.equal(button(render(), '处理中…').props['aria-disabled'], true)
  assert.equal(button(render(), '处理中…').props.disabled, false, 'retain keyboard focus until the server confirms; the handler still blocks repeat publication')
  await button(render(), '处理中…').props.onClick({ currentTarget: publishButton })
  assert.equal(publishInputs.length, 1)
  assert.equal(matching(render(), 'CollapsibleRoot').length, 0)
  stored = published(); resolve({ homework: stored }); await pending
  const summary = render()
  assert.equal(summary.type, origin.type)
  assert.equal(summary.props['data-homework-id'], origin.props['data-homework-id'])
  assert.equal(matching(summary, 'Card').length, 1)
  assert.equal(matching(summary, 'form').length, 0)
  assert.equal(matching(summary, 'Input').length, 0)
  assert.equal(matching(summary, 'CollapsibleRoot')[0].props.open, false)
  assert.equal(matching(summary, 'CardTitle')[0].props.children, stored.title)
  assert.equal(matching(summary, 'Badge')[0].props.children, '已发布')
  const trigger = matching(summary, 'CollapsibleTrigger')[0]
  assert.equal(trigger.props['aria-expanded'], false)
  assert.equal(trigger.props['aria-controls'], matching(summary, 'CollapsibleContent')[0].props.id)
  const focus: unknown[] = []
  trigger.props.render.props.ref({ focus: (options: unknown) => focus.push(options) })
  assert.deepEqual(focus, [{ preventScroll: true }])
  matching(summary, 'CollapsibleRoot')[0].props.onOpenChange(true)
  const expanded = render()
  assert.equal(matching(expanded, 'CollapsibleTrigger')[0].props['aria-expanded'], true)
  assert.equal(matching(expanded, 'ForumBody')[0].props.content, stored.instructions)
  assert.equal(matching(expanded, 'ForumFiles')[0].props.attachments, stored.attachments)
  assert.equal(matching(expanded, 'ForumFiles')[0].props.links, stored.links)
  assert.equal(matching(expanded, 'form').length, 0)
  button(expanded, '在论坛查看作业').props.onClick()
  assert.deepEqual(forumViews, ['forum'])
  matching(expanded, 'CollapsibleRoot')[0].props.onOpenChange(false)
  assert.equal(matching(render(), 'CollapsibleRoot')[0].props.open, false)
  assert.equal(publishInputs.length, 1, 'expanding/closing/viewing does not publish again')
  assert.equal((publishInputs[0] as { visibleHash: string }).visibleHash, 'reviewed-hash')
})

test('failure keeps recovery and draft content; retry keeps the idempotency key and does not steal moved focus', async () => {
  const { render, document } = await setup()
  publish = async () => { throw new Error('synthetic failure') }
  await button(render(), '确认发布').props.onClick({ currentTarget: {} })
  assert.equal(matching(render(), 'CollapsibleRoot').length, 0)
  assert.equal(matching(render(), 'form').length, 1)
  assert.equal(matching(render(), 'Input')[0].props.value, '待发布标题')
  assert.ok(nodes(render()).some(node => node.props.role === 'alert'))
  button(render(), '确认发布')
  button(render(), '重新加载草稿')
  publish = async () => ({ homework: stored = published() })
  document.activeElement = { tagName: 'EARLIER_MESSAGE' }
  await button(render(), '确认发布').props.onClick({ currentTarget: {} })
  const focus: unknown[] = []
  matching(render(), 'CollapsibleTrigger')[0].props.render.props.ref({ focus: (options: unknown) => focus.push(options) })
  assert.deepEqual(focus, [])
  assert.equal(publishInputs.length, 2)
  assert.equal((publishInputs[0] as { idempotencyKey: string }).idempotencyKey, (publishInputs[1] as { idempotencyKey: string }).idempotencyKey)
})

test('server-confirmed history/remount defaults closed, including closed homework and rich criteria', async () => {
  for (const status of ['PUBLISHED', 'CLOSED'] as const) {
    const homework: Homework = { ...published(), status, criteriaDocument: { format: 'blocknote', version: 1, blocks: [], projection: '实际发布标准', sections: ['实际发布标准'] } }
    const { render } = await setup(homework, { readOnly: true })
    const initial = render()
    assert.equal(matching(initial, 'CollapsibleRoot')[0].props.open, false)
    assert.equal(matching(initial, 'Badge')[0].props.children, status === 'CLOSED' ? '已关闭' : '已发布')
    matching(initial, 'CollapsibleRoot')[0].props.onOpenChange(true)
    assert.equal(matching(render(), 'ForumBody')[1].props.document, homework.criteriaDocument)
    const reentered = await setup(homework, { readOnly: true })
    assert.equal(matching(reentered.render(), 'CollapsibleRoot')[0].props.open, false)
  }
})

test('preparing, read-only and unauthorized drafts retain publish guards; edits and files remain in the draft', async () => {
  for (const [homework, props] of [[draft(), { readOnly: true }], [draft(), { preparing: true }], [{ ...draft(), canEditDraft: false }, {}]] as const) {
    const { render } = await setup(homework, props)
    const control = button(render(), '确认发布')
    assert.equal(control.props.disabled, true)
    await control.props.onClick({ currentTarget: {} })
    assert.equal(publishInputs.length, 0)
    assert.equal(matching(render(), 'CollapsibleRoot').length, 0)
  }
  const { render } = await setup()
  matching(render(), 'Input')[0].props.onChange({ target: { value: '保留的修改' } })
  assert.equal(matching(render(), 'Input')[0].props.value, '保留的修改')
  assert.deepEqual(matching(render(), 'ForumContentFields')[0].props.attachments, draft().attachments)
  assert.equal(button(render(), '确认发布').props.disabled, true)
  assert.equal(matching(render(), 'CollapsibleRoot').length, 0)
})
