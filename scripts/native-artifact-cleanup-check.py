#!/usr/bin/env python3
"""Real keyboard/HTTP fixture regression for benchmark failure cleanup selectors.
This checks the measurement helper, not native product undo acceptance.
"""
import argparse
import base64
import json
import runpy
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

benchmark = runpy.run_path(str(Path(__file__).with_name('native-artifact-benchmark.py')))
parser = argparse.ArgumentParser()
parser.add_argument('--browser')
args = parser.parse_args()
image = 'data:image/svg+xml;base64,' + base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="green"/></svg>').decode()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args): pass
    def do_GET(self):
        native, kind = '/native/' in self.path, 'slides' if '/slides/' in self.path else 'design'
        heading = '<h1 data-text-path="heading" style="font:24px system-ui">验收页面 1 ✓</h1>'
        if native: heading = '<div data-node-id="page-1-heading"><div class="native-text-content">' + heading + '</div></div>'
        body = heading + f'<img src="{image}" width="64" height="36"><span class="katex">公式</span>'
        body = f'<div data-native-artifact-editor="{kind}" tabindex="0"><div data-page-id="page-1">{body}</div></div>' if native else f'<div data-slides-editor><div data-slide-surface>{body}</div></div>' if kind == 'slides' else body
        endpoint = '/api/artifacts/fixture/operations' if native else f'/artifact-editor/{kind}/fixture/__deck/publish'
        body += '<script>window.__fixtureUndoCount=0;window.__nativeArtifactInputAttempt={number:1,attempted:true};document.addEventListener("keydown",event=>{if(event.ctrlKey&&event.key==="z"){event.preventDefault();if(!event.isTrusted)throw Error("untrusted");window.__fixtureUndoCount++;document.querySelector("h1").textContent="验收页面 1";fetch(' + json.dumps(endpoint) + ',{method:"POST",headers:{"content-type":"application/json"},body:"{}"})}});</script>'
        encoded = ('<!doctype html><meta charset="utf-8">'+body).encode()
        self.send_response(200); self.send_header('Content-Type','text/html;charset=utf-8'); self.send_header('Content-Length',str(len(encoded))); self.end_headers(); self.wfile.write(encoded)
    def do_POST(self):
        self.rfile.read(int(self.headers.get('Content-Length','0')))
        self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length','2'); self.end_headers(); self.wfile.write(b'{}')

server = ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
results = []
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':args.browser} if args.browser else {}))
        for native,kind in [(True,'design'),(True,'slides'),(False,'design'),(False,'slides')]:
            page = browser.new_page(viewport={'width':1440,'height':1000})
            url = f'http://127.0.0.1:{server.server_port}/' + (f'native/{kind}/' if native else f'artifact-editor/{kind}/fixture/')
            page.goto(url,wait_until='networkidle')
            result = benchmark['cleanup_edit'](page,kind,1,'fixture')
            assert result['saveAcknowledged'] and result['originalHeadingRestored']
            assert page.evaluate('window.__fixtureUndoCount') == 1
            page.evaluate('document.querySelector("h1").textContent="其他内容";window.__fixtureUndoCount=0')
            try: benchmark['cleanup_edit'](page,kind,1,'fixture')
            except benchmark['MeasurementFailure'] as error: assert error.code == 'fixture_restore_unconfirmed'
            else: raise AssertionError('unknown input must not be blindly undone')
            assert page.evaluate('window.__fixtureUndoCount') == 0
            results.append({'kind':kind,'native':native,'markerUndoneWithRealKeyboardAndAck':True,'unknownEditRefused':True})
            page.close()
        browser.close()
finally:
    server.shutdown()
print(json.dumps({'check':'failed-input-cleanup-selector','results':results,'scope':'isolated measurement helper fixture, not product undo acceptance','performanceSamples':0,'qualified':False}))
