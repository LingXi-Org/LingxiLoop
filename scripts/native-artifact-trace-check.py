#!/usr/bin/env python3
"""Real-browser regression for missing worker-entry CDP completion/byte events."""
import argparse
import gzip
import json
import runpy
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

benchmark = runpy.run_path(str(Path(__file__).with_name('native-artifact-benchmark.py')))
Trace, totals, safe_url = (benchmark[key] for key in ('Trace', 'script_totals', 'safe_url'))
parser = argparse.ArgumentParser()
parser.add_argument('--browser')
args = parser.parse_args()
source = b'//' + b'x' * 1000000 + b'\nimport "./dependency.js";self.postMessage("ready");'
dependency = b'//' + b'y' * 1000000 + b'\nexport const ready=true;'
queued_source = b'window.__queued=(window.__queued||0)+1;//' + b'q' * 20000
assets = {'/plain-worker.js': source, '/gzip-worker.js': gzip.compress(source, mtime=0), '/dependency.js': dependency}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args): pass
    def do_GET(self):
        path = self.path.split('?')[0]
        body = assets.get(path, b'<script>let ready=0;if(location.hash==="#queued"){for(let i=0;i<12;i++){const s=document.createElement("script");s.src="/queued-"+i+".js";s.onload=()=>{if(++ready===12)document.documentElement.dataset.ready="yes"};document.head.append(s)}}else{const urls=location.hash==="#concurrent"?["/plain-worker.js?one","/plain-worker.js?two"]:[location.hash.slice(1)];for(const url of urls)new Worker(url,{type:"module"}).onmessage=()=>{if(++ready===urls.length)document.documentElement.dataset.ready="yes"}}</script>')
        if path.startswith('/queued-') and path.endswith('.js'):
            time.sleep(.35)
            body = queued_source
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript' if path.endswith('.js') else 'text/html')
        if path == '/gzip-worker.js': self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
results = []
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=['--no-sandbox'], **({'executable_path': args.browser} if args.browser else {}))
        for path in ['/plain-worker.js', '/gzip-worker.js']:
            context = browser.new_context()
            page = context.new_page()
            trace = Trace(context, page)
            page.goto(f'http://127.0.0.1:{server.server_port}/#{path}', wait_until='domcontentloaded')
            page.wait_for_function('document.documentElement.dataset.ready==="yes"', timeout=30000)
            page.wait_for_timeout(100)
            trace.reconcile_decoded(page)
            rows = trace.snapshot()
            entry = next(row for row in rows if row['url'] == safe_url('http://localhost' + path))
            imports = next(row for row in rows if row['url'] == safe_url('http://localhost/dependency.js'))
            assert not trace.inflight(), 'a completed worker must not leave a phantom request'
            assert not trace.errors, trace.errors
            assert entry['finished'] and entry['decodedObserved']
            assert entry['decodedBytes'] == len(source)
            assert entry['transferredBytes'] == entry['observedResponseHeadersBytes'] + len(assets[path]), 'use observed encoded bytes, not the decoded body or nominal 300-byte headers'
            assert imports['finished'] and imports['decodedObserved']
            assert imports['decodedBytes'] == len(dependency)
            import_ms = (imports['end'] - imports['start']) * 1000 if 'end' in imports and 'start' in imports else imports['finishedEpochMs'] - imports['startEpochMs']
            assert import_ms >= 1500, 'worker imports must inherit the root network limit'
            assert not trace.unaccounted_script_resources
            assert not totals(rows)['missingDecoded'] and not totals(rows)['missingTransfer']
            results.append({'encoding': 'gzip' if 'gzip' in path else 'identity', 'workerTransferBytes': entry['transferredBytes'], 'workerDecodedBytes': entry['decodedBytes'], 'importDurationMs': round(import_ms, 1), 'scriptRequests': totals(rows)['requests'], 'inflight': len(trace.inflight())})
            context.close()
        context = browser.new_context()
        page = context.new_page()
        trace = Trace(context,page)
        page.goto(f'http://127.0.0.1:{server.server_port}/#concurrent',wait_until='domcontentloaded')
        page.wait_for_function('document.documentElement.dataset.ready==="yes"',timeout=30000)
        page.wait_for_timeout(100)
        trace.reconcile_decoded(page)
        rows = trace.snapshot()
        assert not trace.inflight()
        if trace.ambiguous_requests:
            # Timings that cannot identify a unique request must reject the
            # real measurement; they cannot become a smaller successful total.
            results.append({'encoding':'concurrent','refusedAsAmbiguous':True,'ambiguousRequests':trace.ambiguous_requests})
        else:
            assert not trace.unaccounted_script_resources
            assert totals(rows)['requests'] == 4, 'two worker entries plus two shared imports must be retained'
            assert totals(rows)['decodedBytes'] == 2 * (len(source) + len(dependency))
            assert not totals(rows)['missingDecoded'] and not totals(rows)['missingTransfer']
            results.append({'encoding':'concurrent','scriptRequests':totals(rows)['requests'],'scriptDecodedBytes':totals(rows)['decodedBytes'],'ambiguousRequests':0})
        context.close()
        context=browser.new_context();page=context.new_page();trace=Trace(context,page)
        page.goto(f'http://127.0.0.1:{server.server_port}/#queued',wait_until='domcontentloaded')
        page.wait_for_function('document.documentElement.dataset.ready==="yes"',timeout=30000)
        trace.reconcile_decoded(page);rows=trace.snapshot()
        cdp=[row for row in rows if row.get('start') is not None and row.get('type')=='Script']
        skews=[entry['startEpochMs']-row['startEpochMs'] for row in cdp for entry in trace.finished_requests if entry['_resourceKey']==row['_resourceKey']]
        assert max(skews)>=100, 'real connection queueing must exercise distinct protocol timing stages'
        assert totals(rows)['requests']==12, 'network-start timing must not duplicate queued script requests'
        assert totals(rows)['decodedBytes']==12*len(queued_source)
        assert not totals(rows)['missingDecoded'] and not totals(rows)['missingTransfer']
        assert not trace.ambiguous_requests and not trace.unaccounted_script_resources
        results.append({'encoding':'queued','scriptRequests':totals(rows)['requests'],'maxNetworkStartSkewMs':round(max(skews),1),'scriptDecodedBytes':totals(rows)['decodedBytes']})
        context.close()
        browser.close()
finally:
    server.shutdown()
print(json.dumps({'check': 'worker-entry-network-accounting', 'results': results, 'performanceSamples': 0, 'qualified': False}))
