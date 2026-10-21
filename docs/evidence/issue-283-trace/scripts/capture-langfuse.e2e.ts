import {test} from '@e2e-dev/web'
import {expect} from 'e2e'
test('Langfuse actual public timeline states',{timeout:120000},async({app,browser,screen})=>{
 await browser.setViewport({width:1440,height:1000})
 await app.open('https://cloud.langfuse.com/project/clkpwwm0m000gmm094odg11gi/traces/2d6b96f2-0a4d-4366-99a5-1ad558c66e99')
 await screen.getByText('Timeline',{exact:true}).tap()
 await expect(screen.getByText('generation',{exact:true}).first()).toBeVisible()
 await app.screenshot('langfuse-light-expanded')
 console.log('LF_CONTROL',await browser.evaluate(()=>JSON.stringify([...document.querySelectorAll('button')].map(b=>({text:b.textContent,label:b.getAttribute('aria-label'),title:b.title,html:b.outerHTML.slice(0,200)})))))
 await browser.evaluate(()=>{document.documentElement.classList.add('dark');return true})
 await app.screenshot('langfuse-dark-expanded')
})
