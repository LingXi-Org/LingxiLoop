"""Native Design startup graph, actual first required-source failure and retry.
Serve PERF_RECOVERY_FIXTURE=1 PERF_FAIL_DESIGN_PROGRAMS=picker
PERF_DESIGN_PROGRAM_DELAY_MS=1200. No request interception.
"""
import base64,gzip,hashlib,json,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import expect,sync_playwright
port,destination=sys.argv[1:];destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
sys.argv=[sys.argv[0]];sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'issue-611'))
from bench import Trace
pub=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','.codex-tmp/issue-652/tls/cert.pem']);spki=base64.b64encode(hashlib.sha256(subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=pub)).digest()).decode()
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1','--ignore-certificate-errors-spki-list='+spki]);context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)+'\n'+e.stack));trace=Trace(context,page)
    page.goto(f'https://app.lingxi-perf.cn:{port}/',wait_until='domcontentloaded');page.evaluate('fetch("/fixture/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({read:true,write:true,failPublish:false,shortGrants:false,reset:true})})');page.locator('#open-board-a').click()
    retry=page.get_by_role('button',name='重试',exact=True);expect(retry).to_be_visible(timeout=20000)
    assert not any('/project/'in r['url']or r['url'].endswith('/_files.json')for r in trace.requests.values()),'native document started before all required programs were prepared'
    page.screenshot(path=str(destination/'startup-failure.png'));retry.click()
    deadline=time.monotonic()+35;child=None;target=None
    while time.monotonic()<deadline:
        for f in page.frames:
            try:
                h=f.locator('h1').filter(has_text='Fixed performance board').first
                if h.count()and h.is_visible():child,target=f,h;break
            except Exception:pass
        if target:break
        if errors:raise AssertionError(errors)
        page.wait_for_timeout(50)
    assert child and target,'actual native artboard did not render after required-source retry'
    target.dblclick();editable=child.locator('[contenteditable="true"]').first;expect(editable).to_be_visible();editable.fill('Split startup saved');page.keyboard.press('Escape')
    state=lambda:page.evaluate('fetch("/fixture/state").then(r=>r.json())')
    deadline=time.monotonic()+15
    while time.monotonic()<deadline and 'Split startup saved'not in state()['files']['design']['project/Main.dc.html']:page.wait_for_timeout(100)
    assert 'Split startup saved'in state()['files']['design']['project/Main.dc.html'],'native edit did not save'
    assert child.evaluate('!!window.__dcEditorPicker'),'native picker was not installed in its checked guest'
    editor=next(f for f in page.frames if '/artifact-editor/design/'in f.url)
    assert editor.evaluate('document.readyState!=="loading"&&window.__lingxiDesignStartup.status==="ready"')
    assert editor.evaluate('typeof window.designHost?.downloads?.save==="function"'),'late native initialization lost the host download capability'
    assert not editor.evaluate('!!window.__dcEditorPicker'),'picker program executed in parent instead of remaining source data'
    page.screenshot(path=str(destination/'startup-edited.png'))
    manifest=json.loads(Path('server/assets/design-editor/manifest.json').read_text());programs={row['file']for row in manifest['startupPrograms'].values()}
    requests=[r for r in trace.requests.values()if any('/'+name in r['url']for name in programs)]
    assert len({r['url']for r in requests if r.get('status')==200 and r.get('bytes',0)>1024})==4,requests
    successes={}
    for r in requests:
        if r.get('status')==200 and r.get('bytes',0)>1024:successes[r['url']]=successes.get(r['url'],0)+1
    assert max(successes.values())==1,successes
    assert any(r.get('status')==503 for r in requests)
    assert not errors,errors
    report={'scope':'Actual native Design/Frame/gateway/CSP/HTTP cache with synthetic ACL/CAS. Required source first-503, delayed source after DOM readiness, host fresh-grant retry, native edit/save and original checked guest picker. No interception.','browser':browser.version,'errors':errors,'noNativeInitializationBeforeRequiredSources':True,'hostRetry':True,'delayedRequiredSource':True,'nativeGuestEditSaved':True,'exactSourceDataNotExecutedInParent':True,'fourProgramRequests':True,'oneSuccessfulProgramTransferPerUrl':True,'requests':list(trace.requests.values())}
    with gzip.GzipFile(str(destination/'browser.json.gz'),'wb',mtime=0)as f:f.write(json.dumps(report,ensure_ascii=False).encode())
    print(json.dumps({k:v for k,v in report.items()if k!='requests'},ensure_ascii=False));browser.close()
