"""Real browser fetches: optional math public + authorized routes both stall."""
import base64, hashlib, json, ssl, subprocess, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
from bench import Trace, usable

def api(path,body=None):
    request=urllib.request.Request('https://127.0.0.1:4194/'+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'})
    return json.load(urllib.request.urlopen(request,context=ssl._create_unverified_context()))

key=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','/tmp/611-fixture-cert.pem'])
der=subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=key)
spki=base64.b64encode(hashlib.sha256(der).digest()).decode()
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.loop.test 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
    context=browser.new_context(viewport={'width':1440,'height':1000})
    page=context.new_page();page.set_default_timeout(15000)
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    api('__fixture/reset',{});api('__fixture/stall-math',{'enabled':True})
    page.goto('https://app.loop.test:4194/?kind=visualize')
    trace=Trace(context,page);start=time.monotonic();page.locator('#open').click()
    _,timing=usable(page,'visualize',start,trace)
    for _ in range(30):
        status=api('__fixture/readers')
        if status['pending']==0:break
        page.wait_for_timeout(20)
    assert status=={'pending':0,'started':2},status
    page.locator('#close').click();page.locator('#open').click();usable(page,'visualize',time.monotonic(),trace)
    assert api('__fixture/readers')==status,'retained reopen inherits no stalled read'
    api('__fixture/stall-math',{'enabled':False})
    page.locator('#switch').click();start=time.monotonic();page.locator('#open').click()
    _,fresh=usable(page,'visualize',start,trace,'b')
    assert fresh['usableMs']<4000, 'a new owner must not wait five seconds on the expired shared read'
    assert api('__fixture/readers')['pending']==0
    assert not errors,errors
    result={'passed':True,'browser':browser.version,'stalledPublicAndAuthorizedRead':status,'fallbackReadyAndUsable':timing,'nextOwner':fresh,'errors':errors}
    Path('/tmp/611-cancel-browser.json').write_text(json.dumps(result,indent=2))
    page.screenshot(path='/tmp/611-cancel-browser.png')
    print(json.dumps(result,indent=2))
    browser.close()
