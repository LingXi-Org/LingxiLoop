"""Real editor resize/draft/reopen/revocation regressions on the local fixture.
Run after the load benchmark: this resets its synthetic grant/document state.
python perf/issue-660/workspace/interactions.py <port> <out-dir>
"""
import base64,hashlib,json,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
port=int(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
pub=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','.codex-tmp/issue-652/tls/cert.pem']);spki=base64.b64encode(hashlib.sha256(subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=pub)).digest()).decode()
def usable(page,kind,text=None):
 deadline=time.monotonic()+35
 while time.monotonic()<deadline:
  for f in page.frames:
   try:
    target=f.locator('h1'if kind=='design'else'[data-text-path]').filter(has_text=text or ('Fixed performance board'if kind=='design'else'幻灯片 1')).first
    if target.count()and target.is_visible():
     target.dblclick(timeout=1000);f.wait_for_function('Boolean(document.activeElement?.isContentEditable)',timeout=1000);return f,target
   except Exception:pass
  page.wait_for_timeout(20)
 raise AssertionError('Actual editor not editable')
def access(page,body):return page.evaluate("async body=>await(await fetch('/fixture/access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).json()",body)
results=[]
with sync_playwright()as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
 for kind in ['design','slides']:
  c=b.new_context(viewport={'width':1440,'height':1000});p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.goto(f'https://app.lingxi-perf.cn:{port}/?kind={kind}');access(p,{'reset':True,'read':True,'write':True,'failPublish':True});p.locator('#open').click();f,target=usable(p,kind)
  native=next(frame for frame in p.frames if f'/artifact-editor/{kind}/'in frame.url);time_origin=native.evaluate('performance.timeOrigin')
  p.evaluate('window.retained=document.querySelector("[data-artifact-editor] iframe")')
  draft='Public unsaved resize draft';target.fill(draft)
  target=f.locator('h1'if kind=='design'else'[data-text-path]').filter(has_text=draft).first
  # Preserve unsaved native state while actual CAS publish is deliberately refused.
  p.wait_for_timeout(300)
  handle=p.get_by_role('button',name='调整对话与画板宽度')if kind=='design'else p.get_by_role('separator')
  box=handle.bounding_box();x=box['x']+box['width']/2;y=box['y']+100
  p.mouse.move(x,y);p.mouse.down()
  for dx in [30,60,90,120,60,-40]:p.mouse.move(x+dx,y)
  p.mouse.up();p.wait_for_timeout(100)
  assert p.evaluate('window.retained===document.querySelector("[data-artifact-editor] iframe")')
  assert native.evaluate('performance.timeOrigin')==time_origin
  assert target.inner_text()==draft
  assert p.locator('[data-sidebar-resizing]').count()==0
  assert p.locator('[data-artifact-editor] [data-resource-skeleton]').count()==0
  if kind=='slides':
   before=handle.get_attribute('aria-valuenow');handle.focus();p.keyboard.press('ArrowLeft');p.wait_for_timeout(50);assert before!=handle.get_attribute('aria-valuenow')
  else:
   panel=p.locator('[data-design-pane]');before=panel.bounding_box()['width'];handle.focus();p.keyboard.press('ArrowLeft');p.wait_for_timeout(240);assert panel.bounding_box()['width']>before
  p.locator('#close').click();p.locator('#open').click();f,target=usable(p,kind,draft)
  assert target.inner_text()==draft
  assert p.evaluate('window.retained===document.querySelector("[data-artifact-editor] iframe")')
  p.screenshot(path=str(out/f'{kind}-resized-draft.png'))
  p.set_viewport_size({'width':390,'height':844});p.wait_for_timeout(250)
  assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
  p.screenshot(path=str(out/f'{kind}-narrow.png'))
  p.set_viewport_size({'width':1440,'height':1000});p.wait_for_timeout(250)
  p.locator('#close').click();access(p,{'read':False});p.locator('#open').click()
  p.locator('[data-artifact-editor] [role=alert]').wait_for(timeout=15000)
  iframe=p.locator('[data-artifact-editor] iframe')
  if iframe.count():assert iframe.evaluate('(el)=>getComputedStyle(el).visibility')=='hidden'
  p.screenshot(path=str(out/f'{kind}-read-revoked.png'))
  assert not errors,errors
  results.append({'kind':kind,'realNativeEditor':True,'resizeKeepsIframeAndDocument':True,'refusedPublishKeepsDraft':True,'keyboard':True,'retainedReopen':True,'narrowNoOverflow':True,'syntheticReadRevocationHidesRetainedFrame':True,'errors':errors});c.close()
 b.close()
(out/'interactions.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
