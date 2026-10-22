import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { annotation, command, commentary, historyFixture, snapshot } from './data'

test('bounded history retries in one process entry without replacing live answer or repeating entries', async ({ app, browser, screen }) => {
  const fixture = historyFixture()
  await command('reset', { ...fixture, failPages: 1 })
  await app.open('/e2e/answer-first.html')
  await expect(screen.getByText('当前有效答案不会被历史替换。', { exact: true })).toBeVisible()
  await expect(browser.locator('[data-slot="run-activity"]')).toHaveCount(1)
  await browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > button').tap()
  const history = browser.locator('[data-slot="run-activity-history"]')
  await expect(history.getByRole('alert')).toBeVisible()
  await history.getByRole('button').tap()
  await expect(screen.getByText('公开过程 000', { exact: true })).toBeVisible()
  await history.getByRole('button').tap()
  await history.getByRole('button').tap()
  await expect(history.getByRole('button')).toHaveCount(0)
  await expect(browser.locator('[data-slot="run-activity"] li[data-activity-kind]')).toHaveCount(96)
  expect(await browser.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-slot="run-activity"] li[data-activity-kind]')]
    const texts = rows.map(row => row.textContent?.trim())
    return { unique: new Set(texts).size, first: texts[0] ?? null, last: texts.at(-1) ?? null }
  })).toEqual({ unique: 96, first: '公开过程 000', last: '已归档的公开答案前缀' })
  await expect(browser.locator('[data-message-region="body"]')).not.toContainText('已归档的公开答案前缀')
  await expect(browser.locator('[data-message-region="body"]')).toContainText('当前有效答案不会被历史替换。')
  await app.screenshot('answer-first-complete-paged-history')
  await browser.reload()
  await expect(screen.getByText('当前有效答案不会被历史替换。', { exact: true })).toBeVisible()
  await expect(browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > button')).toHaveAttribute('aria-expanded', 'false')
})

test('late history page cannot replace newer live data or new-request content', async ({ app, browser, screen }) => {
  const fixture = historyFixture()
  await command('reset', { ...fixture, holdPages: true })
  await app.open('/e2e/answer-first.html')
  await expect(screen.getByText('当前有效答案不会被历史替换。', { exact: true })).toBeVisible()
  await browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > button').tap()
  const history = browser.locator('[data-slot="run-activity-history"]')
  await expect(history.getByRole('button')).toBeDisabled()
  const updated = snapshot([...fixture.entries.slice(-39), commentary(96), fixture.answer], { seq: 101, custom: { activityHistory: { total: 97, attention: 0 } } })
  await command('publish', updated)
  await expect(screen.getByText('公开过程 096', { exact: true })).toBeVisible()
  await command('release')
  await expect(browser.locator('[data-message-region="body"]')).toContainText('当前有效答案不会被历史替换。')
  // Same-scope older pages may fill missing history; they cannot overwrite live
  // entries or force a traversal restart on every new stream frame.
  await expect(screen.getByText('公开过程 000', { exact: true })).toBeVisible()
  await expect(screen.getByText('公开过程 096', { exact: true })).toBeVisible()
  await expect(browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > button')).toHaveAttribute('aria-expanded', 'true')
  await history.getByRole('button').tap()
  await expect(history.getByRole('button')).toBeDisabled()
  await command('publish', snapshot([{ type: 'text', text: '新的请求拥有新的答案。', ...annotation('new-answer', 'answer', { requestVersion: 2 }) }], { requestVersion: 2, seq: 102 }))
  await expect(screen.getByText('新的请求拥有新的答案。', { exact: true })).toBeVisible()
  await command('release')
  await expect(screen.getByText('公开过程 000', { exact: true })).not.toBeVisible()
  await expect(screen.getByText('当前有效答案不会被历史替换。', { exact: true })).not.toBeVisible()
  await app.screenshot('answer-first-stale-page-rejected')
})
