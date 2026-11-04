"""Native Slides two-image drop across a handoff; synthetic local grants only.

Build host + Slides, start the loopback TLS recovery fixture, then run:
python3 perf/issue-652/recovery-multi-image-handoff.py PORT OUT.json [WIDTH]
"""
import base64
import hashlib
import json
import struct
import subprocess
import sys
import time
import zlib
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


port, output, *rest = sys.argv[1:]
width = int(rest[0]) if rest else 1440
public = subprocess.check_output(['openssl', 'x509', '-pubkey', '-noout', '-in', '.codex-tmp/issue-652/tls/cert.pem'])
der = subprocess.check_output(['openssl', 'pkey', '-pubin', '-outform', 'der'], input=public)
spki = base64.b64encode(hashlib.sha256(der).digest()).decode()


def png(color):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    row = b'\x00' + bytes(color) * 640
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 640, 360, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(row * 360)) + chunk(b'IEND', b'')


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=[
        '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1',
        '--ignore-certificate-errors-spki-list=' + spki,
    ])
    context = browser.new_context(viewport={'width': width, 'height': 1000}, accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(f'https://app.lingxi-perf.cn:{port}/?retain=true', wait_until='domcontentloaded')
    page.evaluate('''() => {
      window.handoffHeld = [];
      window.holdHandoff = true;
      addEventListener('message', event => {
        if (window.holdHandoff && event.data?.type === 'artifact:recovery-response'
          && ['snapshot', 'clean', 'unavailable'].includes(event.data.result)) {
          event.stopImmediatePropagation();
          window.handoffHeld.push({data:event.data, origin:event.origin, source:event.source});
        }
      }, true);
      window.releaseHandoff = () => {
        window.holdHandoff = false;
        for (const message of window.handoffHeld) dispatchEvent(new MessageEvent('message', message));
        window.handoffHeld = [];
      };
    }''')
    access = lambda **values: page.evaluate('''values => fetch('/fixture/access', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(values)
    }).then(response => response.json())''', values)
    access(read=True, write=True, failPublish=True, shortGrants=False, reset=True)
    page.locator('#open-deck-a').click()
    deadline = time.monotonic() + 45
    editor = None
    while time.monotonic() < deadline:
        frames = [frame for frame in page.frames if '/artifact-editor/slides/' in frame.url]
        if frames and frames[0].locator('[data-slides-editor]').count():
            editor = frames[0]
            break
        page.wait_for_timeout(50)
    assert editor is not None, 'native Slides editor did not mount'
    editor.locator('[data-slide-surface]').first.wait_for(timeout=30000)
    page.evaluate("window.oldFrame=document.querySelector('[data-artifact-editor=slides] iframe')")
    editor.evaluate('''() => {
      window.handoffRequests = [];
      addEventListener('message', event => {
        if (event.data?.type === 'artifact:recovery-request' && event.data.command === 'snapshot')
          window.handoffRequests.push(event.data.requestId);
      }, true);
      const NativeImage = window.Image;
      const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      const gate = {started:0, release:[]};
      window.multiImageGate = gate;
      window.Image = function (...args) {
        const image = new NativeImage(...args);
        Object.defineProperty(image, 'src', {configurable:true,
          get() { return src.get.call(image); },
          set(value) {
            if (gate.started < 2) {
              gate.started++;
              gate.release.push(() => src.set.call(image, value));
            } else src.set.call(image, value);
          }
        });
        return image;
      };
    }''')
    first, second = png((12, 120, 92)), png((92, 12, 120))
    editor.evaluate('''images => {
      const drop = new DataTransfer();
      for (const image of images) drop.items.add(new File([new Uint8Array(image.data)], image.name, {type:'image/png'}));
      const surface = document.querySelector('[data-slides-ground]');
      const rect = surface.getBoundingClientRect();
      surface.dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:drop,
        clientX:rect.left+rect.width/2, clientY:rect.top+rect.height/2}));
    }''', [{'name': 'first-handoff.png', 'data': list(first)}, {'name': 'second-handoff.png', 'data': list(second)}])
    editor.wait_for_function('window.multiImageGate.started === 1', timeout=15000)
    page.locator('#close').click()
    access(write=False, failPublish=False)
    page.locator('#open-deck-a').click()
    editor.wait_for_function('window.handoffRequests.length > 0', timeout=15000)
    page.wait_for_timeout(200)
    assert page.evaluate('window.handoffHeld.length') == 0, 'snapshot replied while the first image was pending'
    editor.evaluate('window.multiImageGate.release[0]()')
    editor.wait_for_function('window.multiImageGate.started === 2', timeout=15000)
    page.wait_for_timeout(200)
    assert page.evaluate('window.handoffHeld.length') == 0, 'snapshot replied between images in one drop transaction'
    editor.evaluate('window.multiImageGate.release[1]()')
    page.wait_for_function('window.handoffHeld.length > 0', timeout=20000)
    reply = page.evaluate('''() => {
      const response = window.handoffHeld[0].data;
      return {result:response.result, packet:response.bytes ? JSON.parse(new TextDecoder().decode(response.bytes)) : null};
    }''')
    assert reply['result'] == 'snapshot', reply
    packet = reply['packet']
    payload = json.dumps(packet['state']['content'])
    assert 'first-handoff.png' in payload and 'second-handoff.png' in payload, 'both native dropped images must be in the backup'
    assert page.evaluate('window.oldFrame.isConnected'), 'old editor was replaced before parent received backup'
    page.evaluate('window.releaseHandoff()')
    button = page.get_by_role('button', name='下载本地副本', exact=True)
    expect(button).to_be_visible(timeout=20000)
    with page.expect_download() as download:
        button.click()
    saved = Path(output).with_suffix('.lingxi-recovery.json')
    saved.parent.mkdir(parents=True, exist_ok=True)
    download.value.save_as(saved)
    assert json.loads(saved.read_text())['state'] == packet['state'], 'download differs from held native snapshot'
    assert not errors, errors
    result = {'scope':'Native two-image drop, actual Slides/Frame/gateway and synthetic downgrade; parent response deliberately held.',
              'browser':browser.version, 'width':width, 'bothImagesInBackup':True,
              'snapshotHeldBetweenImages':True, 'oldFrameKeptUntilBackupDelivered':True, 'errors':errors}
    Path(output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))
    context.close()
    browser.close()
