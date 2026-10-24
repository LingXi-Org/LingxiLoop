import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ApiCourse, LearningSpace } from '../contracts'

type Hook = { value?: unknown; deps?: React.DependencyList; cleanup?: () => void }
type Instance = { hooks: Hook[] }
const instances = new Map<string, Instance>()
let current!: Instance
let cursor = 0
let effects: Array<() => void> = []
mock.module('react', { namedExports: { ...React,
  useState: (initial: unknown) => {
    const hook = current.hooks[cursor++] ??= { value: initial }
    return [hook.value, (next: unknown) => { hook.value = typeof next === 'function' ? next(hook.value) : next }]
  },
  useRef: (value: unknown) => (current.hooks[cursor++] ??= { value: { current: value } }).value,
  useEffect: (effect: () => (() => void) | undefined, deps?: React.DependencyList) => {
    const hook = current.hooks[cursor++] ??= {}
    if (!deps || !hook.deps || deps.some((value, i) => !Object.is(value, hook.deps?.[i]))) {
      hook.deps = deps
      effects.push(() => { hook.cleanup?.(); hook.cleanup = effect() || undefined })
    }
  },
} })

const wrapper = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
for (const [path, names] of [
  ['@/components/ui/alert', ['Alert', 'AlertDescription']],
  ['@/components/ui/badge', ['Badge']],
  ['@/components/ui/card', ['Card', 'CardContent']],
  ['@/components/ui/tabs', ['Tabs', 'TabsContent', 'TabsList', 'TabsTrigger']],
  ['./DashboardSectionFrame', ['DashboardSectionFrame']],
] as const) mock.module(path, { namedExports: Object.fromEntries(names.map(name => [name, wrapper])) })
mock.module('@/components/ui/button', { namedExports: { Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => <button type="button" onClick={onClick}>{children}</button> } })
mock.module('@hugeicons/react', { namedExports: { HugeiconsIcon: () => null } })
mock.module('./LearningSkeletons', { namedExports: { CourseSettingsSkeleton: () => <p>loading-course</p> } })
mock.module('./CourseMembersSection', { namedExports: { CourseMembersSection: () => null } })
mock.module('./CourseProfileSettings', { namedExports: { CourseProfileSettings: ({ course, canEdit }: { course: ApiCourse; canEdit: boolean }) => <p>{course.name}:{canEdit ? 'editable' : 'readonly'}</p> } })
mock.module('@/stores/app', { namedExports: { useApp: (select: (state: { setView: () => void }) => unknown) => select({ setView() {} }) } })
const requests: Array<{ id: string; resolve: (course: ApiCourse) => void; reject: (reason: Error) => void }> = []
mock.module('../api', { namedExports: { learningApi: { getCourse: (id: string) => new Promise<ApiCourse>((resolve, reject) => requests.push({ id, resolve, reject })) } } })
let resolveConfirmation!: (value: boolean) => void
mock.module('@/lib/confirmAction', { namedExports: { confirmSensitiveAction: () => new Promise<boolean>(resolve => { resolveConfirmation = resolve }) } })
const lifecycleCalls: string[] = []
const lifecycleRun = async (id: string) => { lifecycleCalls.push(id); return { ok: true, status: 'COURSE_ENDED', applied: true } }
mock.module('@/features/projects/api', { namedExports: { projectLifecycleApi: { end: lifecycleRun, enterReadOnly: lifecycleRun, enterRetention: lifecycleRun, archive: lifecycleRun } } })
mock.module('@/lib/actionToast', { namedExports: { toastAction: (promise: Promise<unknown>) => promise } })
const { CourseSettingsSection } = await import('./CourseSettingsSection')

// Exercise production hooks and effect cleanup at the component boundary. React's
// keyed owner lifetime is represented here; the official browser fixture covers DOM.
let buttons: Array<() => void> = []
function render(space: LearningSpace) {
  const used = new Set<string>()
  buttons = []
  const visit = (node: React.ReactNode, path: string): React.ReactNode => {
    if (Array.isArray(node)) return node.map((child, index) => visit(child, `${path}/${index}`))
    if (!React.isValidElement<{ children?: React.ReactNode; onClick?: () => void }>(node)) return node
    const owner = `${path}:${node.key ?? ''}`
    if (typeof node.type === 'function') {
      used.add(owner)
      current = instances.get(owner) ?? { hooks: [] }
      instances.set(owner, current)
      cursor = 0
      return visit((node.type as (props: unknown) => React.ReactNode)(node.props), `${owner}/child`)
    }
    if (node.props.onClick) buttons.push(node.props.onClick)
    return React.cloneElement(node, { key: owner }, visit(node.props.children, `${owner}/children`))
  }
  const tree = visit(<CourseSettingsSection space={space} section="status" />, 'root')
  for (const [key, instance] of instances) if (!used.has(key)) {
    for (const hook of instance.hooks) hook.cleanup?.()
    instances.delete(key)
  }
  for (const effect of effects.splice(0)) effect()
  return renderToStaticMarkup(tree)
}
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
const spaceA: LearningSpace = { companyId: 'company-a', projectId: 'project-a', courseId: 'course-a', title: 'A', description: '', color: null, projectKind: 'TEACHING', status: 'ACTIVE', perspective: 'teacher', canManage: true, canEditContent: false, canUpdateCourse: false, canInviteMembers: false, canRevokeInvitations: false, canUpdateMembers: false, canRemoveMembers: false, canSubmit: false, canReview: false, lifecycleAction: 'END', isDefault: false, lastVisitedAt: null }
const courseFor = (space: LearningSpace): ApiCourse => ({ id: space.courseId!, companyId: space.companyId, projectId: space.projectId, name: `loaded-${space.courseId}`, description: '', color: '', projectKind: 'TEACHING', status: 'ACTIVE', createdBy: 'teacher', studyRoomId: null, courseRole: 'teacher', memberCount: 1, canManage: true })
function reset() {
  for (const instance of instances.values()) for (const hook of instance.hooks) hook.cleanup?.()
  instances.clear(); requests.length = 0; lifecycleCalls.length = 0; effects = []
}

