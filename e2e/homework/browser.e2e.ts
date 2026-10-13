import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { selectWorkspace, signIn, signOut } from '../web/accounts'
import { semanticEvidence } from '../web/evidence'

test('real teacher drafting, private mastery, report pair, closed return, quick verification and teacher acceptance', async fixtures => {
  const { app, screen, browser } = fixtures
  const courseId = process.env.E2E_HOMEWORK_COURSE_ID!, projectId = process.env.E2E_HOMEWORK_PROJECT_ID!
  expect(Boolean(courseId && projectId && process.env.LINGXIOS_LIVE_HOMEWORK === '1')).toBe(true)
  const title = '真实作业验收：三角形面积', quickTitle = '快速掌握核对：三角形面积'
  const criteria = ['独立说明三角形面积为何是同底同高长方形面积的一半。', '独立计算底为8、高为5以及底为10、高为3的三角形面积，并写明单位。']
  const answer = '两个全等三角形可以拼成同底同高的长方形，所以每个三角形的面积是底乘垂直高再除以2。底8高5的面积为20平方单位；底10高3的面积为15平方单位。'
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
  const forum = async () => { await app.open(`/?project=${projectId}&view=forum`); await expect(screen.getByLabel('搜索论坛')).toBeVisible() }
  const openTask = async (name: string, teacher = false) => {
    await forum(); await browser.locator('article').filter({ hasText: name }).getByRole('button', teacher ? '查看进度与验收' : '查看作业', { exact: true }).tap()
    await expect(screen.getByRole('dialog', name, { exact: true })).toBeVisible()
  }
  const say = async (text: string) => {
    const composer = browser.locator('[contenteditable="true"]').first()
    await expect(composer).toBeVisible(); await composer.fill(text); await screen.getByRole('button', '发送', { exact: true }).tap()
    await expect(browser.locator('[data-msg-id]').filter({ hasText: text })).toBeVisible()
  }
  const publish = async (name: string, materials: boolean) => {
    await checkpoint(materials ? 'teacher-draft-native-card' : 'quick-check-draft-native-card')
    await forum(); await screen.getByRole('button', '发布作业', { exact: true }).tap()
    await say(`请为本课程创建一份个人作业草稿，标题“${name}”。要求学生独立说明三角形面积为什么等于底乘高除以2，并计算底8高5、底10高3的面积，注明平方单位。验收标准为独立解释原理和正确迁移计算。请用作业草稿卡让我检查，等我点击确认后发布。`)
    teacherChannelId = await browser.evaluate(() => new URL(location.href).searchParams.get('conversation') ?? '')
    const card = browser.locator('[aria-label="作业草稿"]').last()
    await expect(card).toBeVisible({ timeout: 300_000 })
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
    if (materials) await browser.evaluate(() => {
      const original = window.fetch.bind(window)
      const state = window as unknown as { homeworkPollWaiting?: boolean; releaseHomeworkPoll?: () => void }
      let held = false
      window.fetch = async (...args) => {
        const response = await original(...args)
        if (!held && /\/api\/courses\/[^/]+\/homeworks\/[^/?]+$/.test(String(args[0])) && (!args[1]?.method || args[1].method === 'GET')) {
          held = true; state.homeworkPollWaiting = true
          await new Promise<void>(resolve => { state.releaseHomeworkPoll = resolve })
          state.homeworkPollWaiting = false; window.fetch = original
        }
        return response
      }
      return true
    })
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
      evidence.pendingPollPreservedEdit = true
      await card.getByLabel('作业标题').fill(name)
      await card.getByRole('button', '保存修改').tap()
    }
    await expect(card.getByRole('button', '确认发布')).toBeEnabled({ timeout: 240_000 })
    await capture(materials ? 'teacher-edited-card-ready' : 'quick-check-card-ready')
    await card.getByRole('button', '确认发布').tap()
    await expect(card.getByText('已发布', { exact: true })).toBeVisible()
    await card.getByRole('button', '在论坛查看作业').tap()
    const feed = await api(`/api/courses/${courseId}/forum`) as { items: { id: string; title: string }[] }
    const id = feed.items.find(item => item.title === name)?.id
    expect(Boolean(id)).toBe(true)
    return id!
  }
  await checkpoint('normal-teacher-authentication')
  await signIn(fixtures, 'member'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  const id = await publish(title, true)
  evidence.homeworkId = id
  await checkpoint('student-private-draft')
  await signOut(fixtures); await signIn(fixtures, 'student'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  await openTask(title)
  await screen.getByLabel('我的作答', { exact: true }).fill(answer)
  await screen.getByRole('dialog').getByLabel('附件', { exact: true }).setInputFiles([
    fileURLToPath(new URL('./triangle-answer.docx', import.meta.url)), fileURLToPath(new URL('./triangle-notes.txt', import.meta.url)),
  ])
  await expect(screen.getByRole('button', '移除附件：triangle-answer.docx')).toBeVisible()
  await expect(screen.getByRole('button', '移除附件：triangle-notes.txt')).toBeVisible()
  await screen.getByRole('button', '保存草稿', { exact: true }).tap()
  await expect(screen.getByText('草稿已保存。', { exact: true })).toBeVisible()
  await expect(screen.getByRole('button', '预览并提交')).toBeDisabled()
  await capture('locked-private-draft')
  await browser.keyboard.press('Escape'); await signOut(fixtures); await signIn(fixtures, 'member'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  const progress = JSON.stringify(await api(`/api/courses/${courseId}/homeworks/${id}/learners`))
  expect(progress.includes(answer)).toBe(false)
  expect(progress.includes('triangle-answer.docx')).toBe(false)
  await checkpoint('misconception-tutoring')
  await signOut(fixtures); await signIn(fixtures, 'student'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  await openTask(title); await screen.getByRole('button', '开始学习', { exact: true }).tap()
  await say('我认为三角形面积就是底乘高，因此底8高5的三角形面积是40平方单位。我还不能说明为什么有的公式要除以2。请针对这份作业检查我的理解，给我一点提示，不要直接替我完成作答，并记录还没掌握的要求。')
  await expect.poll(async () => (await detail(id)).student.evidenceRevision, { timeout: 300_000 }).toBeGreaterThan(0)
  await expect.poll(async () => (await detail(id)).student.criteria.some((item: { feedback: string }) => item.feedback.length > 0 && item.feedback !== '等待学习证据'), { timeout: 240_000 }).toBe(true)
  expect((await detail(id)).student.unlocked).toBe(false)
  evidence.misconceptionLocked = true
  await checkpoint('independent-transfer-assessment')
  await capture('targeted-tutoring')
  await say(`${answer} 我没有照抄刚才的提示，而是用拼成长方形的方法解释，并分别计算了两个例子。请根据本次真实对话核验每条作业标准，确认我能否独立完成。`)
  await expect.poll(async () => (await detail(id)).student.unlocked, { timeout: 300_000 }).toBe(true)
  const channelId = (await detail(id)).student.channelId
  evidence.privateChannelId = channelId
  await checkpoint('private-resume-and-report-preview')
  await openTask(title); await screen.getByRole('button', '继续学习', { exact: true }).tap()
  expect((await detail(id)).student.channelId).toBe(channelId)
  await openTask(title); await screen.getByRole('button', '更新报告', { exact: true }).tap()
  await expect(screen.getByRole('button', '预览并提交')).toBeEnabled({ timeout: 240_000 })
  await screen.getByRole('button', '预览并提交').tap(); await capture('answer-report-human-confirmation')
  await screen.getByRole('button', '提交作业', { exact: true }).tap()
  await expect(screen.getByText('作答和报告已一起提交，等待教师验收。', { exact: true })).toBeVisible()
  const first = (await detail(id)).student.latestSubmission
  evidence.firstSubmission = { id: first.id, version: first.version, reportId: first.report.id }
  await checkpoint('teacher-return-after-close')
  await browser.keyboard.press('Escape'); await signOut(fixtures); await signIn(fixtures, 'member'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  await openTask(title, true)
  const learner = screen.getByRole('article', 'E2E student', { exact: true })
  await learner.getByText('查看作答和报告', { exact: true }).tap(); await expect(learner).toContainText(answer)
  await screen.getByRole('button', '关闭作业', { exact: true }).tap(); await screen.getByRole('button', '确认关闭', { exact: true }).tap()
  await learner.getByLabel('验收意见').fill('请补充说明：底保持10不变，高从3变为6时，面积怎样变化，为什么？')
  await learner.getByRole('button', '退回', { exact: true }).tap()
  await expect(learner).toContainText('已退回'); await capture('teacher-return-after-close')
  await checkpoint('targeted-post-return-evidence')
  await browser.keyboard.press('Escape'); await signOut(fixtures); await signIn(fixtures, 'student'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  await openTask(title); await expect(screen.getByRole('button', '预览并提交')).toBeDisabled()
  await screen.getByRole('button', '继续学习', { exact: true }).tap()
  await say('针对老师退回的问题：底保持10，高从3增加到6，长方形面积也变为原来的2倍。三角形仍占同底同高长方形的一半，因此三角形面积从15变为30平方单位，也增加到原来的2倍。请只针对这条反馈重新核验，并保留之前已验证的独立解释和计算。')
  await expect.poll(async () => (await detail(id)).student.unlocked, { timeout: 300_000 }).toBe(true)
  await openTask(title)
  await screen.getByLabel('我的作答', { exact: true }).fill(`${answer}\n底10、高从3变成6时，面积从15变成30平方单位。高度加倍使同底长方形面积加倍，三角形仍为其一半，所以面积也加倍。`)
  await screen.getByRole('button', '保存草稿', { exact: true }).tap(); await expect(screen.getByText('草稿已保存。', { exact: true })).toBeVisible()
  await screen.getByRole('button', '更新报告', { exact: true }).tap(); await expect(screen.getByRole('button', '预览并提交')).toBeEnabled({ timeout: 240_000 })
  await screen.getByRole('button', '预览并提交').tap(); await screen.getByRole('button', '提交作业', { exact: true }).tap()
  await expect(screen.getByText('作答和报告已一起提交，等待教师验收。', { exact: true })).toBeVisible()
  expect((await detail(id)).student.canSubmit).toBe(false)
  evidence.closedExceptionConsumed = true
  await checkpoint('teacher-accepts-pair')
  await browser.keyboard.press('Escape'); await signOut(fixtures); await signIn(fixtures, 'member'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  await openTask(title, true); await learner.getByLabel('验收意见').fill('已独立解释原理，并正确回答高度加倍的迁移问题。')
  await learner.getByRole('button', '通过', { exact: true }).tap(); await expect(learner).toContainText('已通过')
  await capture('teacher-accepted-pair'); await browser.keyboard.press('Escape')
  await checkpoint('teacher-agent-summarizes-submitted-report')
  await app.open(`/?project=${projectId}&view=conversations&conversation=${teacherChannelId}`)
  await expect(browser.locator('[contenteditable="true"]').first()).toBeVisible()
  const completedBeforeSummary = await screen.getByRole('button', '已完成', { exact: true }).count()
  await say(`请汇总已提交的“${title}”作答和学习报告，说明学生当前的验收状态、先前薄弱点、补充的独立学习证据，以及是否还需要跟进。请先读取本作业的真实汇总和该学生已提交报告，再给出简短建议，不要改变教师已经作出的验收决定。`)
  await expect.poll(() => screen.getByRole('button', '已完成', { exact: true }).count(), { timeout: 300_000 }).toBeGreaterThan(completedBeforeSummary)
  evidence.teacherSummaryChannelId = teacherChannelId
  await capture('teacher-agent-submitted-report-summary')
  const quickId = await publish(quickTitle, false)
  evidence.quickHomeworkId = quickId
  await checkpoint('brief-proficient-check')
  await signOut(fixtures); await signIn(fixtures, 'student'); await selectWorkspace(fixtures, 'Homework Live Classroom')
  await openTask(quickTitle); await screen.getByRole('button', '开始学习', { exact: true }).tap()
  await say(`${answer} 这是我对本作业的独立解释和两个计算结果，请核对这些真实证据是否已经达到每一条标准；如果已掌握，请直接记录，不要要求我为了时长或次数重复练习。`)
  await expect.poll(async () => (await detail(quickId)).student.unlocked, { timeout: 300_000 }).toBe(true)
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
  evidence.passed = true; evidence.scenarios = ['edited-human-publication', 'pending-poll-preserves-edit', 'private-locked-draft', 'misconception-tutoring-transfer', 'private-resume', 'paired-submit', 'closed-return-once', 'teacher-pass', 'teacher-agent-submitted-report-summary', 'brief-proficient-check', 'mobile-light-dark-keyboard']
  evidence.phase = 'completed'
  await record()
})
