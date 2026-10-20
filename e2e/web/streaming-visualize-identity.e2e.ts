import {test} from '@e2e-dev/web'
import {expect} from 'e2e'
test.describe('Visualize streaming identity', {
 ...(process.env.E2E_STREAMING_FIXTURE === '1' ? {} : { skip: 'Requires the streaming renderer fixture server.' }),
}, () => {
test('new original activity part starts a fresh Visualize slice motion lifetime',async({app,browser})=>{
 await browser.addInitScript(()=>{
  const original=window.matchMedia.bind(window);let reduced=false;const media=new EventTarget();
  Object.defineProperties(media,{matches:{get:()=>reduced},media:{value:'(prefers-reduced-motion: reduce)'}});
  window.matchMedia=query=>query==='(prefers-reduced-motion: reduce)'?media as MediaQueryList:original(query);
  window.addEventListener('streaming-test-motion',event=>{reduced=(event as CustomEvent<boolean>).detail;media.dispatchEvent(new Event('change'))});
 });
 await app.open('/scripts/streaming-lifecycle-check.html');await expect(browser.locator('.im-markdown')).toHaveText('准备');
 const result=await browser.evaluate(async()=>{
  const frame=()=>new Promise(requestAnimationFrame),rendered=()=>[...document.querySelectorAll('.im-markdown')].map(n=>n.textContent).join('');
  const input=(prefix:string,tail:string,partId:string)=>window.dispatchEvent(new CustomEvent('streaming-lifecycle-step',{detail:{text:prefix+'\n\n::visualize{"path":"/fixture.html"}\n\n'+tail,status:'running',partId}}));
  const oldPrefix='old words '.repeat(20).trim(),old=oldPrefix+'tail';input(oldPrefix,'tail','answer:1:0');
  window.dispatchEvent(new CustomEvent('streaming-test-motion',{detail:true}));let start=performance.now();
  while(rendered()!==old){if(performance.now()-start>5000)throw Error('Old reduced-motion part did not arrive');await frame()}
  window.dispatchEvent(new CustomEvent('streaming-test-motion',{detail:false}));await frame();await frame();
  const prefix='new alpha beta '.repeat(65).trim(),next=prefix+'omega';input(prefix,'omega','answer:2:0');start=performance.now();
  while(document.querySelector('main')!.getAttribute('data-original-part-id')!=='answer:2:0'){if(performance.now()-start>5000)throw Error('New original identity did not commit');await frame()}
  const samples:number[]=[];do{samples.push(rendered().length);if(rendered()===next)break;if(performance.now()-start>5000)throw Error('New body did not complete');await frame()}while(true);
  return {oldLength:old.length,total:next.length,samples,complete:rendered()===next,carets:document.querySelectorAll('[data-streaming-caret]').length};
 });
 console.log('VISUALIZE_ORIGINAL_IDENTITY',JSON.stringify(result));await app.screenshot('visualize-original-identity');
 expect(result.complete).toBe(true);expect(result.samples.length).toBeGreaterThan(0);expect(result.samples.some(n=>n>0&&n<result.total)).toBe(true);
});

})
