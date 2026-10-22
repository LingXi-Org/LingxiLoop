import {test} from '@e2e-dev/web'
import {expect} from 'e2e'
test('compare upstream quote components',async({app,browser})=>{
 await browser.setViewport({width:1080,height:560})
 await app.open('http://127.0.0.1:5193')
 await expect(browser.locator('.rce-mbox-reply')).toBeVisible()
 await expect(browser.locator('.sendbird-quote-message__replied-message__text-message')).toContainText('KV')
 await app.screenshot('upstream-components')
})
