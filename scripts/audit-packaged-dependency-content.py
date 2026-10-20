#!/usr/bin/env python3
"""Count path-based cleanup candidates in an installed production npm tree."""

import collections
import json
import os
import sys

root = sys.argv[1]
categories = {key: {"files": 0, "bytes": 0} for key in
              ("test_dirs", "examples_dirs", "markdown", "source_maps")}
owners = collections.Counter()
for directory, _, names in os.walk(root):
    for name in names:
        path = os.path.join(directory, name)
        if os.path.islink(path):
            continue
        size = os.path.getsize(path)
        parts = os.path.relpath(path, root).split("/")
        matches = []
        if any(part in ("test", "tests", "__tests__", "fixtures") for part in parts[:-1]):
            matches.append("test_dirs")
        if any(part in ("example", "examples", "docs") for part in parts[:-1]):
            matches.append("examples_dirs")
        if name.lower().endswith((".md", ".markdown")):
            matches.append("markdown")
        if name.endswith(".map"):
            matches.append("source_maps")
        for key in matches:
            categories[key]["files"] += 1
            categories[key]["bytes"] += size
        if matches:
            owner = "/".join(parts[:2]) if parts[0].startswith("@") else parts[0]
            owners[owner] += size
print(json.dumps({"root": root, "overlappingCategories": categories,
                  "largestCandidatePackageBytes": owners.most_common(12)}, indent=2))
