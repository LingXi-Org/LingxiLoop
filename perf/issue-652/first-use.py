"""Actual HTTPS/gateway/CSP, no request interception or disabled browser cache.
Start serve.ts with PERF_MATH_FIXTURE=1 PERF_FAIL_FEATURES=math,exports,pptx-library.
"""
import base64, gzip, hashlib, json, re, subprocess, sys, time, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright
port, destination = sys.argv[1:]
sys.argv=[sys.argv[0]]
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'issue-611'))
from bench import Trace
public=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','.codex-tmp/issue-652/tls/cert.pem'])
der=subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=public)
spki=base64.b64encode(hashlib.sha256(der).digest()).decode()
report={'scope':'Actual editor/gateway/CSP/HTTPS cache; synthetic documents and grants; deliberate first math/export/PPTX fetch 503s, no request interception. WOFF2 failure is covered by the shared preparation regression, not a real embedded-font export.','errors':[]}
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
    report['browser']=browser.version
    context=browser.new_context(viewport={'width':1440,'height':1000})
    page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
    trace=Trace(context,page)
    page.goto(f'https://app.lingxi-perf.cn:{port}/',wait_until='domcontentloaded')
    page.locator('#open-deck-a').click()
    deadline=time.monotonic()+40
    frame=None
    while time.monotonic()<deadline:
        frame=next((f for f in page.frames if '/artifact-editor/slides/' in f.url),None)
        if frame and frame.locator('[data-slides-editor]').count():break
        page.wait_for_timeout(50)
    assert frame
    math=frame.locator('[data-slides-editor] [data-slide-math]')
    while time.monotonic()<deadline:
        if math.count():break
        retry=frame.get_by_role('button',name='重试公式',exact=True)
        if retry.count():retry.first.click()
        page.wait_for_timeout(50)
    assert math.count()>0,'math did not recover'
    frame.evaluate('document.fonts.ready')
    original_time=frame.evaluate('performance.timeOrigin')
    page.evaluate("window.heldEditor=document.querySelector('[data-artifact-editor=slides] iframe')")
    downloads=[];page.on('download',lambda download:downloads.append(download))
    attempts=[]
    for attempt in range(1,5):
        prior={key for key,value in trace.requests.items() if value.get('status')==503}
        frame.get_by_role('button',name='下载',exact=True).click()
        frame.get_by_role('menuitem',name='PowerPoint，保留当前字体（.pptx）',exact=True).click()
        until=time.monotonic()+45
        while time.monotonic()<until and not downloads:
            failures=[value for key,value in trace.requests.items() if key not in prior and value.get('status')==503]
            if failures:
                attempts.append({'attempt':attempt,'failed':failures[0]['url'].split('/')[-1]})
                page.wait_for_timeout(300)
                break
            page.wait_for_timeout(100)
        if downloads:attempts.append({'attempt':attempt,'downloaded':True});break
    assert downloads,attempts
    output=Path('.codex-tmp/issue-652/first-use.pptx');downloads[0].save_as(output)
    with zipfile.ZipFile(output) as archive:
        assert '<p:pic>' in archive.read('ppt/slides/slide1.xml').decode(),'formula image missing from PPTX'
        assert '幻灯片 2' in archive.read('ppt/slides/slide2.xml').decode(),'ordinary slide text changed'
    assert frame.evaluate('performance.timeOrigin')==original_time
    assert page.evaluate("document.querySelector('[data-artifact-editor=slides] iframe')===window.heldEditor")
    resources=[dict(value) for value in trace.requests.values() if '/artifact-editor/slides-assets/' in value['url']]
    duplicates={}
    for row in resources:
        if row.get('status')==200 and row.get('bytes',0)>1024 and re.search(r'\.js$',row['url']):duplicates.setdefault(row['url'],[]).append(row['bytes'])
    assert not {url:values for url,values in duplicates.items() if len(values)>1},duplicates
    failures=[row for row in resources if row.get('status')==503]
    assert len(failures)==3,[(r['url'],r.get('status')) for r in resources]
    assert not report['errors'],report['errors']
    report.update({'attempts':attempts,'sameIframeAndDocument':True,'oneSuccessfulTransferPerJsUrl':True,'deliberate503s':len(failures),'requests':resources})
    browser.close()
Path(destination).write_bytes(gzip.compress(json.dumps(report,ensure_ascii=False,indent=2).encode(),mtime=0))
print(json.dumps({key:value for key,value in report.items() if key!='requests'},ensure_ascii=False))
