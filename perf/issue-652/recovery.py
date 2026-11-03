"""Actual native editors + Frame + isolated HTTPS gateway/CSP; synthetic ACL/CAS.
Start editor-open/serve.ts with PERF_RECOVERY_FIXTURE=1; no production requests.
python perf/issue-652/recovery.py <port> <evidence-directory>
"""
import base64, hashlib, json, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

port, destination, *rest = sys.argv[1:]
width = int(rest[0]) if rest else 1440
destination = Path(destination);destination.mkdir(parents=True, exist_ok=True)
public = subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','.codex-tmp/issue-652/tls/cert.pem'])
der = subprocess.check_output(['openssl','pkey','-pubin','-outform','der'], input=public)
spki = base64.b64encode(hashlib.sha256(der).digest()).decode()
origin = f'https://app.lingxi-perf.cn:{port}'
report = {'scope':'Actual native Design/Slides, actual ArtifactEditorFrame/gateway/CSP, synthetic current ACL and ifMatch backing store; not production ACL or persistent recovery across closing an unsaved tab.','cases':[],'errors':[]}
report['viewportWidth'] = width

def native(page, kind):
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        for frame in page.frames:
            if f'/artifact-editor/{kind}/' in frame.url:
                if frame.locator('[data-slides-editor]' if kind=='slides' else '[data-testid="dc-props-toggle"]').count():return frame
        page.wait_for_timeout(50)
    raise AssertionError('native editor missing: '+kind)

