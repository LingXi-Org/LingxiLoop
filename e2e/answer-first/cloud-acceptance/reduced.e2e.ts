import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { command, mixed } from '../data'

test('real reduced motion disables process and task motion without removing keyboard actions', async ({ app, browser, screen }) => {
  const fixture = mixed()
  fixture.message.metadata.custom.activityTasks!.tasks[0].status = 'running'
  await command('reset', { snapshot: fixture })
  await browser.setViewport({ width: 390, height: 844 })
  await app.open('/e2e/answer-first.html')
  // Actual Chromium media state, set through the official engine's public API.
  expect(await browser.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  const disclosure = browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > button')
  await disclosure.focus(); await disclosure.press('Enter')
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  const parent = browser.locator('[data-slot="task-card"][data-task-id="task-parent"] > button')
  await parent.focus(); await parent.press('Enter')
  await expect(parent).toHaveAttribute('aria-expanded', 'true')
  await expect(browser.locator('[data-slot="task-card"][data-task-id="task-child"]')).toBeVisible()
  expect(await browser.evaluate(() => {
    const selectors = [
      '[data-slot="run-activity"] > [data-slot="collapsible"] > button svg',
      '[data-slot="task-card"][data-task-id="task-parent"] > button',
      '[data-slot="task-card"][data-task-id="task-parent"] > button .animate-spin',
    ]
    return selectors.map(selector => {
      const element = document.querySelector(selector)!
      const style = getComputedStyle(element)
      return { found: Boolean(element), transition: style.transitionProperty, animation: style.animationName }
    })
  })).toEqual([
    { found: true, transition: 'none', animation: 'none' },
    { found: true, transition: 'none', animation: 'none' },
    { found: true, transition: 'none', animation: 'none' },
  ])
  await disclosure.focus(); await disclosure.press('Enter')
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await expect(screen.getByText('这是始终可读的实质答复。', { exact: true })).toBeVisible()
  await app.screenshot('answer-first-real-reduced-motion-390')
})
