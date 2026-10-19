"""Measure removed package payloads without installing or executing them.

Run from the repository root: python docs/evidence/issue-201/measure-dependencies.py
Public registry archives must match the baseline lockfile integrity. Tar members
are inspected in memory, never extracted. Payload bytes exclude filesystem
metadata and are not a claim about compressed final Docker image size.
"""
import base64
import hashlib
import io
import json
import subprocess
import tarfile
import urllib.request

BASE = "088e269f36f63884b44704c3b0f1e27f1a6f76fc"
reports = []
for manifest in ["package-lock.json", "server/package-lock.json"]:
    before = json.loads(subprocess.check_output(["git", "show", f"{BASE}:{manifest}"]))["packages"]
    with open(manifest) as file:
        after = json.load(file)["packages"]
    added = sorted(after.keys() - before.keys())
    changed = [key for key in before.keys() & after.keys()
               if any(before[key].get(field) != after[key].get(field)
                      for field in ["version", "resolved", "integrity"])]
    assert not added and not changed, (added, changed)
    removed = []
    for key in sorted(before.keys() - after.keys()):
        package = before[key]
        name = key.removeprefix("node_modules/")
        url = f"https://registry.npmjs.org/{name}/-/{name.split('/')[-1]}-{package['version']}.tgz"
        with urllib.request.urlopen(url, timeout=30) as response:
            archive = response.read()
        integrity = "sha512-" + base64.b64encode(hashlib.sha512(archive).digest()).decode()
        assert integrity == package["integrity"], name
        with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
            files = [member for member in tar.getmembers() if member.isfile()]
        removed.append(dict(name=name, version=package["version"], url=url,
                            integrityVerified=True, compressedBytes=len(archive),
                            payloadBytes=sum(member.size for member in files), files=len(files)))
    reports.append(dict(lockfile=manifest, beforeEntries=len(before), afterEntries=len(after),
                        survivingIdentityChanges=changed, addedEntries=added, removed=removed))
print(json.dumps(dict(base=BASE, lockfiles=reports), indent=2))
