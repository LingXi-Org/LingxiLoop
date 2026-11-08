#!/usr/bin/env python3
"""Actual benchmark launch, delayed Worker and redirect accounting regressions."""
import argparse
import gzip
import json
from pathlib import Path
import random
import runpy
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

benchmark = runpy.run_path(str(Path(__file__).with_name('native-artifact-benchmark.py')))
parser = argparse.ArgumentParser()
parser.add_argument('--browser')
parser.add_argument('--case', choices=['slow', 'sequential', 'redirect', 'concurrent', 'late', 'both'], default='both')
args = parser.parse_args()
randomizer = random.Random(707)
source = ('//' + ''.join(randomizer.choice('abcdef0123456789') for _ in range(4390)) + '\nself.postMessage("ready");self.onmessage=()=>{};').encode()
encoded = gzip.compress(source, mtime=0)
wire = {}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args): pass
    def do_GET(self):
        if self.path == '/slow-worker.js': time.sleep(.25)
        redirect = self.path == '/redirect-worker.js'
        script = self.path.endswith('.js')
        body = b'' if redirect else encoded if script else b'<script>let count=0;const concurrent=location.hash==="#concurrent",sequential=location.hash==="#sequential",total=concurrent||sequential?2:1;const make=()=>{new Worker(sequential?"/slow-worker.js":concurrent?"/fast-worker.js":location.hash.slice(1),{type:"module"}).onmessage=()=>{if(++count===total)document.documentElement.dataset.ready="yes";else if(sequential)make()}};for(let i=0;i<(concurrent?2:1);i++)make()</script>'
        self.send_response(302 if redirect else 200)
        self.send_header('Content-Type', 'text/javascript' if script else 'text/html')
        if redirect: self.send_header('Location', '/fast-worker.js')
        elif script: self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(body)))
        # Exact bytes written by this fixed test server, never product headers.
        wire[self.path] = wire.get(self.path,0) + sum(map(len, self._headers_buffer)) + 2 + len(body)
        self.end_headers()
        self.wfile.write(body)

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
results = []
try:
    with sync_playwright() as playwright:
        for case in ['slow', 'sequential', 'redirect', 'concurrent', 'late'] if args.case == 'both' else [args.case]:
            wire.clear()
            resources = benchmark['launch'](playwright, {'origin':f'http://127.0.0.1:{server.server_port}', 'cookies':[]}, args.browser)
            try:
                _, context, page, _, _ = resources
                trace = benchmark['Trace'](context, page) if case != 'late' else None
                path = '/slow-worker.js' if case == 'slow' else '/redirect-worker.js' if case == 'redirect' else case if case in ('concurrent','sequential') else '/fast-worker.js'
                page.goto(f'http://127.0.0.1:{server.server_port}/#{path}', wait_until='domcontentloaded')
                page.wait_for_function('document.documentElement.dataset.ready==="yes"')
                page.wait_for_timeout(100)
                if case == 'late': trace = benchmark['Trace'](context, page)
                trace.reconcile_decoded(page)
                rows = trace.snapshot()
                totals = benchmark['script_totals'](rows)
                if case in ('slow','sequential'):
                    count=2 if case=='sequential' else 1
                    assert totals['requests'] == count and not totals['missingDecoded'] and not totals['missingTransfer'], totals
                    assert totals['decodedBytes'] == count*len(source)
                    assert totals['transferredBytes'] == wire['/slow-worker.js'], (totals['transferredBytes'], wire['/slow-worker.js'])
                    assert not trace.ambiguous_requests and not trace.unaccounted_script_resources
                    entry = next(row for row in rows if benchmark['script_request'](row))
                    creation_gap = entry['_workerTimeOriginEpochMs'] - entry['startEpochMs']
                    assert creation_gap >= 200, 'the real delayed entry must exceed the original 100 ms network-start window'
                    results.append({'case':case,'exactTransferBytes':totals['transferredBytes'],'decodedBytes':totals['decodedBytes'],'workerCreationGapMs':round(creation_gap,1)})
                elif case == 'redirect':
                    expected = wire[path] + wire['/fast-worker.js']
                    rejected = bool(totals['missingTransfer'] or totals['missingDecoded'] or trace.ambiguous_requests or trace.unaccounted_script_resources)
                    assert rejected or totals['transferredBytes'] == expected, (totals, expected)
                    results.append({'case':case,'rejected':rejected,'observedTransferBytes':totals['transferredBytes'],'actualWireBytes':expected})
                else:
                    assert trace.ambiguous_requests or trace.unaccounted_script_resources, 'ambiguous or missing request identity must reject the sample'
                    results.append({'case':case,'rejected':True,'ambiguousRequests':trace.ambiguous_requests,'unaccountedResources':len(trace.unaccounted_script_resources)})
            finally:
                benchmark['close'](resources)
finally:
    server.shutdown()
print(json.dumps({'passed':True,'cases':results,'scope':'真实浏览器计量回归，不代替产品性能门槛'},ensure_ascii=False))
