"""Native presentation first-use/failure/retry/fullscreen/keyboard, no interception.
Serve PERF_RECOVERY_FIXTURE=1 PERF_FAIL_FEATURES=presentation on a fresh port.
"""
import base64,gzip,hashlib,json,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import expect,sync_playwright
port,destination=sys.argv[1:];destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
sys.argv=[sys.argv[0]];sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'issue-611'))
from bench import Trace
pub=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','.codex-tmp/issue-652/tls/cert.pem']);spki=base64.b64encode(hashlib.sha256(subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=pub)).digest()).decode()
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1','--ignore-certificate-errors-spki-list='+spki]);context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    trace=Trace(context,page)
    page.goto(f'https://app.lingxi-perf.cn:{port}/',wait_until='domcontentloaded');page.evaluate('fetch("/fixture/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({read:true,write:true,failPublish:false,shortGrants:false,reset:true})})');page.locator('#open-deck-a').click()
    deadline=time.monotonic()+35;frame=None
    while time.monotonic()<deadline:
        frame=next((f for f in page.frames if '/artifact-editor/slides/' in f.url),None)
        if errors:raise AssertionError(errors)
        if frame and frame.locator('[data-slides-editor] [data-text-path]').count():break
        page.wait_for_timeout(50)
    assert frame and frame.locator('[data-slides-editor] [data-text-path]').count(),'first view did not load'
    assert not any('/presentation-' in r['url'] for r in trace.requests.values()),'presentation was fetched during first view'
    frame.get_by_role('button',name='放映',exact=True).click();frame.get_by_role('menuitem',name='放映',exact=True).click()
    retry=frame.get_by_role('button',name='重试',exact=True);expect(retry).to_be_visible(timeout=10000)
    assert frame.evaluate('!!document.fullscreenElement'),'initial click lost fullscreen activation while loading'
    page.screenshot(path=str(destination/'presentation-failure.png'));retry.click()
    stage=frame.get_by_role('dialog',name='演示文稿',exact=True);expect(stage).to_be_visible(timeout=15000)
    assert frame.evaluate('!!document.fullscreenElement'),'retry lost fullscreen'
    expect(stage.locator('[data-text-path]').filter(has_text='幻灯片 1').first).to_be_visible()
    page.keyboard.press('ArrowRight');expect(stage.locator('[data-text-path]').filter(has_text='幻灯片 2').first).to_be_visible()
    page.keyboard.press('ArrowLeft');expect(stage.locator('[data-text-path]').filter(has_text='幻灯片 1').first).to_be_visible()
    page.screenshot(path=str(destination/'presentation-ready.png'))
    page.keyboard.press('Escape');expect(stage).to_have_count(0);page.wait_for_timeout(100)
    assert not frame.evaluate('!!document.fullscreenElement'),'exiting presentation left fullscreen active'
    frame.get_by_role('button',name='放映',exact=True).click();frame.get_by_role('menuitem',name='放映',exact=True).click();expect(stage).to_be_visible()
    assert frame.evaluate('!!document.fullscreenElement'),'cached reopen lost gesture'
    page.keyboard.press('Escape');expect(stage).to_have_count(0)
    frame.get_by_role('button',name='放映',exact=True).click()
    with context.expect_page(timeout=10000) as opened:
        frame.get_by_role('menuitem',name='带演讲者备注放映',exact=True).click()
    notes=opened.value;notes.on('pageerror',lambda e:errors.append(str(e)))
    expect(stage).to_be_visible();expect(notes.locator('.sn-notes')).to_contain_text('第 1 页讲者备注。',timeout=15000)
    page.bring_to_front();stage.get_by_role('application',name='幻灯片放映',exact=True).focus();page.keyboard.press('f')
    frame.wait_for_function('!!document.fullscreenElement')
    page.keyboard.press('ArrowRight');expect(notes.locator('.sn-notes')).to_contain_text('第 2 页讲者备注。')
    page.keyboard.press('Escape');expect(stage).to_have_count(0)
    expect(notes.locator('.sn-notes')).to_contain_text('第 2 页讲者备注。')
    notes.close()
    assert not errors,errors
    successes={}
    for row in trace.requests.values():
        if row.get('type')=='Script' and row.get('status')==200 and row.get('bytes',0)>1024:successes[row['url']]=successes.get(row['url'],0)+1
    assert max(successes.values())==1,successes
    assert any('/presentation-' in r['url'] and r.get('status')==503 for r in trace.requests.values())
    report={'scope':'Actual native Slides/Frame/gateway/CSP/HTTP cache with synthetic grants, no request interception. First-use failure/retry retains real fullscreen; native navigation, Escape and cached reopen.','browser':browser.version,'errors':errors,'initialPresentationRequests':0,'firstFailureRecovered':True,'fullscreenThroughoutRetry':True,'arrowNavigationEscapeReopen':True,'nativeSpeakerPopupNavigation':True,'oneSuccessfulScriptTransferPerUrl':True,'requests':list(trace.requests.values())}
    with gzip.GzipFile(str(destination/'browser.json.gz'),'wb',mtime=0)as f:f.write(json.dumps(report,ensure_ascii=False).encode())
    print(json.dumps({k:v for k,v in report.items()if k!='requests'},ensure_ascii=False));browser.close()
