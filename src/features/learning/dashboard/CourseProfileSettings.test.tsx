import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import * as React from 'react'
import type { ApiCourse } from '../contracts'

test('course profile actions recheck their mounted course and edit permission before writing', async (t) => {
  const cells: unknown[] = []
  const cleanups: Array<() => void> = []
  let cursor = 0
  let confirm!: (accepted: boolean) => void
  const writes: Array<{ id: string; patch: unknown }> = []
  const updates: ApiCourse[] = []
  // Exercise the component's real callbacks with explicit render/unmount boundaries.
  // The official browser fixture separately verifies the surrounding UI behavior.
  mock.module('react', { namedExports: { ...React,
    useState: (initial: unknown) => {
      const index = cursor++
      if (!(index in cells)) cells[index] = initial
      return [cells[index], (value: unknown) => { cells[index] = value }]
    },
    useRef: (initial: unknown) => {
      const index = cursor++
      if (!(index in cells)) cells[index] = { current: initial }
      return cells[index]
    },
    useEffect: (effect: () => (() => void) | undefined) => {
      const index = cursor++
      if (index in cells) return
      cells[index] = true
      const cleanup = effect()
      if (cleanup) cleanups.push(cleanup)
    },
  } })
  for (const [path, names] of [
    ['@/features/settings/AvatarEditor', ['AvatarEditor']],
    ['@/components/ui/button', ['Button']],
    ['@/components/ui/card', ['Card', 'CardContent']],
    ['@/components/ui/field', ['Field', 'FieldGroup', 'FieldLabel']],
    ['@/components/ui/input', ['Input']],
    ['@/components/ui/textarea', ['Textarea']],
  ] as const) {
    mock.module(path, { namedExports: Object.fromEntries(names.map(name => [name, name])) })
  }
  mock.module('../courseAvatar', { namedExports: { getCourseAvatarUrl: () => '/synthetic-avatar.svg' } })
  mock.module('@/features/knowledge/workspace', { namedExports: { useWorkspace: { getState: () => ({ load: async () => {} }) } } })
  mock.module('@/lib/confirmAction', { namedExports: { confirmSensitiveAction: () => new Promise<boolean>(resolve => { confirm = resolve }) } })
  mock.module('@/lib/actionToast', { namedExports: { toastAction: (promise: Promise<unknown>) => promise } })
  mock.module('../api', { namedExports: { learningApi: { updateCourse: async (id: string, patch: unknown) => { writes.push({ id, patch }); return { ok: true } } } } })
  const originalFormData = globalThis.FormData
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  class FormValues {
    get(name: string) { return name === 'name' ? 'Updated course' : 'Updated description' }
  }
  Object.defineProperty(globalThis, 'FormData', { configurable: true, value: FormValues })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent() {} } })
  const { CourseProfileSettings } = await import('./CourseProfileSettings')
  const course: ApiCourse = {
    id: 'course-a', companyId: 'synthetic-company', projectId: 'project-a', projectKind: 'TEACHING',
    name: 'Course A', description: '', color: '#5266d6', status: 'ACTIVE', createdBy: 'synthetic-teacher',
    studyRoomId: null, courseRole: 'teacher', memberCount: 1, canManage: true,
  }
  type Element = React.ReactElement<Record<string, unknown>>
  function find(root: Element, type: string): Element {
    if (root.type === type) return root
    for (const child of React.Children.toArray(root.props.children as React.ReactNode)) {
      if (!React.isValidElement(child)) continue
      try { return find(child as Element, type) } catch { /* Try the next child. */ }
    }
    throw new Error(`Missing ${type}`)
  }
  function render(canEdit = true) {
    cursor = 0
    return CourseProfileSettings({ course, canEdit, onUpdated: value => updates.push(value) }) as Element
  }
  const unmount = () => { for (const cleanup of cleanups.splice(0)) cleanup() }
  const reset = () => { unmount(); cells.length = 0; writes.length = 0; updates.length = 0 }
  const submit = (tree: Element) => (find(tree, 'form').props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {}, currentTarget: {} })
  try {
    await t.test('permission loss while confirmation is open sends no metadata request', async () => {
      reset()
      const pending = submit(render())
      render(false)
      confirm(true)
      await pending
      assert.deepEqual(writes, [])
      assert.deepEqual(updates, [])
    })
    await t.test('leaving the course while confirmation is open sends no metadata request', async () => {
      reset()
      const pending = submit(render())
      unmount()
      confirm(true)
      await pending
      assert.deepEqual(writes, [])
    })
    await t.test('an avatar callback retained by an upload cannot write after permission loss', async () => {
      reset()
      const saveAvatar = find(render(), 'AvatarEditor').props.onSave as (avatar: { seed: string }) => Promise<void>
      render(false)
      await assert.rejects(saveAvatar({ seed: 'synthetic-avatar' }))
      assert.deepEqual(writes, [])
    })
    await t.test('an authorized save still updates the intended course', async () => {
      reset()
      const pending = submit(render())
      confirm(true)
      await pending
      assert.deepEqual(writes, [{ id: course.id, patch: { name: 'Updated course', description: 'Updated description' } }])
      assert.equal(updates[0]?.id, course.id)
      assert.equal(updates[0]?.name, 'Updated course')
    })
  } finally {
    unmount()
    Object.defineProperty(globalThis, 'FormData', { configurable: true, value: originalFormData })
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
