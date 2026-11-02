"""Real Design editor + GenUI host regression with synthetic, public-only files.
Run npm run build:visualize-runtime, Vite on 5285, then this script.
--baseline records the missing renderer before the fix. No production access.
"""
import argparse, hashlib, json, re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'artifacts/issue-613'
ORIGIN = 'http://127.0.0.1:5285'
BASE = '/artifact-editor/design/fixture-grant/'
FRAGMENT = (ROOT / 'scripts/fixtures/visualize-math-fragment.html').read_text()
BOARD = ('<!doctype html><html><head><meta charset="utf-8"><script src="./support.js"></script></head><body><x-dc>' + FRAGMENT + '</x-dc></body></html>').encode()

def design(page, baseline):
    editor = ROOT / ('third_party/baoyu-design/upstream/claude-design/scripts/editor' if baseline else 'server/assets/design-editor')
    files = {'project/Math.dc.html': BOARD, 'project/canvas.json': json.dumps({'v':3,'title':'Math fixture','launch':{'view':'canvas'},'boards':{'Math.dc.html':{'x':0,'y':0,'w':760,'h':760,'is_interactive':True,'expand':'fill'}},'order':['Math.dc.html'],'pages':[],'notes':{},'designSystems':[]}).encode()}
    def route(r):
        pass
        path = r.request.url.split(ORIGIN)[1].split('?')[0]
        rel = path.removeprefix(BASE)
        headers = {'Access-Control-Allow-Origin':'*'}
        if path == '/math-design-host':
            r.fulfill(body=f'<iframe title="设计编辑器" sandbox="allow-scripts allow-downloads allow-popups allow-modals" src="{BASE}" style="width:100%;height:900px;border:0"></iframe>',content_type='text/html');return
        if rel == '_files.json':
            body = json.dumps({'ver':'math-v1','files':{k:{'sha256':hashlib.sha256(v).hexdigest(),'size':len(v),'contentType':'text/html' if k.endswith('.html') else 'application/json'} for k,v in files.items()}});typ='application/json'
        elif rel == '__deck/session': body,typ='{"canEdit":true}','application/json'
        elif rel == '__comments': body,typ='{"threads":[],"agent":{"available":false},"me":{"name":"Fixture"}}','application/json'
        elif rel.endswith('events'): body,typ=': connected\n\n','text/event-stream'
        elif rel in files: body,typ=files[rel],'text/html' if rel.endswith('.html') else 'application/json'
        else:
            file=editor/(rel or 'index.html')
            if not file.is_file(): r.fulfill(status=404,headers=headers);return
            body=file.read_bytes();typ={'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'}.get(file.suffix,'text/html')
        r.fulfill(body=body,content_type=typ,headers=headers)
    page.route(ORIGIN+'/artifact-editor/**',route)
    page.route(ORIGIN+'/math-design-host',route)
    page.goto(ORIGIN+BASE,wait_until='domcontentloaded')
    return files

def guest(page):
    for frame in page.frames:
        try:
            if frame.locator('#math-fixture').count(): return frame
        except Exception: pass
    return None

def wait_guest(page):
    for _ in range(250):
        frame=guest(page)
        if frame: return frame
        page.wait_for_timeout(100)
    raise AssertionError('No authored math fixture: '+str([(f.url,f.locator('body').inner_text()[:200]) for f in page.frames]))

def verify_math(frame):
    frame.wait_for_function("document.querySelectorAll('.katex').length===6")
    frame.evaluate("document.fonts.ready")
    result=frame.evaluate("""() => ({
      formulas:document.querySelectorAll('.katex').length,
      display:document.querySelectorAll('.katex-display').length,
      matrix:document.querySelectorAll('#matrix .mtable').length,
      aligned:document.querySelectorAll('#aligned .mtable').length,
      fractions:document.querySelectorAll('#attention .mfrac').length,
      fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family),
      invalid:document.getElementById('invalid').textContent,
      ordinary:document.getElementById('ordinary').textContent,
      code:document.getElementById('code').textContent,
      unsafeLinks:document.querySelectorAll('.katex a').length,
      source:[...document.querySelectorAll('annotation')].map(n=>n.textContent)
    })""")
    assert result['display']==3 and result['matrix']==1 and result['aligned']==1 and result['fractions']==1,result
    assert len(result['fonts'])>=3,result
    assert 'unknowncommand' in result['invalid'] and '$5 and $10' in result['ordinary'],result
    assert '"\\(x^2\\)"' in result['code'] and result['unsafeLinks']==0,result
    return result

