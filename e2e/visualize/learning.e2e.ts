import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Production card/page/SDK/primitives; deterministic public API and authored
// second-version reference. No provider, actual homework submission or mastery claim.
test('student operates a topology, compares settings and continues in the original conversation', async ({ app, browser, screen }) => {
  await app.open('/e2e/visualize/learning.html')
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
  // Existing CDP153 cannot resolve this nested opaque srcdoc with frameLocator.
  // Use official native pointer input on the fixture's fixed Save button and
  // verify the actual guest SDK state receipt, preserving sandbox/CSP unchanged.
  const saveJudgment = async (addresses: number, version = 1) => {
    const box = await browser.locator('iframe[data-visualize-guest]:visible').boundingBox()
    if (!box) throw new Error('Visible topology frame missing')
    await browser.mouse.move(box.x + 60, box.y + 305)
    await browser.mouse.down(); await browser.mouse.up()
    await expect.poll(() => browser.evaluate(async ({ version }) => {
      const evidence = await fetch('/__visualize_fixture/evidence').then(response => response.json())
      return evidence.savedStates[JSON.stringify(['fixture-learning', `/fixture/learning-${version}.html`])]?.modelContent?.addresses ?? null
    }, { version })).toBe(addresses)
  }
  await saveJudgment(32)
  await expect(screen.getByLabel('我的推导')).toHaveValue('我认为每个子网需要 32 个地址。')
  const attempt = '我认为每个子网需要 32 个地址。\n请帮我核对可用主机数。'
  await screen.getByLabel('我的推导').fill(attempt)
  const before = await browser.evaluate(() => {
    const separator = document.querySelector('[role="separator"]')!;
    return { width: document.querySelector('[data-panel="true"]')?.getBoundingClientRect().width ?? 0, value: separator.getAttribute('aria-valuenow') };
  })
  await screen.getByRole('separator', '调整练习与作品宽度', { exact: true }).press('ArrowRight')
  const after = await browser.evaluate(() => document.querySelector('[role="separator"]')!.getAttribute('aria-valuenow'))
  expect(after).not.toBe(before.value)
  await screen.getByRole('button', '调整设计', { exact: true }).tap()
  await expect(screen.getByLabel('我的推导')).toHaveValue(attempt)
  await screen.getByRole('slider', '每个子网地址数', { exact: true }).press('ArrowRight')
  await saveJudgment(48)
  await screen.getByRole('button', '预览原始值', { exact: true }).tap()
  await saveJudgment(32)
  await screen.getByRole('button', '预览原始值', { exact: true }).tap()
  await saveJudgment(48)
  await screen.getByRole('button', '提交设计变更', { exact: true }).tap()
  await expect(screen.getByText('变更已提交，请在原会话中核对后续结果。', { exact: true })).toBeVisible()
  await screen.getByRole('button', '调整设计', { exact: true }).tap()
  await screen.getByRole('button', '调整设计', { exact: true }).tap()
  await expect(screen.getByRole('button', '提交设计变更', { exact: true })).toBeDisabled()
  await screen.getByRole('button', '围绕作品继续提问', { exact: true }).tap()
  await screen.getByLabel('我的问题或思路').fill('我的判断是 /27，请只提示我如何核对可用主机数。')
  await screen.getByRole('button', '取消', { exact: true }).tap()
  await expect.poll(() => browser.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toBe('围绕作品继续提问')
  await screen.getByRole('button', '放大', { exact: true }).tap()
  await expect(screen.getByRole('button', '提交设计变更', { exact: true }).last()).toBeDisabled()
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
  await expect.poll(() => browser.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toBe('围绕作品继续提问')
  await screen.getByRole('button', '收起', { exact: true }).tap()
  await screen.getByRole('button', '打开后续回复中的下一版', { exact: true }).tap()
  await expect(screen.getByRole('heading', '拓扑方案 · 第 2 版', { exact: true })).toBeVisible()
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
  await saveJudgment(32, 2)
  await screen.getByRole('button', '对照上一版', { exact: true }).tap()
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
  await saveJudgment(48)
  const evidence = await browser.evaluate(async () => await fetch('/__visualize_fixture/evidence').then(response => response.json()))
  expect(evidence.follows.length).toBe(2)
  expect(evidence.follows[0]).toContain('"value":48')
  expect(evidence.follows[1]).toBe('我的判断是 /27，请只提示我如何核对可用主机数。')
  expect(evidence.acceptedSaves).toBe(6)
  console.log('LEARNING_ARTIFACT_EVIDENCE', JSON.stringify({ follows: evidence.follows, acceptedSaves: evidence.acceptedSaves, separatorBefore: before.value, separatorAfter: after }))
  await app.screenshot('topology-learning-feedback')
})

test('artifact question drafts survive refresh and stay within the actual account/source scope', async ({ app, browser, screen }) => {
  await app.open('/e2e/visualize/learning.html?draft=1')
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
  await screen.getByRole('button', '围绕作品继续提问', { exact: true }).tap()
  await screen.getByLabel('我的问题或思路').fill('保留我的判断：两个子网各需要多少可用地址？')
  await screen.getByRole('button', '取消', { exact: true }).tap()
  await app.open('/e2e/visualize/learning.html?draft=1')
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
  await screen.getByRole('button', '围绕作品继续提问', { exact: true }).tap()
  await expect(screen.getByLabel('我的问题或思路')).toHaveValue('保留我的判断：两个子网各需要多少可用地址？')
  await expect(screen.getByText('问题草稿已恢复。发送前请在原会话中核对是否已接收。', { exact: true })).toBeVisible()
  const before = await browser.evaluate(async () => await fetch('/__visualize_fixture/evidence').then(response => response.json()))
  expect(before.follows.length).toBe(0)
  await screen.getByRole('button', '取消', { exact: true }).tap()
  await screen.getByRole('button', '切换验收账号', { exact: true }).tap()
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
  await screen.getByRole('button', '围绕作品继续提问', { exact: true }).tap()
  await expect(screen.getByLabel('我的问题或思路')).toHaveValue('')
  await screen.getByLabel('我的问题或思路').fill('另一个账号的问题')
  await screen.getByRole('button', '取消', { exact: true }).tap()
  await screen.getByRole('button', '切换验收账号', { exact: true }).tap()
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
  await screen.getByRole('button', '围绕作品继续提问', { exact: true }).tap()
  await expect(screen.getByLabel('我的问题或思路')).toHaveValue('保留我的判断：两个子网各需要多少可用地址？')
  await screen.getByRole('button', '发送', { exact: true }).tap()
  await expect(screen.getByText('问题已发送，回复将在原会话中继续。', { exact: true })).toBeVisible()
  await screen.getByRole('button', '围绕作品继续提问', { exact: true }).tap()
  await expect(screen.getByLabel('我的问题或思路')).toHaveValue('')
  console.log('LEARNING_DRAFT_EVIDENCE', JSON.stringify({ restored: true, isolatedAccount: true, autoResent: before.follows.length, confirmedReceiptClears: true }))
})
