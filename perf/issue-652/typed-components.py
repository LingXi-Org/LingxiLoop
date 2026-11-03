"""Actual Design installed typed x-import, property-worker first 503 and retry.
Serve PERF_RECOVERY_FIXTURE=1 PERF_TYPED_COMPONENT_FIXTURE=1
PERF_FAIL_DESIGN_OPTIONAL=propertyScrubber. No interception.
"""
import base64,gzip,hashlib,json,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import expect,sync_playwright
port,destination=sys.argv[1:];destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
sys.argv=[sys.argv[0]];sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'issue-611'))
from bench import Trace
pub=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','.codex-tmp/issue-652/tls/cert.pem']);spki=base64.b64encode(hashlib.sha256(subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=pub)).digest()).decode()
manifest=json.loads(Path('server/assets/design-editor/manifest.json').read_text());worker=manifest['optionalPrograms']['propertyScrubber']['file']
with sync_playwright()as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1','--ignore-certificate-errors-spki-list='+spki]);c=b.new_context(viewport={'width':1440,'height':1000});p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));trace=Trace(c,p)
 p.goto(f'https://app.lingxi-perf.cn:{port}/',wait_until='domcontentloaded');access=lambda **data:p.evaluate('(data)=>fetch("/fixture/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)}).then(r=>r.json())',data);access(read=True,write=True,failPublish=True,shortGrants=False,reset=True)
 state=lambda:p.evaluate('fetch("/fixture/state").then(r=>r.json())');before=state()['files']['design'];p.locator('#open-board-a').click();deadline=time.monotonic()+35;guest=None
 while time.monotonic()<deadline:
  guest=next((f for f in p.frames if f.get_by_role('button',name='Typed fixture button',exact=True).count()),None)
  if guest:break
  if errors:raise AssertionError(errors)
  p.wait_for_timeout(50)
 assert guest,'typed x-import did not render'
 editor=next(f for f in p.frames if '/artifact-editor/design/'in f.url);origin=editor.evaluate('performance.timeOrigin');guest_origin=guest.evaluate('performance.timeOrigin')
 guest.get_by_role('button',name='Typed fixture button',exact=True).click();editor.get_by_test_id('dc-props-toggle').click()
 deadline=time.monotonic()+10
 while time.monotonic()<deadline and not any(worker in r['url']and r.get('status')==503 for r in trace.requests.values()):p.wait_for_timeout(50)
 assert any(worker in r['url']and r.get('status')==503 for r in trace.requests.values()),'missing real first-use 503'
 assert state()['files']['design']==before,'optional resource failure rewrote the native document'
 p.screenshot(path=str(destination/'worker-failed.png'))
 # Keep an unconfirmed edit in the original native document while retrying.
 guest.locator('h1').dblclick();edit=guest.locator('[contenteditable="true"]').first;expect(edit).to_be_visible();edit.fill('Typed component draft survives');p.keyboard.press('Escape')
 deadline=time.monotonic()+10
 while time.monotonic()<deadline and not state()['refusedPublishes']:p.wait_for_timeout(50)
 assert state()['refusedPublishes']>0 and state()['files']['design']==before
 # End text editing, then change the native selection before reselecting the
 # component. Opening a text editor alone does not necessarily change Il.
 guest.locator('h1').click();editor.wait_for_function('document.body.innerText.includes(\'"tag":"h1"\')',timeout=5000)
 guest.get_by_role('button',name='Typed fixture button',exact=True).click();expect(editor.get_by_role('radio',name='secondary',exact=True)).to_be_visible(timeout=10000)
 assert editor.evaluate('performance.timeOrigin')==origin and guest.evaluate('performance.timeOrigin')==guest_origin,'retry replaced the edited native document'
 expect(guest.locator('h1')).to_have_text('Typed component draft survives');editor.get_by_role('radio',name='secondary',exact=True).click();expect(guest.get_by_role('button',name='Typed fixture button',exact=True)).to_have_attribute('data-variant','secondary')
 p.screenshot(path=str(destination/'worker-retried.png'));access(failPublish=False)
 deadline=time.monotonic()+20
 while time.monotonic()<deadline:
  saved=state()['files']['design']['project/Main.dc.html']
  if 'Typed component draft survives'in saved and 'variant="secondary"'in saved:break
  p.wait_for_timeout(100)
 assert 'Typed component draft survives'in saved and 'variant="secondary"'in saved,'native CAS save did not retain both edits'
 for path,text in before.items():
  if path!='project/Main.dc.html':assert state()['files']['design'][path]==text,'native save rewrote installed files or canvas metadata'
 assert not editor.evaluate('!!window.Fixture||!!window.__dcEditorPicker'),'user bundle or picker executed in grant host'
 assert guest.evaluate('typeof window.Fixture.Button==="function"&&!!window.__dcEditorPicker')
 p.locator('#close').click();p.locator('#open-board-a').click();deadline=time.monotonic()+15
 while time.monotonic()<deadline:
  loaded=next((f for f in p.frames if f.locator('h1').filter(has_text='Typed component draft survives').count()and f.locator('button[data-variant="secondary"]').count()),None)
  if loaded:break
  p.wait_for_timeout(50)
 assert loaded,'saved typed component did not reopen with both edits';assert not errors,errors
 requests=[r for r in trace.requests.values()if worker in r['url']];assert any(r.get('status')==200 and r.get('bytes',0)>1000 for r in requests),'retry did not fetch actual worker source'
 report={'scope':'Actual Design installed typed x-import bundle/declarations, native property-worker HTTP/SRI/CSP first 503, native re-selection retry, unconfirmed draft retained, enum edit/CAS save/reopen. Actual product Frame/gateway and checked guest, synthetic ACL, no production login or interception.','browser':b.version,'errors':errors,'workerFirst503AndRetry':True,'sameEditedNativeDocument':True,'unconfirmedDraftRetained':True,'nativeTypedEnumEditedSavedReopened':True,'installedSourceAndCanvasPreserved':True,'userCodeRemainsInCheckedGuest':True,'requests':list(trace.requests.values())}
 with gzip.GzipFile(str(destination/'browser.json.gz'),'wb',mtime=0)as out:out.write(json.dumps(report,ensure_ascii=False).encode())
 print(json.dumps({k:v for k,v in report.items()if k!='requests'},ensure_ascii=False));b.close()
