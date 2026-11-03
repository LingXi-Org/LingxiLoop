import base64,gzip,hashlib,json,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
kind,out=sys.argv[1:];out=Path(out);out.mkdir(parents=True,exist_ok=True)
sys.argv=[sys.argv[0]];sys.path.insert(0,str(Path('perf/issue-611').resolve()));from bench import Trace,INIT
pub=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','.codex-tmp/issue-652/tls/cert.pem']);spki=base64.b64encode(hashlib.sha256(subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=pub)).digest()).decode()
class ProfileTrace(Trace):
 def configure(self,route):
  super().configure(route);self.send(route,'Profiler.enable');self.send(route,'Profiler.setSamplingInterval',{'interval':1000});self.send(route,'Profiler.start')
 def result(self,route,method):
  r=self.send(route,method)
  if not route:return r
  deadline=time.monotonic()+5
  while(route,r)not in self.responses and time.monotonic()<deadline:self.page.wait_for_timeout(5)
  return self.responses.pop((route,r),{}).get('result',{})
with sync_playwright()as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1','--ignore-certificate-errors-spki-list='+spki]);c=b.new_context(viewport={'width':1440,'height':1000});c.add_init_script(INIT);p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));trace=ProfileTrace(c,p);globalcdp=b.new_browser_cdp_session();globalcdp.send('Tracing.start',{'categories':'devtools.timeline,v8,disabled-by-default-v8.compile','transferMode':'ReturnAsStream'});p.goto('https://app.lingxi-perf.cn:4412/',wait_until='domcontentloaded');p.locator('#open-'+('board'if kind=='design'else'deck')+'-a').click();deadline=time.monotonic()+45;editing=False
 while time.monotonic()<deadline:
  for f in p.frames:
   try:
    h=f.locator('h1'if kind=='design'else'[data-slides-editor] [data-text-path]').filter(has_text='Fixed performance board'if kind=='design'else'幻灯片 1').first
    if h.count()and h.is_visible():
     h.dblclick(timeout=1000);f.wait_for_function('Boolean(document.activeElement?.isContentEditable)',timeout=2000);editing=True;break
   except Exception:pass
  if editing:break
  if errors:raise AssertionError(errors)
  p.wait_for_timeout(25)
 assert editing and not errors,errors
 profiles={route:trace.result(route,'Profiler.stop')for route in ['',*trace.targets]};metrics={route:trace.result(route,'Performance.getMetrics')for route in ['',*trace.targets]};frames=[]
 for f in p.frames:
  try:frames.append(f.evaluate('({url:location.href,marks:performance.getEntriesByType("mark").map(x=>({name:x.name,start:x.startTime})),longTasks:window.__longTasks})'))
  except Exception:pass
 event={};globalcdp.on('Tracing.tracingComplete',lambda e:event.update(e));globalcdp.send('Tracing.end')
 while not event:p.wait_for_timeout(10)
 chunks=[]
 while True:
  chunk=globalcdp.send('IO.read',{'handle':event['stream']});chunks.append(chunk['data'])
  if chunk.get('eof'):break
 globalcdp.send('IO.close',{'handle':event['stream']})
 timeline=json.loads(''.join(chunks));report={'scope':'Diagnostic CPU profiles/traces across host and all attached native/guest targets. Profiling overhead is present; not timing acceptance. Synthetic fixture, actual native editing.','kind':kind,'source':'a80e6589','profiles':profiles,'metrics':metrics,'frames':frames,'requests':trace.requests,'errors':errors,'browser':b.version}
 for name,value in [('profile',report),('trace',timeline)]:
  with gzip.GzipFile(str(out/(name+'.json.gz')),'wb',mtime=0)as z:z.write(json.dumps(value,ensure_ascii=False).encode())
 print('PASS diagnostic',kind,len(profiles),'targets',len(timeline['traceEvents']),'timeline events');b.close()