def heading(page, kind, text):
    deadline=time.monotonic()+40
    while time.monotonic()<deadline:
        for frame in page.frames:
            owner=frame
            while owner and f'/artifact-editor/{kind}/' not in owner.url:owner=owner.parent_frame
            if owner is None:continue
            target=frame.locator('h1' if kind=='design' else '[data-text-path]').filter(has_text=text).first
            try:
                if target.count() and target.is_visible():return frame,target
            except Exception:pass
        page.wait_for_timeout(50)
    raise AssertionError('actual authored heading missing: '+text)

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
    report['browser']=browser.version
    for kind,prefix,initial in [('design','board','Fixed performance board'),('slides','deck','幻灯片 1')]:
        for scenario in ['expiry','downgrade']:
            print('START',kind,scenario,flush=True)
            context=browser.new_context(viewport={'width':width,'height':1000})
            context.add_init_script("window.recoveryEvents=[];addEventListener('message',e=>{if(String(e.data?.type).startsWith('artifact:recovery'))recoveryEvents.push({type:e.data.type,result:e.data.result,origin:e.origin})})")
            page=context.new_page();page.on('pageerror',lambda error:report['errors'].append(str(error)))
            page.goto(origin+'/?retain=true',wait_until='domcontentloaded')
            control=lambda **values: page.evaluate('values=>fetch("/fixture/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(values)}).then(r=>r.json())',values)
            state=lambda:page.evaluate('fetch("/fixture/state").then(r=>r.json())')
            control(read=True,write=True,failPublish=True,shortGrants=scenario=='expiry',reset=scenario=='expiry')
            with page.expect_response(lambda r:r.url.endswith('/editor-grant')) as response:page.locator('#open-'+prefix+'-a').click()
            grant=response.value.json()
            editor=native(page,kind)
            current = initial if scenario=='expiry' else f'Unsent-{kind}-expiry'
            child,target=heading(page,kind,current)
            target.dblclick()
            editable=child.locator('[contenteditable="true"]')
            expect(editable.first).to_be_visible()
            draft=f'Unsent-{kind}-{scenario}'
            editable.first.fill(draft);page.keyboard.press('Escape');page.wait_for_timeout(1000)
            before=state();assert draft not in json.dumps(before['files'][kind]),'failed save reached server'
            page.evaluate("window.oldFrame=document.querySelector('[data-artifact-editor='+"+json.dumps(kind)+"+'] iframe')")
            page.locator('#close').click()
            if scenario=='expiry':
                page.wait_for_timeout(max(0,grant['expiresAt']-time.time()*1000)+150)
                control(shortGrants=False,failPublish=False)
            else:control(write=False,failPublish=False)
            page.locator('#open-'+prefix+'-a').click()
            expect(page.get_by_role('button',name='下载本地副本',exact=True)).to_be_visible(timeout=20000)
            assert page.evaluate('!window.oldFrame.isConnected'),'old origin was kept after successful capture'
            new_editor=native(page,kind)
            assert new_editor.url!=editor.url,'new grant did not replace expired/access-mode origin'
            if scenario=='expiry':
                restore=page.get_by_role('button',name='恢复并重新打开',exact=True)
                try:expect(restore).to_be_visible(timeout=15000)
                except Exception:
                    print({'events':page.evaluate('window.recoveryEvents'),'skeleton':page.locator('[data-resource-skeleton]').count(),'frames':[(f.url,f.evaluate('window.recoveryEvents')) for f in page.frames]},flush=True)
                    raise
                assert draft not in json.dumps(state()['files'][kind]),'capture auto-overwrote server'
                restore.click()
                deadline=time.monotonic()+20
                while time.monotonic()<deadline and draft not in json.dumps(state()['files'][kind]):page.wait_for_timeout(100)
                if draft not in json.dumps(state()['files'][kind]):
                    print({'events':page.evaluate('window.recoveryEvents'),'fixture':state(),'body':page.locator('body').inner_text()[:1200]},flush=True)
                    raise AssertionError('restored draft was not published')
                heading(page,kind,draft)
                page.wait_for_timeout(500)
                exact_acknowledgement=page.get_by_role('button',name='下载本地副本',exact=True).count()==0
                if not exact_acknowledgement:
                    with page.expect_download() as backup:page.get_by_role('button',name='下载本地副本',exact=True).click()
                    backup_path=destination/f'{kind}-restored-original.lingxi-recovery.json';backup.value.save_as(backup_path)
                    assert draft in backup_path.read_text()
                    page.get_by_role('button',name='移除已保留副本',exact=True).click();page.get_by_role('button',name='移除副本',exact=True).click()
                page.screenshot(path=str(destination/f'{kind}-restored.png'))
                page.reload(wait_until='domcontentloaded');page.locator('#open-'+prefix+'-a').click();native(page,kind);heading(page,kind,draft)
                report['cases'].append({'kind':kind,'scenario':scenario,'capturedBeforeReplacement':True,'noAutomaticWrite':True,'explicitRestoreAcknowledged':True,'exactSnapshotAcknowledgement':exact_acknowledgement,'refreshReadsSavedDraft':True})
            else:
                expect(page.get_by_text('当前仅可查看，可下载本地副本。',exact=False)).to_be_visible(timeout=15000)
                expect(page.get_by_role('button',name='恢复并重新打开',exact=True)).to_have_count(0)
                assert draft not in json.dumps(state()['files'][kind]),'downgrade wrote draft'
                with page.expect_download() as download:page.get_by_role('button',name='下载本地副本',exact=True).click()
                path=destination/f'{kind}-downgrade.lingxi-recovery.json';download.value.save_as(path)
                package=json.loads(path.read_text());assert draft in json.dumps(package['state'])
                page.screenshot(path=str(destination/f'{kind}-readonly-recovery.png'))
                control(read=False)
                page.get_by_role('button',name='下载本地副本',exact=True).click()
                expect(page.locator('[data-artifact-editor] iframe')).to_have_count(0,timeout=10000)
                expect(page.get_by_role('button',name='下载本地副本',exact=True)).to_have_count(0)
                report['cases'].append({'kind':kind,'scenario':scenario,'readOnlyNewFrame':True,'noUnauthorizedRestore':True,'downloadContainsUnsentNativeContent':True,'revocationClearsFrameAndCopy':True})
            context.close()
    assert not report['errors'],report['errors']
    browser.close()
(destination/'browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
