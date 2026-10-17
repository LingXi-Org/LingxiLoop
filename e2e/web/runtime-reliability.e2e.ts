import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { mkdir, writeFile } from 'node:fs/promises'

// Product API + published runtime + real WuKongIM. The model is an explicit
// deterministic fixture; these checks do not qualify a live provider or full SPA.
test.describe('Durable runtime failure recovery', { timeout: 90_000,
  ...(process.env.E2E_RUNTIME_RELIABILITY === '1' ? {} : { skip: 'Requires the isolated connection recovery server.' }),
}, () => {
  for (const [mode,reason,text,calls] of [
    ['runtime-402','model_unavailable','模型服务暂时不可用',1],
    ['runtime-timeout','model_unavailable','模型服务暂时不可用',3],
    ['runtime-total-timeout','model_unavailable','模型服务暂时不可用',1],
    ['runtime-context','context_limit','超出了当前可处理的上下文范围',0],
    ['runtime-budget','budget_limit','本轮预算已达上限',0],
    ['runtime-cancel','cancelled','这次任务已取消',0],
    ['runtime-invalid-tool','execution_failed','这次任务未能完成',3],
    ['runtime-fanout-budget','budget_limit','本轮预算已达上限',2],
  ] as const) test(`${mode} persists one notice and permits a new successful turn`, async ({ app,browser,screen }) => {
    await app.open(`/e2e/connection-recovery.html?mode=${mode}`)
    await screen.getByRole('button','结束远端任务并恢复服务').tap()
    await expect(browser.locator('main')).toContainText(text)
    await expect(browser.locator('#facts')).toContainText(`"terminalReason":"${reason}"`)
    await expect(browser.locator('#facts')).toContainText('"terminalDelivery":"delivered"')
    await expect(browser.locator('#facts')).toContainText('"terminalMessages":1')
    await expect(browser.locator('#facts')).toContainText(`"fixtureModelCalls":${calls}`)
    const terminalFacts = await browser.evaluate(() => JSON.parse(document.getElementById('facts')!.textContent!))
    if(mode==='runtime-invalid-tool') expect(terminalFacts.committedActions).toBe(0)
    if(mode==='runtime-fanout-budget') {
      expect(terminalFacts.notStarted).toBe(2)
      expect(terminalFacts.childWorkItems).toBe(0)
      expect(terminalFacts.rootResultPreserved).toBe(true)
      expect(terminalFacts.rootFeedbacks).toBe(1)
      await expect(browser.locator('main')).toContainText('已有结论已保存')
    }
    await app.screenshot(`${mode}-persisted-terminal`)
    await screen.getByRole('button','重新读取会话').tap()
    await expect(browser.locator('#facts')).toContainText('"terminalMessages":1')
    await screen.getByRole('button','发送新消息并完成任务').tap()
    await expect(browser.locator('#facts')).toContainText('"nextLifecycle":"succeeded"')
    await expect(browser.locator('main')).toContainText('新请求已正常完成。')
    await expect(browser.locator('#facts')).toContainText('"terminalMessages":1')
    await expect(browser.locator('#facts')).toContainText('"activeRuns":0')
    await app.screenshot(`${mode}-next-turn`)
    const facts = await browser.evaluate(() => JSON.parse(document.getElementById('facts')!.textContent!))
    const directory = process.env.E2E_RECOVERY_EVIDENCE_DIR ?? '.e2e/runtime-reliability/counts'
    await mkdir(directory,{ recursive: true })
    await writeFile(`${directory}/${mode}.json`,JSON.stringify({ mode,reason,terminalFacts,facts },null,2)+'\n')
  })
  test('optional memory scope outage preserves an ordinary answer and the next turn',async({app,browser,screen})=>{
    await app.open('/e2e/connection-recovery.html?mode=runtime-memory-outage')
    await screen.getByRole('button','结束远端任务并恢复服务').tap()
    await expect(browser.locator('#facts')).toContainText('"remoteLifecycle":"succeeded"')
    await expect(browser.locator('main')).toContainText('新请求已正常完成。')
    const first=await browser.evaluate(()=>JSON.parse(document.getElementById('facts')!.textContent!))
    expect(first.fixtureScopeFaults).toBeGreaterThan(0)
    expect(first.fixtureScopeFaults).toBeLessThanOrEqual(3)
    expect(first.terminalMessages).toBe(0)
    expect(first.fixtureModelCalls).toBe(2)
    await app.screenshot('runtime-memory-outage-ordinary-answer')
    await screen.getByRole('button','发送新消息并完成任务').tap()
    await expect(browser.locator('#facts')).toContainText('"nextLifecycle":"succeeded"')
    await expect(browser.locator('#facts')).toContainText('"activeRuns":0')
    const facts=await browser.evaluate(()=>JSON.parse(document.getElementById('facts')!.textContent!))
    expect(facts.fixtureScopeFaults).toBe(first.fixtureScopeFaults)
    expect(facts.terminalMessages).toBe(0)
    await app.screenshot('runtime-memory-outage-next-turn')
    const directory=process.env.E2E_RECOVERY_EVIDENCE_DIR??'.e2e/runtime-reliability/counts'
    await mkdir(directory,{recursive:true})
    await writeFile(`${directory}/runtime-memory-outage.json`,JSON.stringify({first,facts},null,2)+'\n')
  })
})
