import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model: docs/evidence/canvas-feedback-scope/failure-model.md.
// Actual CanvasView/App/SDK; deterministic API fixture, not a gateway-login journey.
for (const scenario of ['close-then-switch', 'scope-aba'] as const) {
  test(`staged feedback stops after ${scenario} while the first acknowledgement is pending`, async ({ app, browser, screen }) => {
    await app.open('/e2e/canvas-app/index.html')
    await browser.locator('[data-canvas-frame="fixture-frame"] .canvas-frame-body').tap()
    const editor = browser.frameLocator('iframe[data-canvas-document-app]')
    await expect(editor.getByLabel('编辑文档')).toBeEnabled()
    await editor.getByRole('button', '引用选区', { exact: true }).press('Enter')
    await expect(screen.getByLabel('待发送的画布引用')).toBeVisible()
    await screen.getByLabel('画布反馈').fill('请只在当前画布解释引用')
    await browser.evaluate(async () => { await fetch('/__canvas/failure', { method: 'POST', body: JSON.stringify({ steerDelay: 1200 }) }); return true })
    await screen.getByRole('button', '发送反馈', { exact: true }).tap()
    await expect.poll(() => browser.evaluate(async () => (await fetch('/__canvas/evidence').then(r => r.json())).feedback.length)).toBe(1)
    if (scenario === 'close-then-switch') {
      await screen.getByRole('button', '停止等待', { exact: true }).tap()
      await screen.getByRole('button', '返回对话', { exact: true }).tap()
      await expect(browser.locator('[data-canvas-ui="root"]')).toHaveCount(0)
    }
    await browser.evaluate(async (restore) => {
      const workspacePath = '/src/lib/workspaceSession.ts', canvasPath = '/src/features/canvas/state.ts'
      const { setWorkspaceSession } = await import(/* @vite-ignore */ workspacePath)
      const { useCanvas } = await import(/* @vite-ignore */ canvasPath)
      const previous = useCanvas.getState().snapshot
      setWorkspaceSession({ companyId: 'fixture-company', projectId: 'destination-project' })
      useCanvas.getState().reset()
      useCanvas.setState({ activeCanvasId: 'destination-canvas' })
      if (restore) {
        setWorkspaceSession({ companyId: 'fixture-company', projectId: 'fixture-project' })
        useCanvas.setState({ activeCanvasId: 'fixture-canvas', snapshot: previous, previews: { 'fixture-canvas': previous } })
      }
      return true
    }, scenario === 'scope-aba')
    await expect(screen.getByLabel('画布反馈')).toBeHidden()
    await expect.poll(() => browser.evaluate(async () => (await fetch('/__canvas/evidence').then(r => r.json())).finishedSteers)).toBe(1)
    const evidence = await browser.evaluate(async () => fetch('/__canvas/evidence').then(r => r.json()))
    // The accepted first request may complete; no second write follows it.
    expect(evidence.feedback.length).toBe(1)
    expect(evidence.comments.length).toBe(0)
    expect(evidence.patches.length).toBe(0)
    await mkdir('artifacts/canvas-app/feedback-scope', { recursive: true })
    await writeFile(`artifacts/canvas-app/feedback-scope/${scenario}.json`, JSON.stringify({ passed: true, scenario, ...evidence }, null, 2))
    await app.screenshot(`canvas-feedback-${scenario}`)
  })
}
