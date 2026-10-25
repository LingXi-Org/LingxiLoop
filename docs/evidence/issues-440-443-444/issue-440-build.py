"""Reproduce fixed-base builds from a baseline git ref and candidate worktree.
Usage: python issue-440-build.py /path/to/candidate 9e3bfd8
Requires this environment's proxy and CA; TLS validation remains enabled.
"""
import os
import socket
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

root = Path(sys.argv[1]).resolve()
base = sys.argv[2]
python = 'accel.way2api.fun/docker.io/library/python@sha256:a0f57064cbdcd6285fa45f51237ab0b35ea8ebaed06a1f5973e89e19dfb86704'
uv = 'accel.way2api.fun/ghcr.io/astral-sh/uv@sha256:32a7bb39b496babbd997b0a39a4d66c126bdaf5661b302bf6f06abda8deca6ff'
files = subprocess.check_output(['git', 'ls-files', 'third_party/open-notebook'], cwd=root, text=True).splitlines()
for variant in ['before', 'after']:
    dest = Path('/tmp/issue440-' + variant); dest.mkdir(exist_ok=True)
    for filename in files:
        path = dest / Path(filename).relative_to('third_party/open-notebook')
        path.parent.mkdir(parents=True, exist_ok=True)
        content = (subprocess.check_output(['git', 'show', base + ':' + filename], cwd=root)
                   if variant == 'before' else (root / filename).read_bytes())
        path.write_bytes(content)
    path = dest / 'Dockerfile'
    content = path.read_text().replace('accel.way2api.fun/docker.io/library/python:3.12-slim-trixie', python)
    content = content.replace('accel.way2api.fun/ghcr.io/astral-sh/uv:latest', uv)
    content = content.replace('RUN uv sync', 'RUN --mount=type=secret,id=environment-ca SSL_CERT_FILE=/run/secrets/environment-ca UV_NATIVE_TLS=true uv sync')
    cache = next(Path('/tmp/issue440-encoding').iterdir())
    content = content.replace('RUN mkdir -p /app/tiktoken-cache &&',
        'RUN --mount=type=bind,from=encoding,target=/encoding,ro mkdir -p /app/tiktoken-cache && cp /encoding/' + cache.name + ' /app/tiktoken-cache/' + cache.name + ' &&')
    assemble = '--assemble' in sys.argv
    if assemble:
        start = content.index('RUN --mount=type=bind,from=encoding')
        end = content.index('\n\n', start)
        content = content[:start] + 'RUN mkdir -p /app/tiktoken-cache' + content[end:]
    path.write_text(content)
    proxy = urlsplit(os.environ['HTTPS_PROXY']).hostname
    address = socket.gethostbyname(proxy)
    subprocess.run(['docker', 'build', '--platform', 'linux/amd64', '--add-host', f'{proxy}:{address}',
        '--secret', 'id=environment-ca,src=/etc/ssl/certs/ca-certificates.crt',
        '--build-context', 'encoding=/tmp/issue440-encoding',
        '--build-arg', 'HTTP_PROXY', '--build-arg', 'HTTPS_PROXY', '--build-arg', 'NO_PROXY',
        '-t', 'issue440-' + variant + ('-probe' if assemble else ''), str(dest)], check=True,
        env={**os.environ, 'DOCKER_CONFIG': '/tmp/issue440-docker'})
    if assemble:
        name = 'issue440-' + variant + '-cache'
        subprocess.run(['docker', 'create', '--name', name, 'issue440-' + variant + '-probe'], check=True)
        subprocess.run(['docker', 'cp', str(cache), name + ':/app/tiktoken-cache/' + cache.name], check=True)
        subprocess.run(['docker', 'commit', name, 'issue440-' + variant], check=True)
        subprocess.run(['docker', 'rm', name], check=True)
