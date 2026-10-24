import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { command, mixed } from '../data'
import type { ActivityTasks } from '../../../src/lib/runActivity'

test('real reduced motion disables process and task motion without removing keyboard actions', async ({ app, browser, screen }) => {
  const fixture = mixed()
  const tasks = fixture.message.metadata.custom.activityTasks as ActivityTasks
  tasks.tasks[0].status = 'running'
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
  const styles = await browser.evaluate(() => {
    const selectors = [
      '[data-slot="run-activity"] > [data-slot="collapsible"] > button svg',
      '[data-slot="task-card"][data-task-id="task-parent"] > button',
      '[data-slot="task-card"][data-task-id="task-parent"] > button .animate-spin',
    ]
    return selectors.map(selector => {
      const element = document.querySelector(selector)!
      const style = getComputedStyle(element)
      return { found: Boolean(element), transition: style.transitionProperty, duration: style.transitionDuration, animation: style.animationName }
    })
  })
  expect(styles.map(({ duration: _duration, ...style }) => style)).toEqual([
    { found: true, transition: 'none', animation: 'none' },
    { found: true, transition: 'none', animation: 'none' },
    // The spinner has no transition rule: CSS's initial property is `all`,
    // with zero duration. Its motion-reduce rule removes the spin animation.
    { found: true, transition: 'all', animation: 'none' },
  ])
  // The product's existing global reduced-motion rule uses 0.01ms rather than
  // a literal zero; the actual duration must remain below one millisecond.
  for (const style of styles) expect(Number.parseFloat(style.duration)).toBeLessThan(0.001)
  await disclosure.focus(); await disclosure.press('Enter')
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await expect(screen.getByText('这是始终可读的实质答复。', { exact: true })).toBeVisible()
  await app.screenshot('answer-first-real-reduced-motion-390')
})
