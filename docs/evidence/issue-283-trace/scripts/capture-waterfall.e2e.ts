import {test} from '@e2e-dev/web'
import {expect} from 'e2e'
test('official source waterfall demo states',async({app,browser,screen})=>{
 await app.open('http://127.0.0.1:5195')
 await expect(screen.getByRole('button','Toggle mini / expanded')).toBeVisible()
 await app.screenshot('waterfall-light-expanded')
 await screen.getByRole('button','Toggle mini / expanded').tap()
 await app.screenshot('waterfall-light-mini')
 await browser.evaluate(()=>{document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';document.body.style.background='#151515';return true})
 await app.screenshot('waterfall-dark-mini-no-native-theme')
 await screen.getByRole('button','Toggle mini / expanded').tap()
 await app.screenshot('waterfall-dark-expanded-no-native-theme')
})
