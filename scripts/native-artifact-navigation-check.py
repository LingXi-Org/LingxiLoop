"""Use the benchmark's actual trusted navigation against a scrolling DOM fixture.
No application state mutation, product API, credentials or performance assertion.
"""
import importlib.util
from pathlib import Path
from playwright.sync_api import sync_playwright

spec=importlib.util.spec_from_file_location('benchmark',Path(__file__).with_name('native-artifact-benchmark.py'))
benchmark=importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)
HTML="""<!doctype html><meta charset="utf-8"><style>
body{margin:0}.native-stage{position:absolute;left:0;top:40px;width:620px;height:926px;overflow:auto}.native-board-space{position:relative;width:8000px;height:10000px}.native-page-shell{position:absolute}.native-board-label{position:absolute;top:-25px;height:25px;white-space:nowrap}
</style><section data-native-artifact-editor="design"><div class="native-stage"><div class="native-board-space"></div></div></section><script>
const stage=document.querySelector('.native-stage'),space=document.querySelector('.native-board-space');let active=1;
function paint(){space.replaceChildren();for(let n=1;n<=50;n++){const x=1272+(n-1)%5*1040,y=1938+Math.floor((n-1)/5)*620;if(n!==active&&(x>stage.scrollLeft+620||x+960<stage.scrollLeft||y>stage.scrollTop+926||y+540<stage.scrollTop))continue;const shell=document.createElement('div');shell.className='native-page-shell';shell.dataset.pageId='page-'+n;shell.dataset.artboardId='page-'+n;Object.assign(shell.style,{left:x+'px',top:y+'px',width:'960px',height:'540px'});const label=document.createElement('button');label.className='native-board-label';label.textContent='验收画板 '+n;label.onclick=event=>{window.__clickTrusted=event.isTrusted;active=n;document.querySelector('section').dataset.currentPage='page-'+n;paint()};shell.append(label);space.append(shell)}}
stage.addEventListener('wheel',event=>window.__wheelTrusted=event.isTrusted);stage.addEventListener('scroll',paint);stage.scrollTo(1240,1852);paint();
</script>"""
with sync_playwright() as p:
 import os
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or p.chromium.executable_path,args=['--no-sandbox'])
 try:
  for padded in [True,False]:
   html=HTML if padded else HTML.replace('1272+','32+').replace('1938+','32+').replace("shell.dataset.artboardId='page-'+n;",'').replace('stage.scrollTo(1240,1852)','stage.scrollTo(0,0)')
   page=browser.new_page(viewport={'width':1440,'height':1000});page.set_content(html)
   for n in list(range(1,51))+[1]:
    proof=benchmark.navigate(page,'design',n)
    assert page.locator('section').get_attribute('data-current-page')=='page-'+str(n)
    assert proof['control']=='nativeDesignBoard'
    if n!=1:assert proof['wheelEvents']>0
    assert page.evaluate('window.__clickTrusted')
    if n!=1:assert page.evaluate('window.__wheelTrusted')
   page.close()
  print('{"cases":102,"trustedWheelAndClick":true,"viewportPadding":true,"frozenBaselineFallback":true,"virtualBoards":true}')
 finally: browser.close()
