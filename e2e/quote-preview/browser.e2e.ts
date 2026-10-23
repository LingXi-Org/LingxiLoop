import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model (updated before #335 implementation): old RCE chrome remains;
// native quote slots/styles disappear in light/dark; quote detaches from bubble; owner/attachments disappear on
// history projection; quote is duplicated across text parts; long text overflows;
// cancel submits/steals focus; click/repeated keyboard activation loses jump;
// send loses replyToClientMsgNo; dark/mobile selectors leak into the message body.
for (const width of [1280,390]) test(`quoted reply surfaces ${width}`, async ({app,browser,screen}) => {
  await browser.setViewport({width,height:1000})
  await app.open('/e2e/quote-preview/index.html')
  await expect(browser.locator('[data-msg-id="mine"]')).toBeVisible({timeout:90000})
  await browser.evaluate(() => {document.querySelector('[data-chat-viewport]')!.scrollTop=0;return true})
  const baseline = process.env.E2E_QUOTE_BASELINE === '1'
  const inspect = () => browser.evaluate(() => {
    const message=document.querySelector('[data-msg-id="mine"]')!
    const quote=message.querySelector('[data-quote-preview]') ?? message.querySelector('button.w-full')!
    const style=getComputedStyle(quote), box=quote.getBoundingClientRect()
    const text=quote.querySelector('[data-slot="quote-block-text"]')
    return {radius:style.borderRadius,borders:[style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth],background:style.backgroundColor,font:style.fontSize,width:box.width,height:box.height,inBubble:!!quote.closest('[data-message-bubble]'),className:quote.className,bodyFont:getComputedStyle(message.querySelector('[data-message-bubble]')!).fontSize,textFont:text?getComputedStyle(text).fontSize:null,textStyle:text?getComputedStyle(text).fontStyle:null,clamp:text?getComputedStyle(text).webkitLineClamp:null}
  })
  const metrics=await inspect()
  await app.screenshot(`${baseline?'before':'after'}-light-${width}`)
  if (!baseline) {
    expect(metrics.inBubble).toBe(true)
    expect(metrics.radius).toBe('0px')
    expect(metrics.borders).toEqual(['0px','0px','0px','0px'])
    expect(metrics.background).toBe('rgba(0, 0, 0, 0)')
    expect(metrics.textFont).toBe('14px')
    expect(metrics.textStyle).toBe('italic')
    expect(metrics.clamp).toBe('2')
    await expect(browser.locator('.lingxi-reply-message, .rce-mbox-reply, [data-quote-preview] blockquote')).toHaveCount(0)
    await expect(browser.locator('[data-msg-id="mine"] [data-slot="quote-block-icon"]')).toHaveCount(1)
    expect(metrics.bodyFont).toBe('16px')
    await expect(browser.locator('[data-msg-id="mine"] [data-quote-preview]')).toContainText('陈晨')
    await expect(browser.locator('[data-msg-id="file-reply"] [data-quote-preview]')).toContainText('缓存设计.pdf')
    await expect(browser.locator('[data-msg-id="unavailable"] [data-quote-preview]')).toContainText('原消息不可用')
    await expect(browser.locator('[data-msg-id="foreign-reply"] [data-quote-preview]')).toContainText('原消息不可用')
    await expect(browser.locator('body')).not.toContainText('OTHER_CONVERSATION_FIXTURE_ONLY')
    await expect(browser.locator('[data-msg-id="file-only-reply"] [data-quote-preview]')).toHaveCount(1)
    await expect(browser.locator('[data-msg-id="multi-reply"] [data-quote-preview]')).toHaveCount(1)
    await expect(browser.locator('[data-msg-id="snapshot-reply"] [data-quote-preview]')).toContainText('历史作者')
    await expect(browser.locator('[data-msg-id="incoming-reply"] [data-message-bubble] [data-quote-preview]')).toContainText('林悦')
    const quote=browser.locator('[data-msg-id="mine"] [data-quote-preview]')
    await quote.focus();await browser.keyboard.press('Enter')
    await expect.poll(()=>browser.evaluate(()=>document.querySelector('[data-msg-id="original"]')!.classList.contains('quote-jump-flash'))).toBe(true)
    await quote.focus();await browser.keyboard.press('Space')
    await expect.poll(()=>browser.evaluate(()=>document.querySelector('[data-msg-id="original"]')!.classList.contains('quote-jump-flash'))).toBe(true)
    expect(await browser.evaluate(()=>Array.from(document.querySelectorAll('[data-quote-preview]')).every(el=>el.scrollWidth<=el.clientWidth+1))).toBe(true)
    for (const id of ['empty-reply','tool-reply']) await expect(browser.locator(`[data-msg-id="${id}"] [data-quote-preview]`)).toContainText('原消息不可用')
    await screen.getByRole('button','补全原文',{exact:true}).tap()
    for (const id of ['empty-reply','tool-reply']) await expect(browser.locator(`[data-msg-id="${id}"] [data-quote-preview]`)).toContainText('后续正文已到达')
  }
  await screen.getByRole('button','准备回复',{exact:true}).tap()
  await app.screenshot(`${baseline?'before':'after'}-composer-${width}`)
  if (!baseline) {
    await expect(browser.locator('[data-composer-quote]')).toContainText('陈晨')
    // Official rounded-lg follows the product's semantic radius token (12px).
    expect(await browser.evaluate(()=>getComputedStyle(document.querySelector('[data-composer-quote]')!).borderRadius)).toBe('12px')
    await screen.getByRole('button','取消回复',{exact:true}).tap()
    await expect(browser.locator('[data-composer-quote]')).toHaveCount(0)
    await expect.poll(()=>browser.evaluate(()=>document.activeElement?.getAttribute('contenteditable') ?? null)).toBe('true')
    await screen.getByRole('button','回复净化文本',{exact:true}).tap()
    await expect(browser.locator('[data-composer-quote] [data-slot="composer-quote-text"]')).toHaveText('已净化引用')
    await screen.getByRole('button','取消回复',{exact:true}).tap()
    await screen.getByRole('button','回复隐藏文本',{exact:true}).tap()
    await expect(browser.locator('[data-composer-quote] [data-slot="composer-quote-text"]')).toHaveText('原消息不可用')
    await screen.getByRole('button','取消回复',{exact:true}).tap()
    await screen.getByRole('button','回复附件',{exact:true}).tap()
    await expect(browser.locator('[data-composer-quote]')).toContainText('缓存设计.pdf')
    await screen.getByRole('button','取消回复',{exact:true}).tap()
    await screen.getByRole('button','回复不可用原文',{exact:true}).tap()
    await expect(browser.locator('[data-composer-quote] [data-slot="composer-quote-text"]')).toHaveText('原消息不可用')
    await expect(browser.locator('body')).not.toContainText('OTHER_CONVERSATION_FIXTURE_ONLY')
    await screen.getByRole('button','取消回复',{exact:true}).tap()
    await screen.getByRole('button','准备回复',{exact:true}).tap()
    await browser.locator('[contenteditable="true"]').fill('发送回复测试')
    await browser.keyboard.press('Enter')
    await expect.poll(()=>browser.evaluate(()=>document.documentElement.dataset.sentReply ?? null)).toBe('original')
    await expect.poll(()=>browser.evaluate(()=>document.documentElement.dataset.sentPayloadReply ?? null)).toBe('original')
    await expect(browser.locator('[data-composer-quote]')).toHaveCount(0)
    await browser.locator('[contenteditable="true"]').fill('下一条普通消息')
    await browser.keyboard.press('Enter')
    await expect.poll(()=>browser.evaluate(()=>document.documentElement.dataset.sentPayloadReply ?? null)).toBe('')
  }
  await screen.getByRole('button','切换主题',{exact:true}).tap()
  await browser.evaluate(()=>{document.querySelector('[data-chat-viewport]')!.scrollTop=0;return true})
  await app.screenshot(`${baseline?'before':'after'}-dark-${width}`)
  if (!baseline) {
    const darkMetrics=await inspect()
    expect(darkMetrics.textStyle).toBe('italic')
    expect(darkMetrics.background).toBe('rgba(0, 0, 0, 0)')
    await screen.getByRole('button','准备回复',{exact:true}).tap()
    await expect(browser.locator('[data-composer-quote] [data-slot="composer-quote-icon"]')).toHaveCount(1)
    await expect(browser.locator('[data-composer-quote] [data-slot="composer-quote-text"]')).toHaveText('使用可视化为我讲解 KV 缓存。')
    expect(await browser.evaluate(()=>Array.from(document.querySelectorAll('[data-quote-preview], [data-composer-quote]')).every(el=>el.scrollWidth<=el.clientWidth+1))).toBe(true)
    expect(await browser.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await app.screenshot(`after-dark-composer-${width}`)
    await screen.getByRole('button','取消回复',{exact:true}).tap()
  }
  await mkdir('.e2e/quote-preview',{recursive:true})
  await writeFile(`.e2e/quote-preview/${baseline?'before':'after'}-${width}.json`,JSON.stringify(metrics,null,2))
  if (!baseline) {
    await app.open('/e2e/quote-preview/index.html')
    await expect(browser.locator('[data-msg-id="mine"] [data-quote-preview]')).toContainText('陈晨')
  }
})
