#!/usr/bin/env python3
"""Compare full file inventories of two immutable GHCR gzip layers in memory."""

import argparse
import hashlib
import json
import tarfile
import urllib.parse
import urllib.request


class HashingReader:
    def __init__(self, response):
        self.response = response
        self.hash = hashlib.sha256()
        self.bytes = 0

    def read(self, size=-1):
        content = self.response.read(size)
        self.hash.update(content)
        self.bytes += len(content)
        return content


def inventory(name, token, digest):
    request = urllib.request.Request(
        f"https://ghcr.io/v2/{name}/blobs/{digest}",
        headers={"Authorization": f"Bearer {token}"},
    )
    entries = {}
    with urllib.request.urlopen(request, timeout=120) as response:
        reader = HashingReader(response)
        with tarfile.open(fileobj=reader, mode="r|gz") as archive:
            for member in archive:
                if member.isfile():
                    checksum = hashlib.sha256()
                    source = archive.extractfile(member)
                    while chunk := source.read(1024 * 1024):
                        checksum.update(chunk)
                    entry = {"kind": "file", "bytes": member.size,
                             "sha256": checksum.hexdigest()}
                elif member.isdir():
                    entry = {"kind": "directory"}
                elif member.issym() or member.islnk():
                    entry = {"kind": "symlink" if member.issym() else "hardlink",
                             "target": member.linkname}
                else:
                    entry = {"kind": "other", "type": member.type.decode("ascii")}
                entries[member.name] = entry
        while reader.read(1024 * 1024):
            pass
    if "sha256:" + reader.hash.hexdigest() != digest:
        raise ValueError(f"compressed blob digest mismatch: {digest}")
    encoded = "".join(f"{path}\0{json.dumps(entries[path], sort_keys=True)}\n"
                      for path in sorted(entries)).encode()
    kinds = {kind: sum(entry["kind"] == kind for entry in entries.values())
             for kind in ("file", "directory", "symlink", "hardlink", "other")}
    return {"layerDigest": digest, "compressedBytes": reader.bytes,
            "entries": len(entries), "kinds": kinds,
            "regularContentBytes": sum(entry.get("bytes", 0) for entry in entries.values()),
            "inventorySha256": hashlib.sha256(encoded).hexdigest()}, entries


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repository", help="ghcr.io/owner/image")
    parser.add_argument("before", help="immutable gzip layer digest")
    parser.add_argument("after", help="immutable gzip layer digest")
    args = parser.parse_args()
    if not args.repository.startswith("ghcr.io/"):
        raise ValueError("only ghcr.io is supported")
    name = args.repository.removeprefix("ghcr.io/")
    query = urllib.parse.urlencode({"scope": f"repository:{name}:pull", "service": "ghcr.io"})
    with urllib.request.urlopen(f"https://ghcr.io/token?{query}", timeout=30) as response:
        token = json.load(response)["token"]
    before, old = inventory(name, token, args.before)
    after, new = inventory(name, token, args.after)
    changed = [path for path in sorted(old.keys() | new.keys()) if old.get(path) != new.get(path)]
    print(json.dumps({"repository": args.repository,
                      "scope": "complete per-entry tar inventories; compressed blobs streamed and digest-verified, never stored or extracted",
                      "before": before, "after": after, "changedPaths": changed}, indent=2))


if __name__ == "__main__":
    main()
