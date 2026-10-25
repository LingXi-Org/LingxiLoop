import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LearningSpace } from '@/features/learning/contracts'

// A promoted organization teacher has no course grants and cannot follow a student invitation.
test('empty workspace guidance follows the active company identity and preserves existing states', async () => {
  const renderedSections: string[] = []
  mock.module('./DashboardSkeleton', { namedExports: { DashboardSkeleton: () => <p>正在加载学习空间</p> } })
  mock.module('@/features/learning/dashboard/LearningDashboardPanel', { namedExports: {
    LearningDashboardPanel: ({ section }: { section: string }) => { renderedSections.push(section); return <p>已授权课程</p> },
  } })
  try {
    const { PersonalDashboard } = await import('./PersonalDashboard')
    const render = (props: Partial<Parameters<typeof PersonalDashboard>[0]> = {}) => renderToStaticMarkup(
      <PersonalDashboard view="learning" loading={false} error="" onRetry={() => {}} {...props} />,
    )
    const teacher = render({ companyRole: 'teacher' })
    assert.match(teacher, /请联系公司管理员，将你添加为指定课程的教师，完成后刷新。/)
    assert.doesNotMatch(teacher, /索取课程邀请链接|选择工作区/)
    assert.match(teacher, />刷新<\/button>/)
    assert.match(render({ companyRole: 'student' }), /请向老师索取课程邀请链接，加入后刷新。/)
    assert.match(render(), /请刷新以确认可用的学习空间；如仍无法显示，请联系公司管理员。/)
    assert.doesNotMatch(render(), /索取课程邀请链接|指定课程的教师/)

    const selectable = render({ companyRole: 'teacher', hasSpaces: true, onChooseWorkspace() {} })
    assert.match(selectable, /选择课程，查看课程资料、作业与讨论。/)
    assert.match(selectable, />选择工作区<\/button>/)
    assert.doesNotMatch(selectable, /请联系公司管理员/)
    assert.equal(render({ companyRole: 'teacher', loading: true }), '<p>正在加载学习空间</p>')
    const failure = render({ companyRole: 'teacher', loading: true, error: '课程加载失败' })
    assert.match(failure, /role="alert"[\s\S]*课程加载失败[\s\S]*重试/)
    assert.doesNotMatch(failure, /当前没有可用|指定课程的教师/)
    assert.equal(render({ companyRole: 'teacher', space: { companyId: 'company', projectId: 'course' } as LearningSpace }), '<p>已授权课程</p>')
    render({ view: 'course-materials', space: { companyId: 'company', projectId: 'course' } as LearningSpace })
    assert.equal(renderedSections.at(-1), 'materials')
  } finally { mock.restoreAll() }
})
