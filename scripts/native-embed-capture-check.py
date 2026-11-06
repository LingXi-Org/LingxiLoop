#!/usr/bin/env python3
"""Real capture client/runtime under the same raw browser and Trace as measurements.
Controlled HTTP fixture only; no product authorization or performance qualification.
"""
import argparse,json,runpy,subprocess,logging
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--browser');args=parser.parse_args()
root=Path(__file__).resolve().parent
benchmark=runpy.run_path(str(root/'native-artifact-benchmark.py'))
server=subprocess.Popen(['node','--import','tsx',str(root/'native-embed-capture-fixture.mjs')],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,cwd=root.parent)
class CallbackErrors(logging.Handler):
 def __init__(self):super().__init__();self.count=0
 def emit(self,record):self.count+=1
callback_errors=CallbackErrors();logger=logging.getLogger('asyncio');propagate=logger.propagate;logger.addHandler(callback_errors);logger.propagate=False
resources=None
try:
 ready=json.loads(server.stdout.readline())
 with sync_playwright() as pw:
  resources=benchmark['launch'](pw,{'origin':ready['origin'],'cookies':[]},args.browser)
  browser,context,page,process,_=resources;trace=benchmark['Trace'](context,page)
  page.goto(ready['origin'],wait_until='load');page.get_by_role('button',name='验证隔离导出',exact=True).click()
  page.wait_for_function("window.captureState?.state!=='pending'",timeout=25000)
  state=page.evaluate("({state:captureState.state,originalUnchanged:captureState.originalUnchanged,frames:document.querySelectorAll('iframe').length,peak:probePeak,observations})")
  assert state['state']=='passed',state
  assert state['originalUnchanged'] and state['frames']==0 and state['peak']==1
  assert len(state['observations'])==1 and all(state['observations'][0].values()),state
  assert page.evaluate("document.activeElement.id==='capture'")
  pixels=page.evaluate("""async()=>{const image=new Image();image.src=captureState.image;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;let opaque=0,nonwhite=0;for(let i=0;i<data.length;i+=4){if(data[i+3])opaque++;if(data[i+3]&&Math.min(data[i],data[i+1],data[i+2])<245)nonwhite++}return{width:c.width,height:c.height,nonTransparentPixels:opaque,nonWhitePixels:nonwhite}}""")
  assert pixels['width']==640 and pixels['height']==360 and pixels['nonTransparentPixels']>0 and pixels['nonWhitePixels']>0,pixels
  page.evaluate('abortMode()');page.get_by_role('button',name='验证隔离导出',exact=True).click();page.wait_for_function("window.captureState?.state!=='pending'",timeout=25000)
  aborted=page.evaluate("({aborted:captureState.aborted,originalUnchanged:captureState.originalUnchanged,frames:document.querySelectorAll('iframe').length,peak:probePeak})")
  assert aborted['aborted'] and aborted['originalUnchanged'] and aborted['frames']==0 and aborted['peak']==1,aborted
  assert server.poll() is None
  assert not trace.errors and callback_errors.count==0
  print(json.dumps({'scope':'controlled HTTP fixture with actual capture client, opaque runtime and measurement Trace; not product API/performance qualification','browser':browser.version,**{key:ready[key]for key in ['runtimeBytes','sourceBytes','sourceSha256']},'capture':state,'focusPreserved':True,'pixels':pixels,'abort':aborted,'callbackErrors':callback_errors.count,'confirmedSetupDetaches':trace.configuration_detaches,'performanceSamples':0,'qualified':False}))
finally:
 logger.removeHandler(callback_errors);logger.propagate=propagate
 if resources:benchmark['close'](resources)
 server.terminate()
 try:server.wait(timeout=10)
 except subprocess.TimeoutExpired:server.kill();server.wait()
