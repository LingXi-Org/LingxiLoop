import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

declare global {
  interface Window {
    homeworkValidationFixture: {
      settle(status: 'READY'): void
      snapshot(): { homework: { title: string; instructions: string; revision: number; attachments: { key: string; name: string }[] }; validateRequests: number; publishRequests: number; saveRequests: number }
    }
  }
}

const path = '/e2e/homework-validation/index.html'

test('invalid feedback is visible in both themes and editing requires a new current check before publishing', async ({ app, browser, screen }) => {
  await app.open(`${path}?failSave=1`)
  await expect(screen.getByRole('alert')).toContainText('验收标准“理解课件”无法直接核验')
  await expect(browser.locator('[role="alert"] svg[aria-hidden="true"]')).toBeVisible()
  await expect(screen.getByRole('button', '确认发布', { exact: true })).toBeDisabled()
  await expect(screen.getByLabel('作业要求', { exact: true })).toContainText('阅读课程提纲，解释一个知识点')
  await app.screenshot('invalid-light')
  await app.open(`${path}?failSave=1&theme=dark`)
  await expect(screen.getByRole('alert')).toContainText('验收标准“理解课件”无法直接核验')
  await expect(screen.getByLabel('作业要求', { exact: true })).toContainText('阅读课程提纲，解释一个知识点')
  await app.screenshot('invalid-dark')
  await screen.getByLabel('作业标题', { exact: true }).fill('修改后的知识点应用练习')
  await expect(screen.getByRole('alert')).toHaveCount(0)
  await expect(screen.getByRole('button', '确认发布', { exact: true })).toBeDisabled()
  await screen.getByRole('button', '保存修改', { exact: true }).tap()
  await expect(screen.getByRole('alert')).toContainText('当前输入和附件已保留。')
  await expect(screen.getByLabel('作业标题', { exact: true })).toHaveValue('修改后的知识点应用练习')
  await expect(screen.getByRole('link', '课程提纲.pptx', { exact: true })).toBeVisible()
  await expect(screen.getByRole('button', '重新加载草稿', { exact: true })).toHaveCount(0)
  await screen.getByRole('button', '保存修改', { exact: true }).tap()
  await expect(screen.getByText('正在检查要求与资料，完成后可以确认发布。', { exact: true })).toBeVisible()
  await expect(screen.getByRole('button', '确认发布', { exact: true })).toBeDisabled()
  await browser.evaluate(() => { window.homeworkValidationFixture.settle('READY'); return true })
  await expect(screen.getByRole('button', '确认发布', { exact: true })).toBeEnabled()
  await screen.getByRole('button', '确认发布', { exact: true }).tap()
  await expect(screen.getByText('已发布', { exact: true })).toBeVisible()
  const receipt = await browser.evaluate(() => window.homeworkValidationFixture.snapshot())
  expect(receipt.saveRequests).toBe(2)
  expect(receipt.publishRequests).toBe(1)
  expect(receipt.homework.title).toBe('修改后的知识点应用练习')
  expect(receipt.homework.attachments).toEqual([{ key: 'fixture/course-outline.pptx', name: '课程提纲.pptx' }])
  console.log('HOMEWORK_VALIDATION_PUBLISH', JSON.stringify(receipt))
})

test('material guidance and service retry preserve the draft and attachment through failure and recovery', async ({ app, browser, screen }) => {
  await app.open(`${path}?state=MATERIAL_ERROR`)
  await expect(screen.getByRole('alert')).toContainText('课程提纲.pptx：未读到可用文字')
  await expect(screen.getByRole('alert')).toContainText('带文字层的 PDF')
  await expect(screen.getByRole('button', '重试检查', { exact: true })).toBeEnabled()
  await app.screenshot('material-error')
  await app.open(`${path}?state=ERROR&failRetry=1`)
  await expect(screen.getByRole('alert')).toContainText('课程提纲.pptx的读取服务暂时未能完成检查。请重试检查')
  await expect(screen.getByRole('alert')).toContainText('草稿和附件已保留。')
  const before = await browser.evaluate(() => window.homeworkValidationFixture.snapshot().homework)
  await screen.getByRole('button', '重试检查', { exact: true }).tap()
  await expect(browser.locator('p[role="alert"]')).toContainText('服务暂时不可用，请稍后再试。 当前输入和附件已保留。')
  await expect(screen.getByLabel('作业标题', { exact: true })).toHaveValue(before.title)
  await expect(screen.getByRole('link', '课程提纲.pptx', { exact: true })).toBeVisible()
  await app.screenshot('service-error-keeps-draft')
  await screen.getByRole('button', '重试检查', { exact: true }).tap()
  await expect(screen.getByText('正在检查要求与资料，完成后可以确认发布。', { exact: true })).toBeVisible()
  const after = await browser.evaluate(() => window.homeworkValidationFixture.snapshot())
  expect(after.validateRequests).toBe(2)
  expect(after.homework.revision).toBe(before.revision)
  expect(after.homework.instructions).toBe(before.instructions)
  expect(after.homework.attachments).toEqual(before.attachments)
  expect(after.publishRequests).toBe(0)
  await expect(screen.getByRole('button', '确认发布', { exact: true })).toBeDisabled()
  console.log('HOMEWORK_VALIDATION_RETRY', JSON.stringify(after))
})

test('a ready receipt for a previous revision cannot publish the current draft', async ({ app, browser, screen }) => {
  await app.open(`${path}?state=READY&stale=1`)
  await expect(screen.getByLabel('作业标题', { exact: true })).toHaveValue('课程知识点应用练习')
  await expect(screen.getByRole('button', '确认发布', { exact: true })).toBeDisabled()
  expect(await browser.evaluate(() => window.homeworkValidationFixture.snapshot().publishRequests)).toBe(0)
})
