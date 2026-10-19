"""Synthetic constant embeddings: contract/isolation only, no semantic quality claim."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

counts = {"requests": 0, "inputs": 0}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(counts).encode())

    def do_POST(self):
        try:
            assert self.path == "/v1/embeddings"
            assert self.headers.get("Authorization") == "Bearer lingxiloop-e2e-embedding-local"
            length = int(self.headers.get("Content-Length", "0"))
            assert 0 < length <= 2_000_000
            request = json.loads(self.rfile.read(length))
            assert request["model"] == "e2e-constant-vector-1024"
            items = request["input"]
            assert isinstance(items, list) and len(items) <= 2048
            assert all(isinstance(item, str) for item in items)
            counts["requests"] += 1
            counts["inputs"] += len(items)
            result = {"data": [{"index": i, "embedding": [1] + [0] * 1023} for i in range(len(items))],
                      "usage": {"prompt_tokens": len(items), "total_tokens": len(items)}}
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        except Exception:
            self.send_error(400)

ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
