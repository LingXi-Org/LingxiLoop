#!/usr/bin/env python3
"""Find PDF.js references in the exact packaged server and installed code tree."""

import json
import os

roots = ("/app/server", "/app/src", "/app/node_modules")
extensions = (".js", ".mjs", ".cjs", ".json", ".ts", ".tsx")
found = []
scanned = 0
for root in roots:
    for directory, dirs, names in os.walk(root):
        if directory == "/app/node_modules":
            dirs[:] = [name for name in dirs if name != "pdfjs-dist"]
        for name in names:
            if not name.endswith(extensions) or name.endswith(".map"):
                continue
            path = os.path.join(directory, name)
            if os.path.islink(path):
                continue
            scanned += 1
            with open(path, "rb") as source:
                content = source.read()
            hits = content.count(b"pdfjs-dist")
            if hits:
                found.append({"path": path, "hits": hits})
print(json.dumps({"roots": roots, "scannedCodeAndJsonFiles": scanned,
                  "referencers": found}, indent=2))
