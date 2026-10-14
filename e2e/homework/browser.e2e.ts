import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { selectWorkspace, signIn, signOut } from '../web/accounts'
import { semanticEvidence } from '../web/evidence'

test('real learning records allow honest report pairs, closed return without new evidence, and teacher acceptance', async fixtures => {
  const { app, screen, browser } = fixtures
  const courseId = process.env.E2E_HOMEWORK_COURSE_ID!, projectId = process.env.E2E_HOMEWORK_PROJECT_ID!
  expect(Boolean(courseId && projectId && process.env.LINGXIOS_LIVE_HOMEWORK === '1')).toBe(true)
  const title = '真实作业验收：三角形面积', quickTitle = '快速掌握核对：三角形面积'
  const criteria = ['独立说明三角形面积为何是同底同高长方形面积的一半。', '独立计算底为8、高为5以及底为10、高为3的三角形面积，并写明单位。']
  const answer = '两个全等三角形可以拼成同底同高的长方形，所以每个三角形的面积是底乘垂直高再除以2。底8高5的面积为20平方单位；底10高3的面积为15平方单位。'
  const partialAnswer = '我认为三角形面积就是底乘高，因此底8高5的面积是40平方单位。我还不能说明为什么有的公式要除以2，也没有完成第二个计算。'
  const documentsOnly = process.env.E2E_HOMEWORK_DOCUMENTS_ONLY === '1'
  const evidence: Record<string, unknown> = { passed: false, scenarios: [], scope: documentsOnly ? 'documents-only' : 'full', requiredUnverified: documentsOnly ? ['public-webpage'] : [] }
  let teacherChannelId = ''
  const out = process.env.HOMEWORK_ARTIFACT_DIR!
  const capture = (label: string) => semanticEvidence(screen, browser, label, `${out}/semantic`)
  const record = async () => { await mkdir(out, { recursive: true }); await writeFile(`${out}/browser-proof.json`, JSON.stringify(evidence, null, 2)) }
  const checkpoint = async (phase: string) => { evidence.phase = phase; await record() }
  const api = async (url: string) => browser.evaluate(async url => {
    const response = await fetch(url, { headers: { 'x-company-id': 'homework-live-school' } })
    if (!response.ok) throw new Error(`Homework read failed: ${response.status}`)
    return response.json()
  }, url)
  const detail = (id: string) => api(`/api/courses/${courseId}/homeworks/${id}`)
  const forum = async () => { await app.open(`/?project=${projectId}&view=forum`); await expect(screen.getByLabel('搜索学习论坛')).toBeVisible() }
  const openTask = async (name: string, teacher = false) => {
    await forum(); await browser.locator('article').filter({ hasText: name }).getByRole('button', teacher ? '查看进度与验收' : '查看作业', { exact: true }).tap()
    await expect(screen.getByRole('dialog', name, { exact: true })).toBeVisible()
  }
  const say = async (text: string) => {
    const composer = browser.locator('[contenteditable="true"]').first()
    await expect(composer).toBeVisible(); await composer.fill(text); await screen.getByRole('button', '发送', { exact: true }).tap()
    await expect(browser.locator('[data-msg-id]').filter({ hasText: text })).toBeVisible()
  }
  const waitForLearningRecord = async (id: string) => {
    await expect.poll(async () => (await detail(id)).student.hasLearningRecord, { timeout: 60_000 }).toBe(true)
    const channelId = (await detail(id)).student.channelId
    await expect.poll(async () => {
      const runs = await api(`/api/im/channels/${channelId}/runs`) as { status: string }[]
      return runs.length > 0 && runs.every(run => ['succeeded', 'partial', 'blocked', 'failed', 'cancelled'].includes(run.status))
    }, { timeout: 300_000 }).toBe(true)
  }
  const publish = async (name: string, materials: boolean) => {
    await checkpoint(materials ? 'teacher-draft-native-card' : 'quick-check-draft-native-card')
    await forum(); await screen.getByRole('button', '发布作业', { exact: true }).tap()
    await expect.poll(() => browser.evaluate(() => Boolean(new URL(location.href).searchParams.get('conversation'))), { timeout: 60_000 }).toBe(true)
    await expect(browser.locator('[contenteditable="true"]').first()).toBeVisible()
    teacherChannelId = await browser.evaluate(() => new URL(location.href).searchParams.get('conversation') ?? '')
    expect(Boolean(teacherChannelId)).toBe(true)
    const teacherRuns = async () => await api(`/api/im/channels/${teacherChannelId}/runs`) as { runId: string; status: string }[]
    const previousRuns = new Set((await teacherRuns()).map(run => run.runId))
    const currentRuns = async () => (await teacherRuns()).filter(run => !previousRuns.has(run.runId))
    await say(`请为本课程创建一份个人作业草稿，标题“${name}”。要求学生独立说明三角形面积为什么等于底乘高除以2，并计算底8高5、底10高3的面积，注明平方单位。验收标准为独立解释原理和正确迁移计算。请用作业草稿卡让我检查，等我点击确认后发布。`)
    const latestCard = browser.locator('[aria-label="作业草稿"]').last()
    await expect(latestCard.getByLabel('作业标题')).toBeVisible({ timeout: 300_000 })
    const activeBefore = (await currentRuns()).filter(run => ['queued', 'leased', 'waiting'].includes(run.status))
    let lockedWhileRunningObserved = false
    if (activeBefore.length) {
      const enabledMutations = await browser.evaluate(() => {
        const card = [...document.querySelectorAll('[aria-label="作业草稿"]')].at(-1)!
        return [...card.querySelectorAll('input,textarea,button,[contenteditable]')]
          .filter(control => control.hasAttribute('contenteditable') ? control.getAttribute('contenteditable') !== 'false' : !control.matches(':disabled'))
          .map(control => control.getAttribute('aria-label') ?? control.tagName)
      })
      const activeAfter = (await currentRuns()).filter(run => ['queued', 'leased', 'waiting'].includes(run.status))
      if (activeBefore.some(before => activeAfter.some(after => after.runId === before.runId))) {
        lockedWhileRunningObserved = true
        expect(enabledMutations).toEqual([])
      }
    }
    await expect.poll(async () => {
      const runs = await currentRuns()
      return runs.length > 0 && runs.every(run => ['succeeded', 'partial', 'blocked', 'failed', 'cancelled'].includes(run.status))
    }, { timeout: 300_000 }).toBe(true)
    const completedRuns = await currentRuns()
    evidence[materials ? 'teacherDraftRun' : 'quickDraftRun'] = { runs: completedRuns, lockedWhileRunningObserved }
    await record()
    expect(completedRuns.every(run => run.status === 'succeeded')).toBe(true)
    const homeworkId = await latestCard.getAttribute('data-homework-id')
    expect(Boolean(homeworkId)).toBe(true)
    const card = browser.locator(`[aria-label="作业草稿"][data-homework-id=${JSON.stringify(homeworkId)}]`).last()
    await expect(card).toHaveCount(1)
    await expect(card.getByLabel('作业标题')).toBeEnabled({ timeout: 300_000 })
    await checkpoint(materials ? 'teacher-edit-and-material-validation' : 'quick-check-edit-and-validation')
    await card.getByLabel('作业标题').fill(name)
    await card.getByLabel('作业要求', { exact: true }).fill('独立说明三角形面积公式的原理，并计算底8高5、底10高3的三角形面积，写明平方单位。')
    await card.getByLabel('验收标准').fill(criteria.join('\n'))
    if (materials) {
      await card.getByLabel('附件', { exact: true }).setInputFiles([fileURLToPath(new URL('./triangle-reference.pdf', import.meta.url))])
      await expect(card.getByRole('button', '移除附件：triangle-reference.pdf')).toBeVisible()
      if (!documentsOnly) {
        await card.getByText('附加链接', { exact: true }).tap()
        await card.getByLabel('链接（每行一个）').fill(process.env.E2E_HOMEWORK_PUBLIC_URL!)
      }
    }
    await expect(card.getByRole('button', '确认发布')).toBeDisabled()
    if (materials) await browser.evaluate(detailPath => {
      const original = window.fetch.bind(window)
      const state = window as unknown as { homeworkPollWaiting?: boolean; releaseHomeworkPoll?: () => void }
      let held = false
      window.fetch = async (...args) => {
        const response = await original(...args)
        const request = args[0], url = request instanceof Request ? request.url : String(request)
        const method = args[1]?.method ?? (request instanceof Request ? request.method : 'GET')
        if (!held && new URL(url, location.href).pathname === detailPath && method === 'GET') {
          held = true; state.homeworkPollWaiting = true
          await new Promise<void>(resolve => { state.releaseHomeworkPoll = resolve })
          state.homeworkPollWaiting = false; window.fetch = original
        }
        return response
      }
      return true
    }, `/api/courses/${encodeURIComponent(courseId)}/homeworks/${encodeURIComponent(homeworkId!)}`)
    await card.getByRole('button', '保存修改').tap()
    if (materials) {
      await expect.poll(() => browser.evaluate(() => Boolean((window as unknown as { homeworkPollWaiting?: boolean }).homeworkPollWaiting)), { timeout: 60_000 }).toBe(true)
      const editedTitle = `${name}（编辑保留检查）`
      await card.getByLabel('作业标题').fill(editedTitle)
      await browser.evaluate(async () => {
        (window as unknown as { releaseHomeworkPoll?: () => void }).releaseHomeworkPoll?.()
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        return true
      })
      await expect(card.getByLabel('作业标题')).toHaveValue(editedTitle)
      await expect(card.getByRole('button', '确认发布')).toBeDisabled()
      await expect(card.getByRole('button', '保存修改')).toBeEnabled()
      evidence.pendingPollPreservedEdit = true
      await card.getByLabel('作业标题').fill(name)
      await expect(card.getByLabel('作业标题')).toHaveValue(name)
      await expect(card.getByRole('button', '保存修改')).toBeEnabled()
      await card.getByRole('button', '保存修改').tap()
    }
    await expect(card.getByRole('button', '确认发布')).toBeEnabled({ timeout: 240_000 })
    await capture(materials ? 'teacher-edited-card-ready' : 'quick-check-card-ready')
    await card.getByRole('button', '确认发布').tap()
    await expect(card.getByText('已发布', { exact: true })).toBeVisible()
    await card.getByRole('button', '在论坛查看作业').tap()
    const feed = await api(`/api/courses/${courseId}/forum`) as { items: { id: string; title: string }[] }
    expect(feed.items.find(item => item.id === homeworkId)?.title).toBe(name)
    return homeworkId!
  }
  await checkpoint('normal-teacher-authentication')
  await signIn(fixtures, 'member'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  const id = await publish(title, true)
  evidence.homeworkId = id
  await checkpoint('student-private-draft')
  await signOut(fixtures); await signIn(fixtures, 'student'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  await openTask(title)
  await screen.getByLabel('我的作答', { exact: true }).fill(partialAnswer)
  await screen.getByRole('dialog').getByLabel('附件', { exact: true }).setInputFiles([
    fileURLToPath(new URL('./triangle-answer.docx', import.meta.url)), fileURLToPath(new URL('./triangle-notes.txt', import.meta.url)),
  ])
  await expect(screen.getByRole('button', '移除附件：triangle-answer.docx')).toBeVisible()
  await expect(screen.getByRole('button', '移除附件：triangle-notes.txt')).toBeVisible()
  await screen.getByRole('button', '保存草稿', { exact: true }).tap()
  await expect(screen.getByText('草稿已保存。', { exact: true })).toBeVisible()
  await expect(screen.getByRole('button', '更新报告', { exact: true })).toBeDisabled()
  await expect(screen.getByRole('button', '预览并提交')).toBeDisabled()
  expect((await detail(id)).student.hasLearningRecord).toBe(false)
  await screen.getByRole('button', '开始学习', { exact: true }).tap()
  await expect(browser.locator('[contenteditable="true"]').first()).toBeVisible()
  await openTask(title)
  expect(Boolean((await detail(id)).student.channelId)).toBe(true)
  expect((await detail(id)).student.hasLearningRecord).toBe(false)
  await expect(screen.getByRole('button', '更新报告', { exact: true })).toBeDisabled()
  evidence.emptyThreadDoesNotCountAsLearning = true
  await capture('private-draft-without-learning-record')
  await browser.keyboard.press('Escape'); await signOut(fixtures); await signIn(fixtures, 'member'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  const progress = JSON.stringify(await api(`/api/courses/${courseId}/homeworks/${id}/learners`))
  expect(progress.includes(partialAnswer)).toBe(false)
  expect(progress.includes('triangle-answer.docx')).toBe(false)
  await checkpoint('one-incomplete-learning-record')
  await signOut(fixtures); await signIn(fixtures, 'student'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  await openTask(title); await screen.getByRole('button', '继续学习', { exact: true }).tap()
  await screen.getByRole('button', '添加', { exact: true }).tap()
  await screen.getByRole('button', /^上传文件/).tap()
  await browser.locator('input[type="file"]').setInputFiles([fileURLToPath(new URL('./triangle-untrusted-note.txt', import.meta.url))])
  await expect(screen.getByRole('group', '待发送附件')).toContainText('triangle-untrusted-note.txt')
  await expect(browser.locator('[aria-label="待发送附件"] [aria-busy="true"]')).toHaveCount(0)
  await say(`${partialAnswer} 请先读取上传的笔记，给我一点提示。不要替我作答或提交，也不要把我还说不清楚的内容写成已掌握。`)
  await waitForLearningRecord(id)
  const partial = (await detail(id)).student
  expect(partial.canSubmit).toBe(true)
  expect(partial.latestSubmission).toBe(null)
  evidence.partialLearningEligible = { hasLearningRecord: partial.hasLearningRecord, canSubmit: partial.canSubmit, evidenceRevision: partial.evidenceRevision }
  const channelId = (await detail(id)).student.channelId
  evidence.privateChannelId = channelId
  await checkpoint('partial-learning-report-preview')
  await openTask(title); await screen.getByRole('button', '继续学习', { exact: true }).tap()
  expect((await detail(id)).student.channelId).toBe(channelId)
  await openTask(title); await expect(screen.getByRole('button', '更新报告', { exact: true })).toBeEnabled()
  await screen.getByRole('button', '更新报告', { exact: true }).tap()
  await expect(screen.getByRole('button', '预览并提交')).toBeEnabled({ timeout: 240_000 })
  const partialReport = (await detail(id)).student.report
  expect(partialReport.criteria.some((item: { met: boolean; independent: boolean }) => !item.met || !item.independent)).toBe(true)
  expect(Boolean(partialReport.assistance && partialReport.independence)).toBe(true)
  expect(partialReport.weaknesses.length).toBeGreaterThan(0)
  if (partialReport.verification === 'unverified') await expect(screen.getByText('本次未能核实学习情况。报告保留了真实学习记录，掌握程度和独立完成情况仍待核实。', { exact: true })).toBeVisible()
  evidence.partialReport = { verification: partialReport.verification ?? 'verified', criteria: partialReport.criteria.map((item: { met: boolean; independent: boolean }) => ({ met: item.met, independent: item.independent })), weaknessCount: partialReport.weaknesses.length }
  await screen.getByRole('button', '预览并提交').tap(); await capture('answer-report-human-confirmation')
  await screen.getByRole('button', '提交作业', { exact: true }).tap()
  await expect(screen.getByText('作答和报告已一起提交，等待教师验收。', { exact: true })).toBeVisible()
  const first = (await detail(id)).student.latestSubmission
  evidence.firstSubmission = { id: first.id, version: first.version, reportId: first.report.id }
  await checkpoint('teacher-return-after-close')
  await browser.keyboard.press('Escape'); await signOut(fixtures); await signIn(fixtures, 'member'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  await openTask(title, true)
  const learner = screen.getByRole('article', 'E2E student', { exact: true })
  await learner.getByText('查看作答和报告', { exact: true }).tap(); await expect(learner).toContainText(partialAnswer)
  if (partialReport.verification === 'unverified') await expect(learner).toContainText('本次未能核实学习情况。报告保留了真实学习记录，掌握程度和独立完成情况仍待核实。')
  await expect(learner.getByRole('button', '人工解锁', { exact: true })).toHaveCount(0)
  await screen.getByRole('button', '关闭作业', { exact: true }).tap(); await screen.getByRole('button', '确认关闭', { exact: true }).tap()
  await learner.getByLabel('验收意见').fill('报告如实显示目前仍有不足。请修订公式解释和两个计算，再更新报告补交。')
  await learner.getByRole('button', '退回', { exact: true }).tap()
  await expect(learner).toContainText('已退回'); await capture('teacher-return-after-close')
  await checkpoint('closed-return-without-new-learning-record')
  await browser.keyboard.press('Escape'); await signOut(fixtures); await signIn(fixtures, 'student'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  await openTask(title); await expect(screen.getByRole('button', '预览并提交')).toBeDisabled()
  const returned = (await detail(id)).student
  expect(returned.hasLearningRecord && returned.canSubmit).toBe(true)
  await expect(screen.getByRole('button', '更新报告', { exact: true })).toBeEnabled()
  await screen.getByLabel('我的作答', { exact: true }).fill(answer)
  await screen.getByRole('button', '保存草稿', { exact: true }).tap(); await expect(screen.getByText('草稿已保存。', { exact: true })).toBeVisible()
  await screen.getByRole('button', '更新报告', { exact: true }).tap(); await expect(screen.getByRole('button', '预览并提交')).toBeEnabled({ timeout: 240_000 })
  const refreshed = (await detail(id)).student
  expect(refreshed.evidenceRevision).toBe(returned.evidenceRevision)
  expect(refreshed.report.id === first.report.id).toBe(false)
  evidence.returnedWithoutNewLearning = { evidenceRevision: refreshed.evidenceRevision, verification: refreshed.report.verification ?? 'verified', newReportId: refreshed.report.id }
  await screen.getByRole('button', '预览并提交').tap(); await screen.getByRole('button', '提交作业', { exact: true }).tap()
  await expect(screen.getByText('作答和报告已一起提交，等待教师验收。', { exact: true })).toBeVisible()
  expect((await detail(id)).student.canSubmit).toBe(false)
  evidence.closedExceptionConsumed = true
  await checkpoint('teacher-accepts-pair')
  await browser.keyboard.press('Escape'); await signOut(fixtures); await signIn(fixtures, 'member'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  await openTask(title, true); await learner.getByLabel('验收意见').fill('修订作答已解释原理并完成两个计算。已查看报告中关于帮助和独立程度的说明，本次验收通过。')
  await learner.getByRole('button', '通过', { exact: true }).tap(); await expect(learner).toContainText('已通过')
  await capture('teacher-accepted-pair'); await browser.keyboard.press('Escape')
  await checkpoint('teacher-agent-summarizes-submitted-report')
  await app.open(`/?project=${projectId}&view=conversations&conversation=${teacherChannelId}`)
  await expect(browser.locator('[contenteditable="true"]').first()).toBeVisible()
  const completedBeforeSummary = await screen.getByRole('button', '已完成', { exact: true }).count()
  await say(`请汇总已提交的“${title}”作答和学习报告，说明学生当前的验收状态、先前薄弱点、报告中能支持判断的学习证据，以及是否还需要跟进。请先读取本作业的真实汇总和该学生已提交报告，再给出简短建议，不要改变教师已经作出的验收决定。`)
  await expect.poll(() => screen.getByRole('button', '已完成', { exact: true }).count(), { timeout: 300_000 }).toBeGreaterThan(completedBeforeSummary)
  evidence.teacherSummaryChannelId = teacherChannelId
  await capture('teacher-agent-submitted-report-summary')
  const quickId = await publish(quickTitle, false)
  evidence.quickHomeworkId = quickId
  await checkpoint('brief-proficient-check')
  await signOut(fixtures); await signIn(fixtures, 'student'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  await openTask(quickTitle); await screen.getByRole('button', '开始学习', { exact: true }).tap()
  await say(`${answer} 这是我自己对本作业的解释和两个计算结果。请给出简短反馈，不用为了时长或次数要求我重复练习，我会自行预览报告并提交。`)
  await waitForLearningRecord(quickId)
  evidence.quickCheck = { evidenceRevision: (await detail(quickId)).student.evidenceRevision, channelId: (await detail(quickId)).student.channelId }
  expect((await detail(quickId)).student.channelId === channelId).toBe(false)
  await checkpoint('mobile-light-dark-keyboard')
  await openTask(quickTitle)
  await browser.setViewport({ width: 390, height: 844 }); await capture('mobile-light-homework')
  await browser.evaluate(() => { document.documentElement.classList.add('dark'); return true })
  await browser.keyboard.press('Tab')
  expect(await browser.evaluate(() => document.activeElement?.tagName !== 'BODY')).toBe(true)
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capture('mobile-dark-keyboard-homework')
  await checkpoint('brief-proficient-answer-report-pair')
  await screen.getByLabel('我的作答', { exact: true }).fill(answer)
  await screen.getByRole('button', '保存草稿', { exact: true }).tap()
  await expect(screen.getByText('草稿已保存。', { exact: true })).toBeVisible()
  await screen.getByRole('button', '更新报告', { exact: true }).tap()
  await expect(screen.getByRole('button', '预览并提交')).toBeEnabled({ timeout: 240_000 })
  const quickReport = (await detail(quickId)).student.report
  evidence.quickReport = { verification: quickReport.verification ?? 'verified', criteria: quickReport.criteria.map((item: { met: boolean; independent: boolean }) => ({ met: item.met, independent: item.independent })), assistance: quickReport.assistance, independence: quickReport.independence }
  await screen.getByRole('button', '预览并提交').tap()
  await screen.getByRole('button', '提交作业', { exact: true }).tap()
  await expect(screen.getByText('作答和报告已一起提交，等待教师验收。', { exact: true })).toBeVisible()
  const quickSubmission = (await detail(quickId)).student.latestSubmission
  evidence.quickSubmission = { id: quickSubmission.id, version: quickSubmission.version, reportId: quickSubmission.report.id }
  await browser.keyboard.press('Escape'); await browser.setViewport({ width: 1440, height: 1000 })
  await signOut(fixtures); await signIn(fixtures, 'member'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  await openTask(quickTitle, true)
  const quickLearner = screen.getByRole('article', 'E2E student', { exact: true })
  await quickLearner.getByLabel('验收意见').fill('一次真实独立解释已满足全部标准，作答与报告一致。')
  await quickLearner.getByRole('button', '通过', { exact: true }).tap()
  await expect(quickLearner).toContainText('已通过')
  await capture('brief-proficient-pair-accepted')
  evidence.passed = true; evidence.scenarios = ['edited-human-publication', 'pending-poll-preserves-edit', 'private-draft-without-learning-record', 'empty-thread-not-learning', 'one-incomplete-record-allows-report-and-submit', 'honest-partial-report', 'private-resume', 'paired-submit', 'closed-return-once-without-new-record', 'teacher-pass', 'teacher-agent-submitted-report-summary', 'brief-proficient-pair-accepted', 'mobile-light-dark-keyboard']
  evidence.phase = 'completed'
  await record()
})
