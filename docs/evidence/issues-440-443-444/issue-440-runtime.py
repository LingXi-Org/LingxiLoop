"""Synthetic image probe. Run with Notebook's dev venv; no production services.
Requires local issue440-after image, SurrealDB 2.2.1 and MinIO image listed below.
"""
import io
import os
import json
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import boto3
import httpx
from docx import Document
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()


def until(fn, seconds=90):
    deadline = time.monotonic() + seconds
    while True:
        try:
            value = fn()
            if value:
                return value
        except Exception:
            if time.monotonic() >= deadline:
                raise
        if time.monotonic() >= deadline:
            raise TimeoutError('probe deadline')
        time.sleep(1)


class Embeddings(BaseHTTPRequestHandler):
    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        payload = json.dumps({'data': [{'index': i, 'embedding': [0.5] * 1024}
                                      for i, _ in enumerate(request['input'])]}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


network = 'issue440-probe'
containers = ['issue440-api', 'issue440-r2', 'issue440-db']
server = ThreadingHTTPServer(('0.0.0.0', 18881), Embeddings)
threading.Thread(target=server.serve_forever, daemon=True).start()
report = {}
try:
    docker('network', 'create', network)
    docker('run', '-d', '--name', containers[2], '--network', network,
           'surrealdb/surrealdb:v2.2.1', 'start', '--user', 'test', '--pass', 'test', 'memory')
    docker('run', '-d', '--name', containers[1], '--network', network,
           '-p', '127.0.0.1:18880:9000', '-e', 'MINIO_ROOT_USER=synthetic',
           '-e', 'MINIO_ROOT_PASSWORD=synthetic-secret',
           'lingxiloop-cloud-minio:20250907', 'server', '/tmp/data')
    s3 = boto3.client('s3', endpoint_url='http://127.0.0.1:18880',
                      aws_access_key_id='synthetic', aws_secret_access_key='synthetic-secret')
    until(lambda: httpx.get('http://127.0.0.1:18880/minio/health/live').status_code == 200)
    s3.create_bucket(Bucket='synthetic-probe')
    env = dict(SURREAL_URL='ws://issue440-db:8000/rpc', SURREAL_USER='test',
               SURREAL_PASSWORD='test', SURREAL_NAMESPACE='probe', SURREAL_DATABASE='probe',
               OPEN_NOTEBOOK_PASSWORD='synthetic', OPENAI_API_KEY='synthetic',
               OPENAI_BASE_URL='http://host.docker.internal:18881/internal/open-notebook/v1',
               OPENAI_EMBEDDING_MODEL='Pro/BAAI/bge-m3', OPEN_NOTEBOOK_R2_ENABLED='true',
               R2_ENDPOINT='http://issue440-r2:9000', R2_BUCKET='synthetic-probe',
               R2_ACCESS_KEY_ID='synthetic', R2_SECRET_ACCESS_KEY='synthetic-secret')
    # Keep synthetic Docker service traffic on its local bridge, as for SurrealDB.
    local_hosts = 'issue440-r2,issue440-db,host.docker.internal,localhost,127.0.0.1'
    for key in ['NO_PROXY', 'no_proxy']:
        env[key] = ','.join(filter(None, [os.environ.get(key, ''), local_hosts]))
    flags = [value for key, val in env.items() for value in ['-e', f'{key}={val}']]
    docker('run', '-d', '--name', containers[0], '--network', network,
           '--add-host', 'host.docker.internal:host-gateway', '-p', '127.0.0.1:18882:5055',
           *flags, os.environ.get('RAG_PROBE_IMAGE', 'issue440-after'))
    client = httpx.Client(base_url='http://127.0.0.1:18882',
                          headers={'Authorization': 'Bearer synthetic'}, timeout=10)
    def request(method, path, **kwargs):
        response = client.request(method, path, **kwargs)
        assert response.is_success, (response.status_code, response.text)
        response.raise_for_status()
        return response.json()
    report['ready'] = until(lambda: request('GET', '/readyz'))
    report['supervisor'] = docker('exec', containers[0], '/app/.venv/bin/python', '-c',
        'import importlib.metadata, pathlib; print(importlib.metadata.version("supervisor")); '
        'print(pathlib.Path("/proc/1/cmdline").read_bytes().replace(bytes([0]), b" "))')
    report['healthcheck'] = docker('exec', containers[0], 'sh', '-c',
        '/app/.venv/bin/supervisorctl -s unix:///tmp/supervisor.sock status rag-api && '
        '/app/.venv/bin/supervisorctl -s unix:///tmp/supervisor.sock status rag-worker && '
        'curl -fsS http://127.0.0.1:5055/readyz')
    if os.environ.get('RAG_PROBE_SKIP_INGESTION'):
        report['ingestion'] = 'not run: encoding asset download was denied by proxy'
    else:
        notebook = request('POST', '/api/notebooks', json={'name': 'Synthetic', 'external_key': 'probe'})
        doc = Document(); doc.add_paragraph('Synthetic evidence for retrieval.')
        docx = io.BytesIO(); doc.save(docx)
        pdf = PdfWriter(); page = pdf.add_blank_page(width=300, height=300)
        font = DictionaryObject({NameObject('/Type'): NameObject('/Font'),
                                NameObject('/Subtype'): NameObject('/Type1'),
                                NameObject('/BaseFont'): NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): font})})
        stream = DecodedStreamObject(); stream.set_data(b'BT /F1 12 Tf 20 200 Td (Synthetic evidence for retrieval.) Tj ET')
        page[NameObject('/Contents')] = pdf._add_object(stream)
        pdf_bytes = io.BytesIO(); pdf.write(pdf_bytes)
        report['ingestion'] = []
        for name, mime, content in [('probe.md', 'text/markdown', b'# Synthetic evidence for retrieval.'),
                                   ('probe.pdf', 'application/pdf', pdf_bytes.getvalue()),
                                   ('probe.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', docx.getvalue())]:
            key = 'knowledge-sources/' + name
            s3.put_object(Bucket='synthetic-probe', Key=key, Body=content, ContentType=mime)
            source = request('POST', '/api/sources/json', headers={'Idempotency-Key': name}, json={
                'type': 'file', 'notebooks': [notebook['id']], 'company_id': 'synthetic',
                'storage_key': key, 'filename': name, 'mime_type': mime, 'size_bytes': len(content)})
            def completed():
                status = request('GET', f"/api/sources/{source['id']}/status")
                assert status['status'] != 'failed', status
                return status if status['status'] == 'completed' else None
            status = until(completed)
            search = request('POST', '/api/search', json={'query': 'Synthetic evidence',
                'notebook_id': notebook['id'], 'source_ids': [source['id']], 'company_id': 'synthetic',
                'type': 'vector', 'minimum_score': 0})
            assert search['total_count'] > 0, search
            report['ingestion'].append({'format': name, 'chunks': status['embedded_chunks'],
                                        'search_results': search['total_count']})
    ctl = ['/app/.venv/bin/supervisorctl', '-s', 'unix:///tmp/supervisor.sock']
    pid = docker('exec', containers[0], *ctl, 'pid', 'rag-worker')
    docker('exec', containers[0], '/app/.venv/bin/python', '-c',
           f'import os, signal; os.kill({int(pid)}, signal.SIGKILL)')
    def restarted():
        new = docker('exec', containers[0], *ctl, 'pid', 'rag-worker')
        state = docker('exec', containers[0], *ctl, 'status', 'rag-worker')
        return new if new not in {'0', pid} and 'RUNNING' in state else None
    report['worker_restart'] = {'old_pid': pid, 'new_pid': until(restarted)}
    report['ready_after_restart'] = request('GET', '/readyz')
    started = time.monotonic(); docker('stop', '-t', '20', containers[0])
    report['sigterm'] = {'seconds': round(time.monotonic() - started, 3),
        'state': json.loads(docker('inspect', '--format', '{{json .State}}', containers[0]))}
    report['shutdown_log'] = docker('logs', '--tail', '16', containers[0])
    assert report['sigterm']['state']['ExitCode'] == 0
    assert 'stopped: rag-worker' in report['shutdown_log']
    assert 'stopped: rag-api' in report['shutdown_log']
    Path('/tmp/issue440-runtime.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
finally:
    for container in containers:
        subprocess.run(['docker', 'rm', '-f', container], stdout=subprocess.DEVNULL)
    subprocess.run(['docker', 'network', 'rm', network], stdout=subprocess.DEVNULL)
    server.shutdown()