test('switching course hides the old form before the new GET, including failure and late responses', async () => {
  reset()
  assert.match(render(spaceA), /loading-course/)
  requests[0].resolve(courseFor(spaceA)); await settle()
  assert.match(render(spaceA), /loaded-course-a:readonly/)
  const spaceB = { ...spaceA, projectId: 'project-b', courseId: 'course-b', canUpdateCourse: true }
  assert.doesNotMatch(render(spaceB), /loaded-course-a/)
  requests[1].reject(new Error('failed')); await settle()
  assert.doesNotMatch(render(spaceB), /loaded-course-a/)
  assert.match(render(spaceB), /课程设置暂时无法加载/)
  render(spaceA)
  const lateA = requests[2]
  render(spaceB)
  requests[3].resolve(courseFor(spaceB)); await settle()
  assert.match(render(spaceB), /loaded-course-b:editable/)
  lateA.resolve(courseFor(spaceA)); await settle()
  assert.doesNotMatch(render(spaceB), /loaded-course-a/)
})

test('company and project changes isolate the same course id and reject a mismatched response', async () => {
  reset(); render(spaceA)
  requests[0].resolve(courseFor(spaceA)); await settle()
  assert.match(render(spaceA), /loaded-course-a/)
  const moved = { ...spaceA, companyId: 'company-b' }
  assert.doesNotMatch(render(moved), /loaded-course-a/)
  requests[1].resolve(courseFor(spaceA)); await settle()
  assert.doesNotMatch(render(moved), /loaded-course-a/)
  assert.match(render(moved), /课程设置暂时无法加载/)
  const movedProject = { ...moved, projectId: 'project-b' }
  assert.match(render(movedProject), /loading-course/)
  assert.equal(requests.length, 3)
  requests[2].resolve(courseFor(movedProject)); await settle()
  assert.match(render(movedProject), /loaded-course-a:readonly/)
})


test('a lifecycle confirmation from an unmounted scope cannot submit', async () => {
  reset(); render(spaceA)
  requests[0].resolve(courseFor(spaceA)); await settle()
  render(spaceA)
  assert.equal(buttons.length, 1)
  buttons[0]()
  render({ ...spaceA, courseId: 'course-b', projectId: 'project-b' })
  resolveConfirmation(true); await settle()
  assert.deepEqual(lifecycleCalls, [])
})


test('lifecycle confirmation rechecks the current allowed action while authorized operations still work', async () => {
  reset(); render(spaceA)
  requests[0].resolve(courseFor(spaceA)); await settle()
  render(spaceA); buttons[0]()
  render({ ...spaceA, lifecycleAction: null })
  resolveConfirmation(true); await settle()
  assert.deepEqual(lifecycleCalls, [])
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const dispatched: Event[] = []
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: (event: Event) => { dispatched.push(event) } } })
  try {
    render(spaceA); buttons[0]()
    resolveConfirmation(true); await settle()
    assert.deepEqual(lifecycleCalls, ['project-a'])
    assert.deepEqual(dispatched.map(event => event.type), ['lingxiloop:learning-spaces-updated'])
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})


test('the fetched course projection gates editing and lifecycle actions against cached space permissions', async (t) => {
  for (const scenario of [
    { name: 'management permission revoked', patch: { canManage: false } },
    { name: 'course status changed', patch: { status: 'COURSE_ENDED' as const } },
  ]) await t.test(scenario.name, async () => {
    reset()
    const cached = { ...spaceA, canUpdateCourse: true }
    render(cached)
    requests[0].resolve({ ...courseFor(cached), ...scenario.patch }); await settle()
    const html = render(cached)
    assert.match(html, /loaded-course-a:readonly/)
    assert.equal(buttons.length, 0, 'cached permissions must not expose a lifecycle action rejected by the fetched course')
  })
})
