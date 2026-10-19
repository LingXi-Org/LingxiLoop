import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { mkdir, writeFile } from 'node:fs/promises'
const evidenceDirectory = new URL('../../../.e2e/visualize-security/', import.meta.url)
const results=[]
for(const mode of ['baseline','parent-self','parent-none','outer-shell','product-shell']) test(mode,async({app,browser,screen})=>{
await app.open('/?mode='+mode)
await expect(screen.getByText('Waiting',{exact:true})).toHaveCount(0)
const facts=await browser.evaluate(()=>JSON.parse(document.querySelector('#facts')!.textContent!).facts)
expect(facts.parentDom).toBe('DENIED');expect(facts.parentToken).toBe('DENIED');expect(facts.cookie).toBe('DENIED');expect(facts.storage).toBe('DENIED')
await browser.evaluate(async()=>{await new Promise(resolve=>setTimeout(resolve,500));return true})
const hits=await browser.evaluate(async()=>await fetch('/results').then(r=>r.json()))
const modeHits=hits.filter((hit:string)=>JSON.parse(new URL('http://local'+hit).searchParams.get('data')!).mode===mode); expect(modeHits.length).toBe(mode==='baseline'?1:0); results.push({mode,facts,hits,navigationAssertion:mode==='baseline'?'exactly one request':'zero requests'}); await mkdir(evidenceDirectory,{recursive:true}); await writeFile(new URL('evidence.json',evidenceDirectory),JSON.stringify(results,null,2))
await app.screenshot('navigation-'+mode)
})
