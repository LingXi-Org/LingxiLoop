"""Focused #624 optional-script fault injection through the real isolated editor."""
import base64,hashlib,json,ssl,subprocess,time,urllib.request,os,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"issue-611"))
from bench import Trace,usable,guest
out=Path('/tmp/624-evidence');out.mkdir(exist_ok=True)
baseline=os.environ.get('PERF624_BASELINE')=='1'
key=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','/tmp/611-fixture-cert.pem'])
der=subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=key)
spki=base64.b64encode(hashlib.sha256(der).digest()).decode()
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.loop.test 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
    ctx=browser.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page()
    console=[]
    ctx.expose_binding('recordCsp',lambda source,uri:console.append(uri) if 'cloudflareinsights' in uri else None)
    ctx.add_init_script("document.addEventListener('securitypolicyviolation',e=>window.recordCsp(e.blockedURI))")
    page.on('console',lambda msg:console.append(msg.text) if 'cloudflareinsights' in msg.text else None)
    req=urllib.request.Request('https://127.0.0.1:4194/__fixture/reset',data=b'{}',headers={'Content-Type':'application/json'})
    urllib.request.urlopen(req,context=ssl._create_unverified_context()).close()
    page.goto('https://app.loop.test:4194/?kind=design');trace=Trace(ctx,page)
    trace.cdp.send('Log.enable')
    trace.cdp.on('Log.entryAdded',lambda e:console.append('CSP blocked beacon') if 'cloudflareinsights' in e['entry']['text'] and 'Content Security Policy' in e['entry']['text'] else None)
    start=time.monotonic();page.locator('#open').click()
    if baseline:
        page.get_by_role('alert').wait_for(timeout=15000)
        initial=page.get_by_role('alert').inner_text()
        page.wait_for_timeout(300)
        assert console,'must record an actual CSP violation before claiming a CSP reproduction'
        page.wait_for_function('document.querySelector("[role=alert]")?.textContent.includes("尚未打开")',timeout=35000)
        result={'baseline':True,'initial':initial,'afterDeadline':page.get_by_role('alert').inner_text(),'beaconCspBlocked':bool(console),'elapsedSeconds':time.monotonic()-start}
    else:
        frame,_=usable(page,'design',start,trace);frame.locator('h1').fill('Fixed optional beacon blocked edit')
        ctx.route('**/optional-analytics.js',lambda route:route.abort('failed'))
        shell=next(f for f in page.frames if '/artifact-editor/design/' in f.url and f.url.endswith('/'))
        shell.evaluate('''()=>{for(const url of ['https://static.cloudflareinsights.com/beacon.min.js',new URL('optional-analytics.js',location.href).href]){const s=document.createElement('script');s.src=url;document.head.appendChild(s)}}''')
        page.wait_for_timeout(200)
        assert page.get_by_role('alert').count()==0,'optional failures after editing must keep the live frame'
        page.locator('#close').click();page.locator('#open').click()
        assert guest(page,'design').locator('h1').inner_text()=='Fixed optional beacon blocked edit'
        page.keyboard.press('Escape')
        url=page.locator('[data-artifact-editor] iframe').get_attribute('src');path=url.split('/artifact-editor/',1)[1]
        for _ in range(100):
            data=urllib.request.urlopen('https://127.0.0.1:4194/artifact-editor/'+path+'project/Main.dc.html',context=ssl._create_unverified_context()).read()
            if b'Fixed optional beacon blocked edit' in data:break
            page.wait_for_timeout(50)
        else:raise AssertionError('actual edit did not publish')
        page.reload();page.locator('#open').click();frame,_=usable(page,'design',time.monotonic(),trace)
        assert frame.locator('h1').inner_text()=='Fixed optional beacon blocked edit'
        assert page.locator('[data-artifact-editor] iframe').count()==1
        assert page.get_by_role('alert').count()==0
        assert console,'beacon must actually be blocked by the existing CSP'
        result={'baseline':False,'beaconCspBlocked':True,'optionalNetworkFailureAfterEditIgnored':True,'editPublished':True,'reopenAndRefreshPreserveEdit':True,'iframeCount':1}
    page.screenshot(path=str(out/('baseline.png' if baseline else 'fixed.png')))
    (out/('baseline.json' if baseline else 'fixed.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2))
    if not baseline:
        ctx.close()
        ctx=browser.new_context(viewport={'width':1440,'height':1000})
        page=ctx.new_page();trace=Trace(ctx,page)
        entry=json.loads(Path('server/assets/design-editor/manifest.json').read_text())['entry']['file'].split('/')[-1]
        blocked=[True];grants=[]
        ctx.route('**/'+entry,lambda route:route.abort('failed') if blocked[0] else route.continue_())
        page.on('request',lambda request:grants.append(request.url) if request.resource_type=='document' and '/artifact-editor/design/' in request.url else None)
        page.goto('https://app.loop.test:4194/?kind=design');page.locator('#open').click()
        page.get_by_role('alert').wait_for(timeout=12000)
        message=page.get_by_role('alert').inner_text()
        assert '资源未能加载' in message,message
        page.wait_for_timeout(31000)
        assert page.get_by_role('alert').inner_text()==message,'deadline must not overwrite the actual failure'
        page.screenshot(path=str(out/'critical-failure.png'))
        blocked[0]=False;page.get_by_role('button',name='重试',exact=True).click()
        frame,_=usable(page,'design',time.monotonic(),trace)
        assert frame.locator('h1').inner_text()=='Fixed optional beacon blocked edit'
        assert len(grants)==2 and grants[0]!=grants[1]
        assert page.locator('[data-artifact-editor] iframe').count()==1
        result['criticalFailureRecovery']={'accurateAfterDeadline':True,'newGrant':True,'iframeCount':1,'savedContentRetained':True}
        (out/'fixed.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps(result,ensure_ascii=False));browser.close()
