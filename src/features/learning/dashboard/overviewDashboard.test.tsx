import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { load } from 'cheerio'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LearnerLearningOverview, LearningActivity, LearningCourse } from '../contracts'
import { LearnerNextSteps } from './LearnerDashboardSummary'
import { buildLearnerDashboardModel } from './learnerDashboardModel'
import { OverviewChartCard, OverviewDonutChart } from './OverviewChartCard'

mock.module('../api.ts', { namedExports: { learningApi: {} } })
const { LearningActivitiesSection } = await import('../components/LearningActivitiesSection')

const course: LearningCourse = { projectId: 'p1', projectKind: 'TEACHING', title: '课程', description: '', status: 'ACTIVE', perspective: 'learner', canSubmit: true }
const activity: LearningActivity = { id: 'a1', projectId: 'p1', title: '概念练习', instructions: '用自己的话解释', kind: 'PRACTICE', status: 'PUBLISHED', evaluationMode: 'AGENT_FORMATIVE', targetLevel: 2, rubric: [], knowledgeUnitIds: [] }
const overview: LearnerLearningOverview = { perspective: 'learner', windowDays: 30, summary: { dueReviews: 1, verifiedObjectives: 2, activeMissions: 0, evidenceAttempts: 5 }, masteryDistribution: [], attemptTrend: [], assistanceDistribution: [], dueReviews: [{ knowledgeUnitId: 'o1', title: '复习概念', level: 1, status: 'LEARNING', nextReviewAt: '2026-09-25T00:00:00Z' }], missionProgress: [] }

test('chart entries are named dialog buttons and empty data remains actionable', () => {
  const html = load(renderToStaticMarkup(<OverviewChartCard title="课程活动" value="0 项待完成" description="查看活动要求" open={false} onOpenChange={() => {}} chart={<OverviewDonutChart data={[]} value="0" />}><p>活动详情</p></OverviewChartCard>))
  assert.equal(html('button').length, 1)
  assert.equal(html('button').attr('aria-label'), '查看课程活动：0 项待完成')
  assert.equal(html('button').attr('aria-haspopup'), 'dialog')
  assert.equal(html('button').attr('aria-expanded'), 'false')
  assert.match(html.text(), /暂无记录，点击查看详情/)
  assert.doesNotMatch(html.text(), /活动详情/)
  assert.equal(html('[role="tab"]').length, 0)
})

test('next steps link to review and activity categories while read-only courses omit submission work', () => {
  const model = buildLearnerDashboardModel({ projectId: 'p1', activities: [activity], objectives: [], missions: [], evidence: [], states: [] })
  const open = load(renderToStaticMarkup(<LearnerNextSteps overview={overview} model={model} canSubmit onOpenSection={() => {}} />))
  assert.deepEqual(open('button').map((_, element) => open(element).find('.font-medium').text()).get(), ['复习概念', '概念练习'])
  const readonly = load(renderToStaticMarkup(<LearnerNextSteps overview={overview} model={model} canSubmit={false} onOpenSection={() => {}} />))
  assert.equal(readonly('button').length, 1)
  assert.match(readonly('button').text(), /复习概念/)
  assert.doesNotMatch(readonly.text(), /概念练习/)
})

test('typing an answer preserves the activity column and labelled textarea instead of moving the form', () => {
  const render = (answer: string, canSubmit = true) => load(renderToStaticMarkup(<LearningActivitiesSection course={{ ...course, canSubmit }} activities={[activity]} perspective="learner" answers={{ a1: answer }} setAnswers={() => {}} onChanged={async () => {}} onError={() => {}} />))
  for (const answer of ['', '第一句话', '第一句话\n第二句话']) {
    const html = render(answer)
    const input = html('textarea')
    assert.equal(input.length, 1)
    assert.equal(input.attr('aria-label'), '概念练习的作答或反思')
    assert.equal(input.closest('section').attr('aria-labelledby'), 'activity-column-ready')
    assert.equal(input.text(), answer)
    assert.equal(html('section').length, 1)
  }
  assert.equal(render('已有草稿', false)('textarea').length, 0)
})
