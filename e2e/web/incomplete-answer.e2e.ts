import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Synthetic state/IM boundaries; real product projection, components and send
// transport. No production/provider call and no tool execution.
test('partial and blocked replies keep results and recover through explicit new messages', async ({ app, browser, screen }) => {
  const open = (outcome: string) => app.open(`/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=light&scenario=incomplete-answer&outcome=${outcome}`)
  const step = (action: string) => browser.evaluate(action => window.dispatchEvent(new CustomEvent('incomplete-answer-step', { detail: action })), action)
  const card = browser.locator('[data-run-outcome]')
  const retry = () => screen.getByRole('button', '重试', { exact: true })
  const sends = async () => JSON.parse(await browser.evaluate(() => document.documentElement.dataset.incompleteSends ?? '[]')) as { id: string; custom: Record<string, unknown> }[]
  for (const outcome of ['partial', 'blocked']) {
    await open(outcome)
    await expect(card).toContainText('答复尚未完成')
    await expect(card).toHaveAttribute('data-run-outcome', outcome)
    await expect(retry()).toBeEnabled()
    expect(await sends()).toHaveLength(0)
    await step('replay')
    expect(await card.count()).toBe(1)
    expect(await sends()).toHaveLength(0)
    await step('body')
    await expect(screen.getByText('已生成的示例说明。', { exact: true })).toBeVisible()
    await expect(screen.getByText('合成附件.pdf', { exact: true })).toBeVisible()
    await expect(card).toContainText('答复尚未完成')
    await step('read-only')
    await expect(retry()).toBeDisabled()
    await step('writable')
    await step('other-running')
    await expect(retry()).toBeDisabled()
    await step('idle')
    await expect(retry()).toBeEnabled()
    await step('target-missing')
    await expect(retry()).toBeDisabled()
    expect(await sends()).toHaveLength(0)
    await step('target-present')
    await expect(retry()).toBeEnabled()
    await retry().press('Enter')
    await expect(card).toContainText('正在重试')
    expect(await sends()).toHaveLength(1)
    const first = (await sends())[0]
    expect(first.id.startsWith('temp-')).toBe(true)
    expect(first.custom.replyToClientMsgNo).toBe('incomplete-question')
    expect(first.custom.mentionedIds).toEqual(['scout'])
    await step('sent')
    await expect(retry()).toBeEnabled()
    await browser.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-run-outcome] button')!
      button.click(); button.click()
      return true
    })
    await expect(card).toContainText('正在重试')
    expect(await sends()).toHaveLength(2)
    expect((await sends())[1].id).not.toBe(first.id)
    await step('sent')
    await expect(retry()).toBeEnabled()
    await app.screenshot(`issue-331-${outcome}-preserved-results`)
    await browser.reload()
    await expect(card).toContainText('答复尚未完成')
    expect(await card.count()).toBe(1)
    expect(await sends()).toHaveLength(0)
    await step('cancelled')
    await expect(screen.getByText('已取消', { exact: true })).toBeVisible()
    expect(await card.count()).toBe(0)
    expect(await sends()).toHaveLength(0)
  }
})
