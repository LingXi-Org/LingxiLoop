"""Native first-page editing while later reads are deliberately delayed.
Serve PERF_RECOVERY_FIXTURE=1 PERF_LATER_SLIDES_DELAY_MS=8000.
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
    context.add_init_script("addEventListener('message',e=>{if(e.data?.type==='slides:context')window.nativeContext=e.data.context})")
    trace=Trace(context,page)
    page.on('console',lambda m:print('CONSOLE',m.type,m.text,flush=True) if 'slides (files)' in m.text else None)
    page.goto(f'https://app.lingxi-perf.cn:{port}/',wait_until='domcontentloaded')
    page.evaluate('fetch("/fixture/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({read:true,write:true,failPublish:false,shortGrants:false,reset:true})})')
    state=lambda:page.evaluate('fetch("/fixture/state").then(r=>r.json())')
    initial=state();page.locator('#open-deck-a').click()
    deadline=time.monotonic()+35;frame=None
    while time.monotonic()<deadline:
        frame=next((f for f in page.frames if '/artifact-editor/slides/' in f.url),None)
        if errors:raise AssertionError(errors)
        if frame and frame.locator('[data-progressive-slide]').count():break
        page.wait_for_timeout(25)
    assert frame and frame.locator('[data-progressive-slide]').count(),'progressively editable first view did not appear'
    heading=frame.locator('[data-slides-editor] [data-text-path]').filter(has_text='幻灯片 1').first
    heading.dblclick();editable=frame.locator('[contenteditable="true"]').first;expect(editable).to_be_visible();editable.fill('Typed before later pages');page.keyboard.press('Escape')
    expect(frame.locator('[data-progressive-slide]')).to_be_visible()
    assert state()['publishes']==0,'partial deck published before other reads completed'
    assert not any('/project/slides/slide-2.html' in row['url'] and row.get('status')==200 for row in trace.requests.values()),'later page completed before edit'
    page.screenshot(path=str(destination/'editable-first.png'))
    try:expect(frame.locator('[data-progressive-slide]')).to_have_count(0,timeout=60000)
    except Exception:
        print('DEBUG',frame.locator('body').inner_text()[:2000],errors,[(r['url'],r.get('status'),r.get('bytes'))for r in trace.requests.values()if'/project/slides/'in r['url']],flush=True)
        raise
    page.wait_for_function('window.nativeContext?.slideCount===20')
    deadline=time.monotonic()+20
    while time.monotonic()<deadline:
        saved=state()
        if 'Typed before later pages' in saved['files']['slides']['project/slides/slide-1.html']:break
        page.wait_for_timeout(100)
    assert 'Typed before later pages' in saved['files']['slides']['project/slides/slide-1.html'],'early edit did not save after full read'
    for path,text in initial['files']['slides'].items():
        if path not in ['project/deck.json','project/slides/slide-1.html']:assert saved['files']['slides'][path]==text,path
    assert json.loads(saved['files']['slides']['project/deck.json'])['order']==json.loads(initial['files']['slides']['project/deck.json'])['order']
    page.keyboard.press('Control+z');expect(heading).to_be_visible(timeout=10000)
    page.keyboard.press('Control+Shift+z');expect(frame.locator('[data-slides-editor] [data-text-path]').filter(has_text='Typed before later pages').first).to_be_visible()
    page.screenshot(path=str(destination/'complete.png'))
    assert not errors,errors
    report={'scope':'Actual native first slide editor, HTTP/gateway/CSP and CAS fixture with eight-second delayed later reads; no interception. Other page source and order stay intact; early edit merges and saves, then undo/redo works.','browser':browser.version,'errors':errors,'editedBeforeLaterRead':True,'noPartialPublish':True,'allOtherFilesPreserved':True,'fullOrderPreserved':True,'undoRedoAfterFullLoad':True,'requests':list(trace.requests.values())}
    with gzip.GzipFile(str(destination/'browser.json.gz'),'wb',mtime=0)as f:f.write(json.dumps(report,ensure_ascii=False).encode())
    print(json.dumps({k:v for k,v in report.items()if k!='requests'},ensure_ascii=False));browser.close()
