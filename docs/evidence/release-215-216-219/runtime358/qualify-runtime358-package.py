import base64
import hashlib
import json
import pathlib
import tarfile

root = pathlib.Path("/tmp/lingxi-225-219-preparation")
registry = json.loads((root / "runtime358-registry-published.json").read_text())
published = root / "runtime358-formal/lyyzka-lingxios-3.5.8.tgz"
candidate = root / "runtime358-candidate/lyyzka-lingxios-3.5.8.tgz"
assert registry["version"] == "3.5.8"
data = published.read_bytes()
integrity = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()
assert integrity == registry["dist"]["integrity"]
assert hashlib.sha1(data).hexdigest() == registry["dist"]["shasum"]


def inventory(path):
    with tarfile.open(path) as archive:
        return {
            member.name: hashlib.sha256(archive.extractfile(member).read()).hexdigest()
            for member in archive.getmembers()
            if member.isfile()
        }


before = inventory(candidate)
after = inventory(published)
assert set(before) == set(after), "Published package file set differs from qualified source package"
differences = [name for name in before if before[name] != after[name]]
assert not differences, differences
proof = {
    "version": registry["version"],
    "formalSource": "35ac1208fcf2bd6cb1852f474175e9eb7e2083ec",
    "releaseCI": 39400184326,
    "publishCI": 39401752197,
    "registryIntegrity": integrity,
    "tarballSha256": hashlib.sha256(data).hexdigest(),
    "fileCount": len(after),
    "compiledSchemaAndKernelFilesMatchQualifiedCandidate": True,
    "allPackageFilesMatchQualifiedCandidate": True,
    "files": after,
}
(root / "runtime358-formal-package-proof.json").write_text(json.dumps(proof, indent=2) + "\n")
print(json.dumps({k: v for k, v in proof.items() if k != "files"}, indent=2))
