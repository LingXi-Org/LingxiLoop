"""Focused browser regressions against the local synthetic fixture, never production."""
import base64, hashlib, json, ssl, subprocess, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
from bench import Trace, usable, guest

ORIGIN = 'https://app.loop.test:4194/'
LOCAL = 'https://127.0.0.1:4194/'
OUT = Path('/tmp/611-regression')
OUT.mkdir(exist_ok=True)

def api(path, body=None):
    request=urllib.request.Request(LOCAL+path, data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'})
    return urllib.request.urlopen(request,context=ssl._create_unverified_context()).read()

key=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','/tmp/611-fixture-cert.pem'])
der=subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=key)
spki=base64.b64encode(hashlib.sha256(der).digest()).decode()
reports=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.loop.test 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
    api('__fixture/reset',{})
    context=browser.new_context(viewport={'width':1440,'height':1000})
    page=context.new_page();page.set_default_timeout(15000)
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    policies={};page.on('response',lambda response:policies.__setitem__(response.url,response.headers.get('content-security-policy')))
    page.goto(ORIGIN+'?kind=design');trace=Trace(context,page)
    page.locator('#open').click();f,_=usable(page,'design',time.monotonic(),trace)
    iframe=page.locator('[data-artifact-editor] iframe')
    assert 'allow-same-origin' in iframe.get_attribute('sandbox')
    url=iframe.get_attribute('src')
    assert '-artifact.loop.test' in url
    # Browser response is the existing isolated gateway response; no test relaxes CSP.
    csp=policies[url]
    assert csp.startswith('sandbox allow-scripts allow-same-origin '),csp
    page.evaluate('window.__retained=document.querySelector("[data-artifact-editor] iframe")')
    f.locator('h1').fill('Fixed performance board edited')
    page.locator('#close').click();page.locator('#open').click()
    assert page.evaluate('window.__retained===document.querySelector("[data-artifact-editor] iframe")')
    assert guest(page,'design').locator('h1').inner_text()=='Fixed performance board edited'
    page.keyboard.press('Escape')
    # Wait for the pinned editor's actual publish, not a synthetic DOM mutation.
    path=url.split('/artifact-editor/',1)[1]
    for _ in range(100):
        if b'Fixed performance board edited' in api('artifact-editor/'+path+'project/Main.dc.html'):break
        page.wait_for_timeout(50)
    else:raise AssertionError('edit did not persist through the editor publish path')
    for _ in range(12):page.locator('#close').click();page.locator('#open').click()
    assert page.locator('[data-artifact-editor] iframe').count()==1
    page.reload();page.locator('#open').click();f,_=usable(page,'design',time.monotonic(),trace)
    assert f.locator('h1').inner_text()=='Fixed performance board edited'
    page.locator('#switch').click();page.locator('#open').click();f,_=usable(page,'design',time.monotonic(),trace)
    assert f.locator('h1').inner_text()=='Fixed performance board'
    assert page.locator('[data-artifact-editor] iframe').get_attribute('src')!=url
    page.screenshot(path=str(OUT/'design-preserved.png'))
    reports.append({'case':'isolated gateway, retained edit, persisted refresh, scope switch, bounded 12 reopens','passed':True,'errors':errors})
    assert not errors,errors
    context.close()

    # Blocking the fixed entry exercises a real browser resource failure + retry.
    api('__fixture/reset',{})
    context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();page.set_default_timeout(15000)
    context.route('**/design-assets/*.js',lambda route:route.abort('failed'))
    page.goto(ORIGIN+'?kind=design');page.locator('#open').click()
    page.get_by_role('alert').wait_for();assert '资源未能加载' in page.get_by_role('alert').inner_text()
    page.screenshot(path=str(OUT/'design-resource-error.png'))
    context.unroute_all();page.get_by_role('button',name='重试',exact=True).click()
    trace=Trace(context,page);usable(page,'design',time.monotonic(),trace)
    reports.append({'case':'failed fixed script shows retry; new grant recovers editable content','passed':True})
    context.close()

    # The same actual outer entry now checks #615's formulas, instead of its old
    # opaque same-origin mock host. All authored fixtures remain synthetic.
    fragment=Path('scripts/fixtures/visualize-math-fragment.html').read_text().replace('<h1>','<h2>').replace('</h1>','</h2>')
    board='<!doctype html><html><head><script src="./support.js"></script></head><body><x-dc><h1>Fixed math board</h1>'+fragment+'</x-dc></body></html>'
    api('__fixture/reset',{});api('__fixture/content',{'board':board,'canvas':{'v':3,'title':'Formula integration','launch':{'view':'canvas'},'boards':{'Main.dc.html':{'x':0,'y':0,'w':760,'h':850}},'order':['Main.dc.html'],'pages':[],'notes':{},'designSystems':[]}})
    context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();page.set_default_timeout(15000)
    page.goto(ORIGIN+'?kind=design');trace=Trace(context,page);page.locator('#open').click();f,_=usable(page,'design',time.monotonic(),trace);page.keyboard.press('Escape')
    f.wait_for_function('document.querySelectorAll(".katex").length===6')
    f.evaluate('document.fonts.ready')
    math=f.evaluate('({formulas:document.querySelectorAll(".katex").length,display:document.querySelectorAll(".katex-display").length,fonts:[...document.fonts].filter(f=>f.status==="loaded").map(f=>f.family),invalid:document.querySelector("#invalid").textContent})')
    assert math['display']==3 and 'unknowncommand' in math['invalid']
    page.screenshot(path=str(OUT/'design-math.png'))
    f.evaluate('(html)=>window.__dcUpdate(window.__dcRootName(),"html",html)', '<h1>Fixed math board</h1>'+fragment.replace('a_1=1','a_2=2'))
    f.wait_for_function('document.querySelector("#dynamic annotation")?.textContent==="a_2=2"')
    page.locator('#close').click();page.locator('#open').click()
    assert guest(page,'design').locator('.katex').count()==6
    page.set_viewport_size({'width':768,'height':1000});page.screenshot(path=str(OUT/'design-math-narrow.png'))
    reports.append({'case':'formulas through real DesignWorkspace and grant-isolated outer frame, dynamic update and reopen','passed':True,**math})
    context.close()
    context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();page.set_default_timeout(15000)
    runtime=json.loads(Path('server/assets/design-editor/manifest.json').read_text())['runtime']['file'].split('/')[-1]
    context.route('**/'+runtime,lambda route:route.abort('failed'))
    page.goto(ORIGIN+'?kind=design');page.locator('#open').click()
    deadline=time.monotonic()+35
    while time.monotonic()<deadline:
        f=guest(page,'design')
        try:
            if f and f.locator('.katex').count()==6:
                f.locator('h1').dblclick(timeout=1500)
                f.locator('h1[contenteditable="true"]').wait_for(timeout=1500)
                break
        except Exception:pass
        page.wait_for_timeout(100)
    else:
        page.screenshot(path=str(OUT/'runtime-fallback-failed.png'))
        raise AssertionError('runtime fallback did not become editable')
    reports.append({'case':'blocked shared runtime retains original blob fallback and all six formulas','passed':True})
    context.close()
    browser.close()
Path(OUT/'results.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2))
print(json.dumps(reports,ensure_ascii=False,indent=2))
