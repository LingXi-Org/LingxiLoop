#!/usr/bin/env python3
"""Trusted export controls for the baseline and Chinese native menus."""
import argparse,json,threading,html
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--browser');args=parser.parse_args()
s=Path(__file__).with_name('native-artifact-benchmark.py').read_text()
n={'__name__':'export-control-check','__file__':str(Path(__file__).with_name('native-artifact-benchmark.py'))};exec(compile(s,n['__file__'],'exec'),n)
labels={'old-menu':{'html':'HTML 网页','pdf':'PDF','pptx':'PowerPoint'},'current-menu':{'html':'网页','pdf':'便携文档','pptx':'演示文稿'}}
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*_):pass
 def do_GET(self):
  if self.path=='/favicon.ico':self.send_response(204);self.end_headers();return
  if self.path.startswith('/download/'):
   f=self.path.rsplit('/',1)[-1];body={'html':b'<html>selector fixture</html>','pdf':b'%PDF-selector-fixture','pptx':b'PK-selector-fixture'}[f];self.send_response(200);self.send_header('Content-Type','application/octet-stream');self.send_header('Content-Disposition',f'attachment; filename="fixture.{f}"');self.end_headers();self.wfile.write(body);return
  mode=self.path.strip('/')
  control='<select aria-label="导出格式" onchange="download(this.value,event)"><option value="">导出</option>'+''.join(f'<option value="{f}">{f}</option>' for f in ('html','pdf','pptx'))+'</select>' if mode=='baseline-select' else '<details><summary aria-label="导出格式">导出</summary>'+''.join(f'<button onclick="download(\'{f}\',event)">{html.escape(label)}</button>' for f,label in labels[mode].items())+'</details>'
  body=('<meta charset="UTF-8">'+control+'<script>function download(format,event){window.__trusted=event.isTrusted;const a=document.createElement("a");a.href="/download/"+format;a.download="fixture."+format;a.click()}</script>').encode();self.send_response(200);self.send_header('Content-Type','text/html;charset=utf-8');self.end_headers();self.wfile.write(body)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**({'executable_path':args.browser} if args.browser else {}),headless=True,args=['--no-sandbox'])
  for version,helper in [('current',n['export_control'])]:
   for mode in ('baseline-select','old-menu','current-menu'):
    for f in ('html','pdf','pptx'):
     page=browser.new_page(accept_downloads=True);page.set_default_timeout(400);page.goto(f'http://127.0.0.1:{server.server_port}/{mode}')
     try:
      with page.expect_download(timeout=1000) as event:helper(page,'candidate' if mode=='current-menu' else 'baseline','design',f)
      d=event.value;data=Path(d.path()).read_bytes();assert d.failure() is None and len(data)>0
      assert data.startswith({'html':b'<html','pdf':b'%PDF-','pptx':b'PK'}[f]);results.append({'helper':version,'mode':mode,'format':f,'download':True,'bytes':len(data),'trustedMenuClick':page.evaluate('window.__trusted') if mode!='baseline-select' else None})
     except Exception as e:
      raise AssertionError(f'{mode}/{f}: expected a real download') from e
     finally:page.close()
  browser.close()
finally:server.shutdown()
assert len(results)==9
print(json.dumps({'scope':'selector/download-event fixture only; no product export or performance qualification','results':results},ensure_ascii=False))