def run(browser, baseline):
    OUT.mkdir(parents=True,exist_ok=True)
    reports=[]
    for entry in ['design','inline']:
        page=browser.new_page(viewport={'width':1280,'height':1000})
        page.set_default_timeout(5000)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        if entry=='design': design(page,baseline)
        else: page.goto(ORIGIN+'/scripts/fixtures/visualize-math.html'+('?mode=baseline' if baseline else ''),wait_until='domcontentloaded')
        frame=wait_guest(page)
        # The Design compiler replaces its first srcdoc; wait for its real mount.
        page.wait_for_timeout(700)
        frame=wait_guest(page)
        if baseline:
            assert frame.locator('.katex').count()==0
            assert 'Attention' in frame.locator('#attention').inner_text()
            reports.append({'entry':entry,'rendered':0})
        else:
            result=verify_math(frame)
            reports.append({'entry':entry,'scenario':'initial','result':result})
            page.screenshot(path=str(OUT/(entry+'-after.png')),full_page=True)
            if entry=='design':
                frame.evaluate('(html)=>window.__dcUpdate(window.__dcRootName(),"html",html)',FRAGMENT.replace('a_1=1','a_2=2'))
            else:
                frame.evaluate('document.getElementById("dynamic").textContent='+json.dumps(r'\(a_2=2\)'))
            frame.wait_for_function("document.querySelector('#dynamic annotation')?.textContent==='a_2=2'")
            assert frame.locator('.katex').count()==6,'duplicate formulas after update'
            reports.append({'entry':entry,'scenario':'dynamic-update','result':verify_math(frame)})
            # Constrain just the authored content to exercise formula overflow,
            # independently of the canvas owner's zoom and container measurement.
            frame.evaluate('document.getElementById("math-fixture").style.width="240px"')
            frame.wait_for_function("document.fonts.status==='loaded'")
            narrow=frame.evaluate("""() => [...document.querySelectorAll('.katex-display')].map(e=>({width:e.clientWidth,content:e.scrollWidth,tab:e.tabIndex,parent:document.getElementById("math-fixture").clientWidth}))""")
            assert all(n['width']<=n['parent'] and n['tab']==0 for n in narrow),narrow
            assert any(n['content']>n['width'] for n in narrow),narrow
            reports.append({'entry':entry,'scenario':'240px-scrollable-formula','result':narrow})
            page.screenshot(path=str(OUT/(entry+'-narrow.png')),full_page=True)
            if entry=='inline':
                page.get_by_role('button',name='放大',exact=True).click()
                verify_math(wait_guest(page))
                page.get_by_role('button',name='收起',exact=True).click()
                page.locator('#close').click();page.locator('#open').click()
                verify_math(wait_guest(page))
                reports.append({'entry':entry,'scenario':'expand-collapse-close-reopen','passed':True})
            else:
                # Closing and reopening the editor acquires the same authored file.
                page.goto(ORIGIN+'/math-design-host')
                page.goto(ORIGIN+BASE)
                verify_math(wait_guest(page))
                reports.append({'entry':entry,'scenario':'editor-reopen','passed':True})
            page.reload(wait_until='domcontentloaded')
            verify_math(wait_guest(page))
            reports.append({'entry':entry,'scenario':'refresh','passed':True})
            assert not errors,errors
        page.screenshot(path=str(OUT/(entry+('-before.png' if baseline else '-refreshed.png'))),full_page=True)
        page.close()
    result={'browser':'cloud Chromium','scope':'synthetic public files; real Design editor in standalone test origin, real GenUiCard/host/opaque guest; production outer Design sandbox blocked separately by #611','reports':reports}
    (OUT/('baseline.json' if baseline else 'browser.json')).write_text(json.dumps(result,indent=2,ensure_ascii=False))
    print(json.dumps(result,ensure_ascii=False),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--baseline',action='store_true');args=parser.parse_args()
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        try: run(browser,args.baseline)
        finally: browser.close()
