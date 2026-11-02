import sys,json,time,subprocess,base64,hashlib
from playwright.sync_api import sync_playwright
key=subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','/tmp/611-fixture-cert.pem']);der=subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=key);spki=base64.b64encode(hashlib.sha256(der).digest()).decode()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.loop.test 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
 for port,blocked in [(4194,False),(4194,True),(4195,True)]:
  c=b.new_context(viewport={'width':1440,'height':1000})
  c.add_init_script('''window.__events=[];window.addEventListener('message',e=>{if(e.data&&Object.keys(e.data).some(x=>/^(?:__|type|e)/.test(x)))window.__events.push({at:performance.now(),data:JSON.stringify(e.data).slice(0,350)})});window.__timers=[];let native=window.setTimeout;window.setTimeout=function(f,d,...a){if(typeof f!=='function')return native(f,d,...a);let row={at:performance.now(),delay:d,fn:String(f).slice(0,130)};if(d>=300)window.__timers.push(row);return native(()=>{row.fired=performance.now();f(...a)},d)}''')
  page=c.new_page();page.on('console',lambda m:print('CONSOLE',m.type,m.text[:250],flush=True) if m.type in ['error','warning'] else None);page.on('pageerror',lambda e:print('ERROR',str(e)[:400],flush=True))
  if blocked:
   pattern='**/design-c4626e5c01ff00aa5ade98c8a7141e17b110d44d51252bc52057bf24633e63b9.js' if port==4194 else '**/dc-runtime-math-*.js'
   c.route(pattern,lambda r:r.abort('failed'))
  page.goto('https://app.loop.test:'+str(port)+'/?kind=design');page.locator('#open').click();page.wait_for_timeout(15000)
  print('CASE',port,blocked,flush=True)
  for f in page.frames:
   try:print(json.dumps(f.evaluate('({url:location.href.split("/").at(-1),marks:performance.getEntriesByType("mark"),timers:window.__timers,events:window.__events,content:document.body.innerText.slice(0,200),runtime:!!window.__dcUpdate})')),flush=True)
   except Exception:pass
  c.close()
 b.close()
