import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

for (const width of [1440,390]) test(`composer bounds, cancellation, completion and blur (${width})`,async({app,browser,screen})=>{
  await browser.setViewport({width,height:960})
  await app.open('/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=light&scenario=chat-regressions')
  if(width<768) await browser.locator('[data-slot="sidebar"] [role="button"]').first().tap()
  const stop=screen.getByRole('button','停止全部智能助教',{exact:true})
  const send=screen.getByRole('button','发送',{exact:true})
  const input=browser.locator('.chat-composer [contenteditable="true"]')
  const step=async(detail:string)=>{await browser.evaluate(detail=>window.dispatchEvent(new CustomEvent('chat-regression-step',{detail})),detail)}
  await expect(stop).toBeVisible()
  await expect(send).toHaveCount(0)
  await input.fill('保留草稿，停止后继续。')
  await step('delivered');await step('preview')
  const bounds=await browser.evaluate(()=>{
    const column=document.querySelector('[data-composer-column]')!.getBoundingClientRect()
    const bar=document.querySelector('[data-chat-composer-bar]')!.getBoundingClientRect()
    const box=document.querySelector('.chat-composer')!.getBoundingClientRect()
    const button=document.querySelector('[aria-label="停止全部智能助教"]')!.getBoundingClientRect()
    const fade=document.querySelector('[data-chat-composer-transition]')!
    return {column:column.width,gap:Math.abs(column.left-bar.left-(bar.right-column.right)),left:box.left-bar.left,right:bar.right-box.right,
      x:button.x,y:button.y,overflow:document.documentElement.scrollWidth>innerWidth,passThrough:getComputedStyle(fade).pointerEvents,
      layers:[...fade.children].filter(node=>getComputedStyle(node).backdropFilter.startsWith('blur')).length}
  })
  expect(bounds.overflow).toBe(false);expect(bounds.gap).toBeLessThanOrEqual(1)
  expect(bounds.left).toBeGreaterThanOrEqual(12);expect(bounds.right).toBeGreaterThanOrEqual(12)
  if(width>768) expect(bounds.column).toBeGreaterThan(800)
  expect(bounds.column).toBeLessThanOrEqual(960);expect(bounds.passThrough).toBe('none');expect(bounds.layers).toBe(4)
  await app.screenshot(`composer-streaming-light-${width}`)
  await stop.tap()
  await expect(screen.getByRole('alert')).toContainText('未能停止')
  await expect(stop).toBeVisible();await expect(send).toHaveCount(0)
  await stop.tap()
  await expect(send).toBeVisible();await expect(stop).toHaveCount(0)
  await expect(input).toContainText('保留草稿')
  const restored=await browser.evaluate(()=>{const b=document.querySelector('[aria-label="发送"]')!.getBoundingClientRect();return{x:b.x,y:b.y}})
  expect(Math.abs(bounds.x-restored.x)).toBeLessThanOrEqual(1);expect(Math.abs(bounds.y-restored.y)).toBeLessThanOrEqual(1)
  await step('retry');await expect(stop).toBeVisible();await expect(send).toHaveCount(0)
  await step('preview');await step('complete');await expect(send).toBeVisible();await expect(stop).toHaveCount(0)
  const scroll=await browser.evaluate(()=>{
    const viewport=document.querySelector<HTMLElement>('[data-chat-viewport]')!
    const before=viewport.scrollTop;viewport.scrollTop=Math.max(0,before-240)
    const message=viewport.querySelector('[data-msg-id]')!
    const range=document.createRange();range.selectNodeContents(message);const selection=getSelection()!;selection.removeAllRanges();selection.addRange(range)
    return {before,after:viewport.scrollTop,selected:selection.toString().length,filter:getComputedStyle(message).filter}
  })
  expect(scroll.before).toBeGreaterThan(scroll.after);expect(scroll.selected).toBeGreaterThan(0);expect(scroll.filter).toBe('none')
  await browser.evaluate(()=>{getSelection()?.removeAllRanges();document.documentElement.classList.remove('light');document.documentElement.classList.add('dark');return true})
  await app.screenshot(`composer-complete-dark-${width}`)
})
