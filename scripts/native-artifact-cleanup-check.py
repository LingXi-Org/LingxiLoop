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
        denied=self.path.endswith('/denied')
        editing=self.path.endswith(('/active','/finish'))
        heading = '<h1 data-text-path="heading" style="font:24px system-ui">验收页面 1 ✓</h1>'
        if editing:heading=heading.replace('<h1 ','<h1 data-native-text-editor="true" contenteditable="true" ',1)
        if native: heading = '<div data-node-id="page-1-heading">' + ('<div class="native-rich-editor">'+heading+'<button id="finish">完成</button></div>' if editing else '<div class="native-text-content">'+heading+'</div>') + '</div>'
        body = heading + f'<img src="{image}" width="64" height="36"><span class="katex">公式</span>'
        body = f'<aside id="workspace"><div data-native-artifact-editor="{kind}" tabindex="0"><button>工具</button><div data-page-id="page-1">{body}</div></div></aside>' if native else f'<div data-slides-editor><div data-slide-surface>{body}</div></div>' if kind == 'slides' else body
        endpoint = '/api/artifacts/denied/operations' if denied else '/api/artifacts/fixture/operations' if native else f'/artifact-editor/{kind}/fixture/__deck/publish'
        body += '<script>window.__fixtureFinishCount=0;document.querySelector("#finish")?.addEventListener("click",event=>{if(!event.isTrusted)throw Error("untrusted");document.querySelector("h1").removeAttribute("contenteditable");window.__fixtureFinishCount++;event.currentTarget.remove();document.querySelector("[data-native-artifact-editor] button").focus()});window.__fixtureUndoCount=0;window.__nativeArtifactInputAttempt={number:1,attempted:true};const root=document.querySelector("[data-native-artifact-editor]"),denied='+json.dumps(denied)+';(root??document).addEventListener("keydown",event=>{if(event.key==="Escape"&&event.target.isContentEditable){event.preventDefault();event.target.removeAttribute("contenteditable");document.querySelector("#finish")?.remove();root.querySelector("button").focus()}if(event.ctrlKey&&event.key==="z"){event.preventDefault();if(!event.isTrusted)throw Error("untrusted");window.__fixtureUndoCount++;if(!denied)document.querySelector("h1").textContent="验收页面 1";fetch(' + json.dumps(endpoint) + ',{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"undo"})})}});document.querySelector("#workspace")?.addEventListener("keydown",event=>{if(event.key==="Escape"&&!event.defaultPrevented){root.hidden=true;window.__fixtureWorkspaceClosed=true}});</script>'
        encoded = ('<!doctype html><meta charset="utf-8">'+body).encode()
        self.send_response(200); self.send_header('Content-Type','text/html;charset=utf-8'); self.send_header('Content-Length',str(len(encoded))); self.end_headers(); self.wfile.write(encoded)
    def do_POST(self):
        self.rfile.read(int(self.headers.get('Content-Length','0')))
        self.send_response(403 if '/denied/' in self.path else 200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length','2'); self.end_headers(); self.wfile.write(b'{}')

server = ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
results = []
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':args.browser} if args.browser else {}))
        for native,kind,editing in [(True,'design',False),(True,'slides',False),(True,'design',True),(False,'design',False),(False,'slides',False)]:
            page = browser.new_page(viewport={'width':1440,'height':1000})
            url = f'http://127.0.0.1:{server.server_port}/' + (f'native/{kind}/'+('active' if editing else '') if native else f'artifact-editor/{kind}/fixture/')
            page.goto(url,wait_until='networkidle')
            if native:
                page.keyboard.press('Tab');page.keyboard.press('Tab')
                assert page.evaluate('document.activeElement.textContent') == '工具'
            if editing:page.locator('h1').click()
            result = benchmark['cleanup_edit'](page,kind,1,'fixture')
            assert result['saveAcknowledged'] and result['originalHeadingRestored']
            assert page.evaluate('window.__fixtureUndoCount') == 1
            if native: assert not page.evaluate('Boolean(window.__fixtureWorkspaceClosed)')
            page.evaluate('document.querySelector("h1").textContent="其他内容";window.__fixtureUndoCount=0')
            try: benchmark['cleanup_edit'](page,kind,1,'fixture')
            except benchmark['MeasurementFailure'] as error: assert error.code == 'fixture_restore_unconfirmed'
            else: raise AssertionError('unknown input must not be blindly undone')
            assert page.evaluate('window.__fixtureUndoCount') == 0
            results.append({'kind':kind,'native':native,'activeEditableEnded':editing,'markerUndoneWithRealKeyboardAndAck':True,'unknownEditRefused':True,'outerWorkspaceStayedOpen':True if native else None})
            page.close()
        completion_results=[]
        for kind in ('design','slides'):
            page=browser.new_page(viewport={'width':1440,'height':1000})
            page.goto(f'http://127.0.0.1:{server.server_port}/native/{kind}/finish',wait_until='networkidle')
            page.locator('h1').click();page.get_by_role('button',name='工具',exact=True).click()
            benchmark['finish_heading'](page,page.main_frame)
            assert page.evaluate('window.__fixtureFinishCount')==1
            assert not page.locator('h1').evaluate('e=>e.isContentEditable')
            assert not page.evaluate('Boolean(window.__fixtureWorkspaceClosed)')
            result=benchmark['cleanup_edit'](page,kind,1,'fixture')
            assert result['saveAcknowledged'] and result['originalHeadingRestored']
            completion_results.append({'kind':kind,'trustedCompletionClick':True,'outerWorkspaceStayedOpen':True,'realKeyboardUndoAcknowledged':True})
            page.close()
        page=browser.new_page(viewport={'width':1440,'height':1000})
        page.goto(f'http://127.0.0.1:{server.server_port}/native/design/denied',wait_until='networkidle')
        page.keyboard.press('Tab');page.keyboard.press('Tab')
        try:benchmark['undo_edit'](page,'design',1,'denied',timeout=1)
        except benchmark['MeasurementFailure'] as error:
            probe=error.observations
            assert probe['historyPosts']==probe['operationPosts']==1
            assert probe['historyStatuses']==probe['operationStatuses']==[403]
            assert probe['rootKeySeen'] and probe['rootKeyTrusted'] and probe['rootKeyPrevented']
            assert probe['editorVisible'] and probe['bodyMarked'] and not probe['bodyOriginal']
            assert not probe['headingVerified'] and probe['focusCompleted'] and probe['keySent']
        else:raise AssertionError('a rejected undo must remain failed')
        assert page.evaluate('window.__nativeArtifactUndoStop===undefined&&window.__nativeArtifactUndoProbe===undefined&&window.__nativeArtifactUndoEvent===undefined')
        page.keyboard.press('Escape')
        try:benchmark['undo_edit'](page,'design',1,'denied',timeout=1)
        except benchmark['MeasurementFailure'] as error:
            closed_probe=error.observations
            assert error.code=='native_keyboard_focus_unavailable'
            assert closed_probe['nativeEditorPresent'] and not closed_probe['editorVisible']
            assert not closed_probe['keySent'] and closed_probe['historyPosts']==0
        else:raise AssertionError('a hidden native editor cannot become a legacy shortcut target')
        assert page.evaluate('window.__fixtureUndoCount')==1
        page.close()
        browser.close()
finally:
    server.shutdown()
print(json.dumps({'check':'failed-input-cleanup-selector','results':results,'completionResults':completion_results,'deniedUndoEvidence':probe,'closedEditorEvidence':closed_probe,'scope':'isolated measurement helper fixture, not product undo acceptance','performanceSamples':0,'qualified':False}))
