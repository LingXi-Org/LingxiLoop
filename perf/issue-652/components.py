"""Native nested DC instance -> component artboard -> edit/save -> both instances.
Serve PERF_RECOVERY_FIXTURE=1 PERF_COMPONENT_FIXTURE=1. No interception.
"""
import base64,gzip,hashlib,json,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import expect,sync_playwright
port,destination=sys.argv[1:];destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
sys.argv=[sys.argv[0]];sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'issue-611'))
from bench import Trace
pub=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','.codex-tmp/issue-652/tls/cert.pem']);spki=base64.b64encode(hashlib.sha256(subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=pub)).digest()).decode()
with sync_playwright()as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1','--ignore-certificate-errors-spki-list='+spki]);c=b.new_context(viewport={'width':1440,'height':1000});p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));trace=Trace(c,p)
 p.goto(f'https://app.lingxi-perf.cn:{port}/',wait_until='domcontentloaded');p.evaluate('fetch("/fixture/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({read:true,write:true,failPublish:false,reset:true})})');state=lambda:p.evaluate('fetch("/fixture/state").then(r=>r.json())');before=state()['files']['design'];p.locator('#open-board-a').click()
 deadline=time.monotonic()+35;main=None
 while time.monotonic()<deadline:
  main=next((f for f in p.frames if f.locator('h1').count()and f.locator('h2').count()),None)
  if main:break
  if errors:raise AssertionError(errors)
  p.wait_for_timeout(50)
 assert main
 editor=next(f for f in p.frames if '/artifact-editor/design/'in f.url);origin=editor.evaluate('performance.timeOrigin')
 # Native component selection owns the original artboard navigation command.
 main.locator('h2').click();editor.get_by_test_id('dc-props-toggle').click();editor.get_by_role('button',name='编辑 Card →',exact=True).click()
 p.wait_for_timeout(400);p.screenshot(path=str(destination/'component-open.png'))
 component=next(f for f in p.frames if f.locator('h2').count()and not f.locator('h1').count());component.locator('h2').dblclick();editing=component.locator('[contenteditable="true"]').first;expect(editing).to_be_visible();editing.fill('Reusable card saved');p.keyboard.press('Escape')
 deadline=time.monotonic()+15
 while time.monotonic()<deadline and 'Reusable card saved'not in state()['files']['design']['project/Card.dc.html']:p.wait_for_timeout(100)
 saved=state()['files']['design'];assert 'Reusable card saved'in saved['project/Card.dc.html'];assert saved['project/Main.dc.html']==before['project/Main.dc.html'],'editing component flattened or rewrote its caller'
 assert json.loads(saved['project/canvas.json'])['order']==json.loads(before['project/canvas.json'])['order']
 assert editor.evaluate('performance.timeOrigin')==origin
 # The original checked guests execute the component; neither source nor its
 # interactive handler is promoted into the grant host.
 assert not editor.evaluate('!!window.__dcEditorPicker')
 assert component.evaluate('!!window.__dcEditorPicker')
 p.locator('#close').click();p.locator('#open-board-a').click()
 deadline=time.monotonic()+15
 while time.monotonic()<deadline:
  matches=[]
  for candidate in p.frames:
   try:
    if candidate.locator('h2').filter(has_text='Reusable card saved').count():matches.append(candidate)
   except Exception:pass  # A native guest can be replaced during recompose.
  if len(matches)>=2:break
  p.wait_for_timeout(100)
 assert len(matches)>=2,'component edit did not propagate to original artboard and nested instance'
 p.screenshot(path=str(destination/'component-saved.png'));assert not errors,errors
 report={'scope':'Actual Design native component/DC import selection, original component-artboard navigation, child edit/native CAS save and propagation to both checked guests. Actual Frame/gateway/CSP/HTTP; synthetic ACL, no production auth and no interception.','browser':b.version,'errors':errors,'componentArtboardNavigation':True,'childEditSaved':True,'callerSourcePreserved':True,'canvasOrderPreserved':True,'bothInstancesUpdated':True,'sourceRemainsInCheckedGuests':True,'requests':list(trace.requests.values())}
 with gzip.GzipFile(str(destination/'browser.json.gz'),'wb',mtime=0)as out:out.write(json.dumps(report,ensure_ascii=False).encode())
 print(json.dumps({k:v for k,v in report.items()if k!='requests'},ensure_ascii=False));b.close()
