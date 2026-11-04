"""Old initialized native editor first-uses export after its image assets change.
Prepare the baseline/current public cache with retainEditorAssets; serve a COPY
of baseline editors using PERF_RETAINED_EDITOR_ROOT. This mutates only that copy.
python perf/issue-652/release-assets.py <port> <copied-editor-root> <output.json.gz>
"""
import base64,gzip,hashlib,json,re,shutil,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
port,live,destination=sys.argv[1:]
live=Path(live).resolve();scratch=Path('.codex-tmp/issue-652').resolve()
assert live.is_relative_to(scratch) and live!=scratch,'only a disposable editor copy may be replaced'
for kind in ['design','slides']:
    shutil.rmtree(live/(kind+'-editor'));shutil.copytree(scratch/'baseline'/(kind+'-editor'),live/(kind+'-editor'))
sys.argv=[sys.argv[0]]
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'issue-611'))
from bench import Trace
public=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','.codex-tmp/issue-652/tls/cert.pem'])
der=subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=public)
spki=base64.b64encode(hashlib.sha256(der).digest()).decode()
errors=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
    context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    trace=Trace(context,page)
    page.goto(f'https://app.lingxi-perf.cn:{port}/?retain=true',wait_until='domcontentloaded');page.locator('#open-deck-a').click()
    deadline=time.monotonic()+45
    frame=None
    while time.monotonic()<deadline:
        frame=next((f for f in page.frames if '/artifact-editor/slides/' in f.url),None)
        if frame and frame.locator('[data-slides-editor] [data-text-path]').count():break
        page.wait_for_timeout(50)
    assert frame
    assert not any('/exports-' in r['url'] for r in trace.requests.values()),'lazy export was used before rollout'
    frame.evaluate('document.fonts.ready');page.wait_for_timeout(250)
    original=frame.evaluate('performance.timeOrigin')
    page.evaluate("window.originalEditor=document.querySelector('[data-artifact-editor=slides] iframe')")
    for kind in ['design','slides']:
        shutil.rmtree(live/(kind+'-editor'));shutil.copytree(Path('server/assets')/(kind+'-editor'),live/(kind+'-editor'))
    names={p.name for p in Path('server/assets/slides-editor/assets').iterdir()}
    frame.get_by_role('button',name='下载',exact=True).click()
    with page.expect_download(timeout=45000) as download:
        frame.get_by_role('menuitem',name='网页（.html）',exact=True).click()
    output=scratch/'old-release-export.html';download.value.save_as(output)
    assert '幻灯片 1' in output.read_text(), 'old editor lost native export content'
    requests=list(trace.requests.values())
    restored=[r for r in requests if '/slides-assets/' in r['url'] and r['url'].split('/')[-1] not in names and '/exports-' in r['url']]
    assert restored and all(r.get('status')==200 for r in restored),restored
    assert frame.evaluate('performance.timeOrigin')==original
    assert page.evaluate("window.originalEditor===document.querySelector('[data-artifact-editor=slides] iframe')")
    assert not errors,errors
    # Exercise a never-requested old Design recovery runtime through the same
    # public cache route; native Design subcanvas permutations remain separate.
    manifest=json.loads((scratch/'baseline/design-editor/manifest.json').read_text())
    old_name=manifest['runtime']['file'].split('/')[-1]
    response=page.evaluate("url=>fetch(url).then(async r=>({status:r.status,bytes:Array.from(new Uint8Array(await r.arrayBuffer()))}))",f'/artifact-editor/design-assets/{old_name}')
    assert response['status']==200
    expected=(scratch/'baseline/design-editor/assets'/old_name).read_bytes()
    assert bytes(response['bytes'])==expected
    report={'scope':'Actual old native Slides/Frame/isolated HTTPS gateway/CSP and first-use HTML export, no interception. Real baseline/current public files copied into the bounded cache locally. Docker mounts, both production hosts, real ACL and full Design subcanvas coverage are not qualified here.',
      'browser':browser.version,'oldFrameAndDocumentPreserved':True,'firstUseOldExportAfterImageReplacement':True,'oldDesignRuntimeBytesMatch':True,'errors':errors,'requests':requests}
    with gzip.GzipFile(destination,'wb',mtime=0) as f:f.write(json.dumps(report,ensure_ascii=False).encode())
    print(json.dumps({k:v for k,v in report.items() if k!='requests'},ensure_ascii=False))
    browser.close()
