"""Diagnostic factory timers on a copy made by design-init-profile.mjs.
python perf/issue-652/design-init-profile.py <runs> <out.json.gz> control=4417 candidate=4418
Not cold acceptance: instrumentation and per-factory timers perturb execution.
"""
import base64,gzip,hashlib,json,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
runs,out,*arguments=sys.argv[1:];runs=int(runs);out=Path(out);arms=[arg.split('=',1)for arg in arguments]
sys.argv=[sys.argv[0]];sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'issue-611'))
from bench import Trace
public=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','.codex-tmp/issue-652/tls/cert.pem']);spki=base64.b64encode(hashlib.sha256(subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=public)).digest()).decode()
report={'scope':'Diagnostic synchronous Design native factory installation and initializer timers. Same actual native editable endpoint and 20ms/4Mbps. Instrumented copies; not cold acceptance or whole renderer CPU. Timers, compilation, streaming waits and React/render work outside factories must not be conflated.','samples':[]}
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1','--ignore-certificate-errors-spki-list='+spki]);report['browser']=browser.version
 for trial in range(runs):
  for arm,port in (arms if trial%2==0 else arms[::-1]):
   context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));trace=Trace(context,page)
   page.goto(f'https://app.lingxi-perf.cn:{port}/',wait_until='domcontentloaded');page.locator('#open-board-a').click();deadline=time.monotonic()+45;edited=False
   while time.monotonic()<deadline:
    for frame in page.frames:
     try:
      target=frame.locator('h1').filter(has_text='Fixed performance board').first
      if target.count()and target.is_visible():
       target.dblclick(timeout=1500);frame.wait_for_function('Boolean(document.activeElement?.isContentEditable)',timeout=2000);edited=True;break
     except Exception:pass
    if edited:break
    if errors:raise AssertionError(errors)
    page.wait_for_timeout(25)
   assert edited and not errors,errors
   host=next(f for f in page.frames if '/artifact-editor/design/'in f.url);timing=host.evaluate('globalThis.__lingxiDesignFactoryTimings');assert timing['diagnostic']and timing['factoryCount']==663
   samples=timing['samples'];assert len([s for s in samples if s['phase']=='install'])==663 and len([s for s in samples if s['phase']=='initialize'])==663
   totals={phase:round(sum(s['ms']for s in samples if s['phase']==phase),3)for phase in ['libraries','install','initialize']}
   report['samples'].append({'trial':trial,'arm':arm,'errors':errors,'totalsMs':totals,'factories':samples,'mainEntry':host.evaluate('document.querySelector("script[data-lingxi-design-critical]").src').split('/')[-1]})
   print(json.dumps({'trial':trial,'arm':arm,'totalsMs':totals}),flush=True);context.close()
 browser.close()
out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(gzip.compress(json.dumps(report,ensure_ascii=False).encode(),mtime=0))
