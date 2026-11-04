"""Real DesignWorkspace/SlidesWorkspace and native editors; local public data.
python perf/issue-660/workspace/browser.py <runs> <out-dir> control=4473 candidate=4474
"""
import base64,gzip,hashlib,json,math,platform,subprocess,sys,time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
runs=int(sys.argv[1]);out=Path(sys.argv[2]);options=dict(x.removeprefix('--').split('=',1)for x in sys.argv[3:]if x.startswith('--'));arms=[x.split('=') for x in sys.argv[3:]if not x.startswith('--')];scenarios=options.get('scenarios','cold,retained,warm-scope,refresh').split(',');out.mkdir(parents=True,exist_ok=True)
sys.argv=[sys.argv[0]];sys.path.insert(0,str(Path('perf/issue-611').resolve()))
from bench import Trace,INIT
pub=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','.codex-tmp/issue-652/tls/cert.pem'])
spki=base64.b64encode(hashlib.sha256(subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=pub)).digest()).decode()
def editable(page,kind):
 start=time.monotonic();visible=None
 while time.monotonic()-start<45:
  for frame in page.frames:
   try:
    target=frame.locator('h1' if kind=='design' else '[data-text-path]').filter(has_text='Fixed performance board' if kind=='design' else '幻灯片 1').first
    if not target.count() or not target.is_visible():continue
    if kind=='slides' and not frame.evaluate('Array.from(document.images).some(i=>i.complete&&i.naturalWidth>=640&&i.getBoundingClientRect().width>0)'):continue
    if visible is None:visible=time.monotonic()
    target.dblclick(timeout=1200)
    frame.wait_for_function('Boolean(document.activeElement?.isContentEditable)',timeout=1500)
    return frame,visible
   except Exception:pass
  page.wait_for_timeout(20)
 raise AssertionError('Editor not operable: '+repr([(f.url,f.locator('body').inner_text()[:100]) for f in page.frames]))
RESOURCE='''({resources:performance.getEntriesByType('resource').map(e=>({name:e.name,initiator:e.initiatorType,duration:e.duration,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,decodedBodySize:e.decodedBodySize})),longTasks:window.__longTasks??[],marks:performance.getEntriesByType('mark').map(e=>({name:e.name,at:e.startTime}))})'''
report={'scope':'Actual workspace wrappers, editor/gateway/CSP; public synthetic documents/grants/IM replies. No production auth, IM socket or model. Click to actual trusted text editing; Slides also requires its real rendered image.','browser':None,'platform':platform.platform(),'profile':{'width':1440,'height':1000,'cpu':1,'latencyMs':20,'downloadMbps':4,'recursiveOopifThrottle':True},'samples':[]}
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1','--ignore-certificate-errors-spki-list='+spki]);report['browser']=browser.version
 for trial in range(runs):
  for arm,port in arms if trial%2==0 else arms[::-1]:
   for kind in ['design','slides']:
    context=browser.new_context(viewport={'width':1440,'height':1000});context.add_init_script(INIT)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));trace=Trace(context,page)
    page.goto(f'https://app.lingxi-perf.cn:{port}/?kind={kind}',wait_until='domcontentloaded');page.locator('#open').wait_for()
    page.evaluate('async()=>await(await fetch("/fixture/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reset:true,read:true,write:true,failPublish:false})})).json()')
    for scenario in scenarios:
     if scenario=='warm-scope':page.locator('#switch').click()
     if scenario=='refresh':page.reload(wait_until='domcontentloaded');page.locator('#open').wait_for()
     before=set(trace.requests);started=time.monotonic();page.locator('#open').click();frame,visible=editable(page,kind);ended=time.monotonic()
     native=next(f for f in page.frames if f'/artifact-editor/{kind}/' in f.url)
     requests=[dict(v)for k,v in trace.requests.items() if k not in before]
     stats={'trial':trial,'arm':arm,'kind':kind,'scenario':scenario,'visibleMs':round((visible-started)*1000,1),'editableMs':round((ended-started)*1000,1),'requests':requests,'frames':[{'url':f.url,**f.evaluate(RESOURCE)}for f in page.frames],'errors':list(errors),'nativeTimeOrigin':native.evaluate('performance.timeOrigin')}
     report['samples'].append(stats)
     print(json.dumps({k:v for k,v in stats.items() if k not in ['requests','frames']}),flush=True)
     assert not errors,errors
     if scenario=='retained':
      assert page.evaluate('window.held===document.querySelector("[data-artifact-editor] iframe")'),'retained editor DOM was replaced'
      assert report['samples'][-2]['nativeTimeOrigin']==stats['nativeTimeOrigin'],'retained editor document was reloaded'
     if trial==0:page.screenshot(path=str(out/f'{arm}-{kind}-{scenario}.png'))
     page.keyboard.press('Escape');page.evaluate('window.held=document.querySelector("[data-artifact-editor] iframe")');page.locator('#close').click();page.wait_for_timeout(200)
     with gzip.open(out/'loads.json.gz','wt') as f:json.dump(report,f)
    context.close()
 browser.close()
summary=[]
for arm,_ in arms:
 for kind in ['design','slides']:
  for scenario in scenarios:
   rows=[x for x in report['samples']if x['arm']==arm and x['kind']==kind and x['scenario']==scenario];v=sorted(x['editableMs']for x in rows)
   summary.append({'arm':arm,'kind':kind,'scenario':scenario,'runs':len(rows),**{f'p{p}':v[math.ceil(len(v)*p/100)-1]for p in [50,75,95]}})
(out/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2))
