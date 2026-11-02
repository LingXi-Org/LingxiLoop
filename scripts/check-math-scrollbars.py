"""Actual math entry checks with synthetic public formulas and read-only APIs.
Build Design/Slides first; run Vite at VISUALIZE_TEST_ORIGIN (default5299).
GenUiCard's opaque frames are covered by check-math-scrollbars-cdp.mjs.
"""
import argparse, hashlib, json, os, time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'artifacts/issue-644';OUT.mkdir(parents=True,exist_ok=True)
METRICS=(ROOT/'scripts/fixtures/math-scrollbar-metrics.js').read_text().replace('export default ','')
FRAGMENT=(ROOT/'scripts/fixtures/math-scrollbars-fragment.html').read_text()
ORIGIN='https://math.test';BASE='/artifact-editor/'
args=argparse.ArgumentParser();args.add_argument('--baseline',action='store_true');args.add_argument('--entry',choices=['host','design','slides'],action='append');opts=args.parse_args();phase='before' if opts.baseline else 'after'
reports=[]

def measure(frame,selector='body'):
 frame.evaluate('document.fonts.ready.then(()=>true)')
 return frame.locator(selector).evaluate('(root)=>('+METRICS+')(root)')

def check(rows,expected,artifact=False):
 assert len(rows)==expected,rows
 short=[r for r in rows if r['short']];assert len(short)>=3,rows
 if not opts.baseline:assert all(r['range']==0 or r['overflow']=='visible' for r in short),short
 if opts.baseline and artifact:assert any(r['range']>0 and r['overflow']=='auto' for r in short),short
 assert any(r['frac'] for r in rows) and any(r['matrix'] for r in rows),rows

def guest(page,selector):
 deadline=time.monotonic()+25
 while time.monotonic()<deadline:
  for f in page.frames:
   try:
    if f.locator(selector).count()==10 and f.frame_element().is_visible():return f
   except Exception:pass
  page.wait_for_timeout(100)
 page.screenshot(path=str(OUT/'fixture-failure.png'));print([(f.url,f.locator('.katex').count(),f.locator('#math-fixture').count()) for f in page.frames],flush=True)
 raise AssertionError('Missing real math surface '+selector)

