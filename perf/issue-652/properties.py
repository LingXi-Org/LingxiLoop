"""Actual native property first use/retry/edit/save/undo/reopen, no interception.
Serve PERF_RECOVERY_FIXTURE=1 PERF_FAIL_FEATURES=properties on a fresh port.
"""
import base64,gzip,hashlib,json,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import expect,sync_playwright
port,destination,*rest=sys.argv[1:];width=int(rest[0])if rest else 1440;destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
sys.argv=[sys.argv[0]];sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'issue-611'))
from bench import Trace
pub=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','.codex-tmp/issue-652/tls/cert.pem']);spki=base64.b64encode(hashlib.sha256(subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=pub)).digest()).decode()
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1','--ignore-certificate-errors-spki-list='+spki]);context=browser.new_context(viewport={'width':width,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));trace=Trace(context,page)
    page.goto(f'https://app.lingxi-perf.cn:{port}/',wait_until='domcontentloaded');page.evaluate('fetch("/fixture/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({read:true,write:true,failPublish:false,shortGrants:false,reset:true})})');page.locator('#open-deck-a').click()
    deadline=time.monotonic()+35;frame=None
    while time.monotonic()<deadline:
        frame=next((f for f in page.frames if '/artifact-editor/slides/'in f.url),None)
        if errors:raise AssertionError(errors)
        if frame and frame.locator('[data-slides-editor] [data-text-path]').count():break
        page.wait_for_timeout(50)
    assert frame
    heading=frame.locator('[data-slides-editor] [data-text-path]').filter(has_text='幻灯片 1').first;heading.dblclick();editable=frame.locator('[contenteditable="true"]').first;expect(editable).to_be_visible();editable.fill('Core text edit before properties');page.keyboard.press('Escape')
    assert not any('/properties-'in row['url']for row in trace.requests.values()),'closed property pane downloaded its implementation'
    image=frame.locator('[data-slides-editor] img[src*="_blob/"]').first;image.click()
    toggle=frame.get_by_role('button',name='属性',exact=True).first;toggle.click()
    retry=frame.get_by_role('button',name='重试',exact=True);expect(retry).to_be_visible(timeout=10000);page.screenshot(path=str(destination/'properties-failure.png'));retry.click()
    alt=frame.get_by_role('textbox',name='替代文本',exact=True);expect(alt).to_be_visible(timeout=15000);alt.fill('Native property changed');alt.press('Tab')
    state=lambda:page.evaluate('fetch("/fixture/state").then(r=>r.json())')
    deadline=time.monotonic()+15
    while time.monotonic()<deadline:
        saved=state()
        if 'Native property changed'in saved['files']['slides']['project/slides/slide-1.html']:break
        page.wait_for_timeout(100)
    assert 'Native property changed'in saved['files']['slides']['project/slides/slide-1.html'],'native property edit did not save'
    # Move focus away from the input so the existing global command history owns undo.
    frame.locator('[data-slides-editor] [data-text-path]').filter(has_text='Core text edit before properties').first.click();page.keyboard.press('Control+z')
    deadline=time.monotonic()+10
    while time.monotonic()<deadline and 'Native property changed'in state()['files']['slides']['project/slides/slide-1.html']:page.wait_for_timeout(100)
    assert 'Native property changed'not in state()['files']['slides']['project/slides/slide-1.html'],'native property undo did not save'
    page.keyboard.press('Control+Shift+z')
    deadline=time.monotonic()+10
    while time.monotonic()<deadline and 'Native property changed'not in state()['files']['slides']['project/slides/slide-1.html']:page.wait_for_timeout(100)
    assert 'Native property changed'in state()['files']['slides']['project/slides/slide-1.html'],'native property redo did not save'
    page.screenshot(path=str(destination/'properties-edited.png'))
    toggle.click();toggle.click();image.click();expect(alt).to_have_value('Native property changed')
    successes={}
    for row in trace.requests.values():
        if row.get('type')=='Script'and row.get('status')==200 and row.get('bytes',0)>1024:successes[row['url']]=successes.get(row['url'],0)+1
    assert max(successes.values())==1,successes
    assert any('/properties-'in row['url']and row.get('status')==503 for row in trace.requests.values())
    assert not errors,errors
    report={'scope':'Actual native Slides/Frame/gateway/CSP/CAS and HTTP cache with synthetic ACL, no interception. Core text edit works before properties; first failure/retry, image alt property edit, saved undo/redo and pane reopen.','browser':browser.version,'width':width,'errors':errors,'initialPropertyRequests':0,'coreTextEditingRemainsSynchronous':True,'firstFailureRecovered':True,'propertyEditUndoRedoSaved':True,'paneReopen':True,'oneSuccessfulScriptTransferPerUrl':True,'requests':list(trace.requests.values())}
    with gzip.GzipFile(str(destination/'browser.json.gz'),'wb',mtime=0)as f:f.write(json.dumps(report,ensure_ascii=False).encode())
    print(json.dumps({k:v for k,v in report.items()if k!='requests'},ensure_ascii=False));browser.close()
