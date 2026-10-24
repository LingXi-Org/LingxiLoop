import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Production card/page/SDK/primitives; deterministic public API and authored
// second-version reference. No provider, actual homework submission or mastery claim.
test('student operates a topology, compares settings and continues in the original conversation', async ({ app, browser, screen }) => {
  await app.open('/e2e/visualize/learning.html')
  const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
  await expect(guest.getByRole('img', '路由器连接教室 A 和教室 B', { exact: true })).toBeVisible()
  await guest.getByRole('button', '保存我的判断', { exact: true }).tap()
  await expect(guest.locator('#status')).toHaveText('判断已保存，等待核对')
  await screen.getByRole('button', '检查我的思路', { exact: true }).tap()
  await expect(screen.getByLabel('我的推导')).toHaveValue('我认为每个子网需要 32 个地址。\n\n请检查我的思路，指出第一处需要核对的地方，让我先尝试修正。')
  const before = await browser.evaluate(() => {
    const separator = document.querySelector('[role="separator"]')!;
    return { width: document.querySelector('[data-panel="true"]')?.getBoundingClientRect().width ?? 0, value: separator.getAttribute('aria-valuenow') };
  })
  await screen.getByRole('separator', '调整练习与作品宽度', { exact: true }).press('ArrowRight')
  const after = await browser.evaluate(() => document.querySelector('[role="separator"]')!.getAttribute('aria-valuenow'))
  expect(after).not.toBe(before.value)
  await screen.getByRole('button', '调整设计', { exact: true }).tap()
  await screen.getByRole('slider', '每个子网地址数', { exact: true }).press('ArrowRight')
  await expect(guest.locator('#plan')).toHaveText('我的方案：每个子网 48 个地址')
  await screen.getByRole('button', '预览原始值', { exact: true }).tap()
  await expect(guest.locator('#plan')).toHaveText('我的方案：每个子网 32 个地址')
  await screen.getByRole('button', '预览原始值', { exact: true }).tap()
  await expect(guest.locator('#plan')).toHaveText('我的方案：每个子网 48 个地址')
  await screen.getByRole('button', '提交设计变更', { exact: true }).tap()
  await expect(screen.getByText('变更已提交，请在原会话中核对后续结果。', { exact: true })).toBeVisible()
  await screen.getByRole('button', '围绕作品继续提问', { exact: true }).tap()
  await screen.getByLabel('我的问题或思路').fill('我的判断是 /27，请只提示我如何核对可用主机数。')
  await screen.getByRole('button', '取消', { exact: true }).tap()
  await screen.getByRole('button', '放大', { exact: true }).tap()
  await screen.getByRole('button', '围绕作品继续提问', { exact: true }).last().tap()
  await expect(screen.getByLabel('我的问题或思路')).toHaveValue('我的判断是 /27，请只提示我如何核对可用主机数。')
  await browser.evaluate(async () => {
    const deadline = performance.now() + 10000;
    while (navigator.userActivation.isActive) {
      if (performance.now() > deadline) throw new Error('Browser activation did not expire');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')];
    buttons.find(button => button.textContent === '发送')!.click();
    return true;
  })
  await expect(screen.getByText('发送尚未确认，问题已保留。请检查原会话后重试。', { exact: true })).toBeVisible()
  const beforeQuestion = await browser.evaluate(async () => await fetch('/__visualize_fixture/evidence').then(response => response.json()))
  expect(beforeQuestion.follows.length).toBe(1)
  await screen.getByRole('button', '发送', { exact: true }).tap()
  await expect(screen.getByText('问题已发送，回复将在原会话中继续。', { exact: true })).toBeVisible()
  await screen.getByRole('button', '收起', { exact: true }).tap()
  await screen.getByRole('button', '打开后续回复中的下一版', { exact: true }).tap()
  await expect(screen.getByRole('heading', '拓扑方案 · 第 2 版', { exact: true })).toBeVisible()
  await expect(guest.locator('#plan')).toHaveText('我的方案：每个子网 32 个地址')
  await screen.getByRole('button', '对照上一版', { exact: true }).tap()
  await expect(guest.locator('#plan')).toHaveText('我的方案：每个子网 48 个地址')
  const evidence = await browser.evaluate(async () => await fetch('/__visualize_fixture/evidence').then(response => response.json()))
  expect(evidence.follows.length).toBe(2)
  expect(evidence.follows[0]).toContain('"value":48')
  expect(evidence.follows[1]).toBe('我的判断是 /27，请只提示我如何核对可用主机数。')
  expect(evidence.acceptedSaves).toBe(1)
  console.log('LEARNING_ARTIFACT_EVIDENCE', JSON.stringify({ follows: evidence.follows, acceptedSaves: evidence.acceptedSaves, separatorBefore: before.value, separatorAfter: after }))
  await app.screenshot('topology-learning-feedback')
})