def editor_route(kind):
 base=BASE+kind+'/fixture/'
 if kind=='design':
  files={'project/canvas.json':json.dumps({'v':3,'title':'Public math sample','launch':{'view':'canvas'},'boards':{'Math.dc.html':{'x':0,'y':0,'w':760,'h':1000}},'order':['Math.dc.html'],'pages':[],'notes':{},'designSystems':[]}),
   'project/Math.dc.html':'<!doctype html><html><head><script src="./support.js"></script></head><body><x-dc>'+FRAGMENT+'</x-dc></body></html>'}
 else:
  # Native Slides compilation consumes authored text, not pre-rendered KaTeX.
  import re
  values=re.findall(r'<(?:p|div)[^>]*>(.*?)</(?:p|div)>',FRAGMENT,re.S)
  body='<section id="math">'+''.join(f'<p style="position:absolute;left:{40+(i%2)*940}px;top:{40+(i//2)*190}px;width:860px;height:180px;font-size:32px">{text}</p>' for i,text in enumerate(values))+'</section>'
  files={'project/deck.json':json.dumps({'v':4,'lists':'css','title':'Public math sample','order':['math'],'sections':{},'faces':{},'designSystems':[]}), 'project/slides/math.html':body}
 files={k:v.encode() for k,v in files.items()};writes=[];missing=[]
 def route(r):
  path=r.request.url.split(ORIGIN,1)[1].split('?',1)[0]
  if path=='/host':
   sandbox='allow-scripts allow-downloads allow-popups allow-modals'+(' allow-same-origin' if kind=='design' else '')
   r.fulfill(body=f'<!doctype html><iframe sandbox="{sandbox}" src="{base}" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>',content_type='text/html');return
  rel='assets/'+path.rsplit('/',1)[1] if path.startswith(BASE+kind+'-assets/') else path.removeprefix(base)
  typ='application/json';headers={'Access-Control-Allow-Origin':'*'}
  if rel=='_files.json':data=json.dumps({'ver':'public-math','files':{k:{'sha256':hashlib.sha256(v).hexdigest(),'size':len(v),'contentType':'text/html' if k.endswith('.html') else 'application/json'} for k,v in files.items()}})
  elif rel=='__deck/session':data='{"canEdit":false}'
  elif rel=='__comments':data='{"threads":[],"agent":{"available":false},"me":{"name":"Fixture"}}'
  elif rel.endswith('events'):data=': connected\n\n';typ='text/event-stream'
  elif r.request.method not in ['GET','HEAD']:writes.append(rel);r.fulfill(status=405);return
  elif rel in files:data=files[rel];typ='text/html' if rel.endswith('.html') else 'application/json'
  else:
   file=ROOT/'server/assets'/f'{kind}-editor'/(rel or 'index.html')
   if not file.is_file():missing.append(rel);r.fulfill(status=404,headers=headers);return
   data=file.read_bytes().replace(b'__LINGXI_DESIGN_ASSET_ORIGIN__',ORIGIN.encode());typ={'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'}.get(file.suffix,'text/html')
  r.fulfill(body=data,content_type=typ,headers=headers)
 return route,writes,missing

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 try:
  for dpr in ([1,2] if not opts.entry or 'host' in opts.entry else []):
   context=browser.new_context(viewport={'width':1440,'height':1100},device_scale_factor=dpr)
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(os.environ.get('VISUALIZE_TEST_ORIGIN','http://127.0.0.1:5299')+'/scripts/fixtures/math-scrollbars.html',wait_until='domcontentloaded')
   page.wait_for_function("['chat','file','forum','native'].every(id=>document.querySelectorAll('#'+id+' .katex').length===8)")
   for scale in [.8,1,1.25,1.5]:
    page.evaluate('(s)=>document.body.style.zoom=s',scale)
    for entry in ['chat','file','forum','native']:
     rows=measure(page,'#'+entry);check(rows,8);reports.append({'entry':entry,'scenario':'initial','dpr':dpr,'zoom':scale,'rows':rows})
   page.evaluate('document.body.style.zoom=1');page.screenshot(path=str(OUT/f'chat-file-{phase}-dpr{dpr}.png'),full_page=True)
   page.locator('#update').click();page.wait_for_function("document.querySelector('#chat annotation')?.textContent==='x_2'")
   for entry in ['chat','file','forum','native']:
    page.locator('#'+entry).evaluate('(e)=>e.style.width="241.375px"');rows=measure(page,'#'+entry);check(rows,8)
    long=page.locator('#'+entry+' .katex-display').last if entry!='native' else page.locator('#native .bn-block-content .bn-preview-container').last
    if entry in ['chat','file']:
     long.focus();page.keyboard.press('ArrowRight');long.evaluate('e=>new Promise(r=>setTimeout(r,150))');assert long.evaluate('e=>e.scrollLeft')>0
    reports.append({'entry':entry,'scenario':'dynamic-narrow-keyboard' if entry in ['chat','file'] else 'dynamic-narrow','dpr':dpr,'rows':rows})
   page.reload();page.wait_for_function("['chat','file','forum','native'].every(id=>document.querySelectorAll('#'+id+' .katex').length===8)");check(measure(page,'#chat'),8);check(measure(page,'#file'),8)
   assert not errors,errors;context.close()
  for kind in [k for k in ['design','slides'] if not opts.entry or k in opts.entry]:
   print('CHECK',kind,phase,flush=True)
   context=browser.new_context(viewport={'width':1440,'height':1100});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m: print('CONSOLE',m.type,m.text[:500],flush=True) if m.type=='error' else None);route,writes,missing=editor_route(kind);page.route(ORIGIN+'/**',route)
   page.goto(ORIGIN+'/host',wait_until='domcontentloaded');root='#math-fixture' if kind=='design' else '[data-slides-editor] [style*="width: 1920px"][style*="background:"] >> nth=0';selector=root+' >> .katex';f=guest(page,selector);f.locator(selector).nth(9).wait_for()
   rows=measure(f,root);check(rows,10,kind=='design');reports.append({'entry':kind,'scenario':'initial','rows':rows});page.screenshot(path=str(OUT/f'{kind}-{phase}.png'),full_page=True)
   for scale in [.8,1.25,1.5]:
    f.evaluate('(s)=>document.body.style.zoom=s',scale);rows=measure(f,root);check(rows,10);reports.append({'entry':kind,'scenario':'transformed-'+str(scale),'rows':rows})
   f.evaluate('document.body.style.zoom=1')
   if kind=='design':
    f.locator('#math-fixture').evaluate('e=>e.style.width="241.375px"');rows=measure(f,root);check(rows,10)
    long=f.locator('[data-math-case=long] .katex-display');assert long.evaluate('e=>e.scrollWidth-e.clientWidth')>20;long.focus();page.keyboard.press('ArrowRight');long.evaluate('e=>new Promise(r=>setTimeout(r,150))');assert long.evaluate('e=>e.scrollLeft')>0
    f.locator('#dynamic').evaluate("e=>e.textContent='$'+String.fromCharCode(92)+'sqrt{x_2}$'");f.wait_for_function("document.querySelector('#dynamic annotation')?.textContent===String.fromCharCode(92)+'sqrt{x_2}'");check(measure(f,root),10)
    reports.append({'entry':kind,'scenario':'dynamic-narrow-keyboard','rows':rows});page.screenshot(path=str(OUT/f'design-{phase}-narrow.png'),full_page=True)
   page.reload();f=guest(page,selector);f.locator(selector).nth(9).wait_for();check(measure(f,root),10)
   page.goto('about:blank');page.goto(ORIGIN+'/host');f=guest(page,selector);f.locator(selector).nth(9).wait_for();check(measure(f,root),10)
   assert not errors and not writes and not missing,(errors,writes,missing)
   reports.append({'entry':kind,'scenario':'refresh-reopen-readonly','passed':True});context.close()
  result={'phase':phase,'browser':browser.version,'scope':'independent public formulas in actual chat, Markdown file, forum, native editor, Design and Slides renderers; synthetic read-only APIs; Chromium only, not production original artwork','reports':reports}
  (OUT/f'entries-{phase}.json').write_text(json.dumps(result,indent=2));print(json.dumps({'phase':phase,'scenarios':len(reports)}))
 finally:browser.close()
