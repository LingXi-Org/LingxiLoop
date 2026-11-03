"""Native PPTX first WOFF2-decoder failure/retry with a real public DM Sans file.
Serve PERF_FONT_FIXTURE=1 PERF_RECOVERY_FIXTURE=1
PERF_FAIL_FEATURES=woff2-decoder. Only external Google Fonts responses are pinned
fixture bytes; editor/gateway/decoder requests use actual HTTP, with no interception.
"""
import base64,gzip,hashlib,json,subprocess,sys,time,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
from playwright.sync_api import expect,sync_playwright
port,destination,fontdir=sys.argv[1:];destination=Path(destination);destination.mkdir(parents=True,exist_ok=True);fontdir=Path(fontdir)
sys.argv=[sys.argv[0]];sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'issue-611'))
from bench import Trace
pub=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','.codex-tmp/issue-652/tls/cert.pem']);spki=base64.b64encode(hashlib.sha256(subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=pub)).digest()).decode()
with sync_playwright()as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1','--ignore-certificate-errors-spki-list='+spki]);c=b.new_context(viewport={'width':1440,'height':1000});p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));trace=Trace(c,p)
 p.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(body=(fontdir/'latin.css').read_bytes(),content_type='text/css',headers={'Access-Control-Allow-Origin':'*'}))
 p.route('https://fonts.gstatic.com/**',lambda r:r.fulfill(body=(fontdir/'dm-sans-latin.woff2').read_bytes(),content_type='font/woff2',headers={'Access-Control-Allow-Origin':'*'}))
 p.goto(f'https://app.lingxi-perf.cn:{port}/',wait_until='domcontentloaded');p.evaluate('fetch("/fixture/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({read:true,write:true,failPublish:false,reset:true})})');p.locator('#open-deck-a').click()
 deadline=time.monotonic()+35;f=None
 while time.monotonic()<deadline:
  f=next((f for f in p.frames if '/artifact-editor/slides/'in f.url),None)
  if f and f.locator('[data-slides-editor] [data-text-path]').filter(has_text='Font export original 123').count():break
  if errors:raise AssertionError(errors)
  p.wait_for_timeout(50)
 assert f
 f.evaluate('document.fonts.ready');assert f.evaluate('Array.from(document.fonts).some(f=>f.family.includes("DM Sans")&&f.status==="loaded")')
 assert not any('/woff2-decoder-'in r['url']for r in trace.requests.values()),'font decoder downloaded before export'
 heading=f.locator('[data-slides-editor] [data-text-path]').filter(has_text='Font export original 123').first;heading.dblclick();editing=f.locator('[contenteditable="true"]').first;expect(editing).to_be_visible();editing.fill('Native font saved 456');p.keyboard.press('Escape');p.keyboard.press('Control+s')
 state=lambda:p.evaluate('fetch("/fixture/state").then(r=>r.json())')
 deadline=time.monotonic()+15
 while time.monotonic()<deadline and 'Native font saved 456'not in state()['files']['slides']['project/slides/slide-1.html']:p.wait_for_timeout(100)
 assert 'Native font saved 456'in state()['files']['slides']['project/slides/slide-1.html']
 origin=f.evaluate('performance.timeOrigin');results=[]
 for attempt in range(2):
  f.get_by_role('button',name='下载',exact=True).click()
  with p.expect_download(timeout=90000)as download:f.get_by_role('menuitem',name='PowerPoint，保留当前字体（.pptx）',exact=True).click()
  path=destination/f'export-{attempt+1}.pptx';download.value.save_as(path)
  with zipfile.ZipFile(path)as z:
   fonts=[n for n in z.namelist()if n.startswith('ppt/fonts/')and n.endswith('.fntdata')]
   assert all(len(z.read(n))>1024 for n in fonts),'embedded font entry is empty'
   assert any('Native font saved 456'in ''.join(t.text or ''for t in ET.fromstring(z.read(n)).iter()if t.tag.endswith('}t'))for n in z.namelist()if n.startswith('ppt/slides/slide')and n.endswith('.xml'))
   results.append({'attempt':attempt+1,'embedded':fonts,'bytes':path.stat().st_size})
  p.screenshot(path=str(destination/f'export-{attempt+1}.png'))
  p.wait_for_timeout(300)
 assert not results[0]['embedded'],results
 assert results[1]['embedded'],results
 assert any('/woff2-decoder-'in r['url']and r.get('status')==503 for r in trace.requests.values()),'decoder first failure was not exercised'
 assert f.evaluate('performance.timeOrigin')==origin,'font retry replaced the native document'
 assert not errors,errors
 report={'scope':'Actual native Slides/Frame/gateway/CSP/CAS and WOFF2-decoder HTTP with a pinned real public DM Sans file; only Google Fonts network responses are fixture bytes. First PPTX keeps the native warning fallback after decoder 503; second export embeds decoded font without replacing the edited document. No production ACL/database.','browser':b.version,'errors':errors,'fontSource':json.loads((fontdir/'source.json').read_text()),'sameNativeDocument':True,'nativeEditSaved':True,'noDecoderBeforeExport':True,'results':results,'requests':list(trace.requests.values())}
 with gzip.GzipFile(str(destination/'browser.json.gz'),'wb',mtime=0)as out:out.write(json.dumps(report,ensure_ascii=False).encode())
 print(json.dumps({k:v for k,v in report.items()if k!='requests'},ensure_ascii=False));b.close()
