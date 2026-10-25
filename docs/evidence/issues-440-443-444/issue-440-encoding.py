"""Restore upstream-identical Python cache from an already-installed JS asset.
No network request. The hash is Python tiktoken's upstream expected_hash.
Usage: python issue-440-encoding.py /path/to/js-tiktoken/dist/ranks/o200k_base.cjs
"""
import hashlib
import json
import sys
from pathlib import Path

source = Path(sys.argv[1]).read_text().removeprefix('module.exports = ').strip().removesuffix(';')
ranks = []
for line in json.loads(source)['bpe_ranks'].splitlines():
    _, offset, *tokens = line.split(' ')
    ranks.extend((int(offset) + i, token) for i, token in enumerate(tokens))
data = ''.join(f'{token} {rank}\n' for rank, token in sorted(ranks)).encode()
expected = '446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d'
assert hashlib.sha256(data).hexdigest() == expected
url = 'https://openaipublic.blob.core.windows.net/encodings/o200k_base.tiktoken'
output = Path('/tmp/issue440-encoding') / hashlib.sha1(url.encode()).hexdigest()
output.parent.mkdir(exist_ok=True)
output.write_bytes(data)
print(json.dumps({'tokens': len(ranks), 'sha256': expected, 'bytes': len(data), 'cache': str(output)}))
