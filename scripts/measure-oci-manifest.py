#!/usr/bin/env python3
"""Compare immutable OCI images using registry metadata, without pulling layers."""

import argparse
import hashlib
import json
import subprocess
import sys
import urllib.parse
import urllib.request
import zlib


def inspect(reference, *options):
    return subprocess.check_output(
        ["docker", "buildx", "imagetools", "inspect", *options, reference]
    )


def raw_by_digest(repository, digest):
    content = inspect(f"{repository}@{digest}", "--raw")
    actual = "sha256:" + hashlib.sha256(content).hexdigest()
    if actual != digest:
        raise ValueError(f"registry content digest mismatch: {digest} != {actual}")
    return json.loads(content)


def measure(reference):
    repository, separator, digest = reference.rpartition("@")
    if not separator or not digest.startswith("sha256:"):
        raise ValueError("image reference must use an immutable @sha256: digest")
    index = raw_by_digest(repository, digest)
    if index.get("mediaType") != "application/vnd.oci.image.index.v1+json":
        raise ValueError("expected an OCI index")
    platforms = [item for item in index["manifests"] if item.get("platform") == {
        "architecture": "amd64", "os": "linux"
    }]
    if len(platforms) != 1:
        raise ValueError(f"expected one linux/amd64 manifest, got {len(platforms)}")
    selected = platforms[0]
    manifest = raw_by_digest(repository, selected["digest"])
    if manifest.get("mediaType") != "application/vnd.oci.image.manifest.v1+json":
        raise ValueError("expected an OCI image manifest")
    layers = manifest["layers"]
    if any(layer["mediaType"] != "application/vnd.oci.image.layer.v1.tar+gzip" for layer in layers):
        raise ValueError("unexpected layer compression; cannot sum as gzip bytes")
    image = json.loads(inspect(f"{repository}@{selected['digest']}",
                               "--format", "{{json .Image}}"))
    commits = [value.split("=", 1)[1] for value in image["config"]["Env"]
               if value.startswith("LINGXILOOP_COMMIT_SHA=")]
    if len(commits) != 1:
        raise ValueError("missing or ambiguous image source commit")
    return {
        "indexDigest": digest,
        "linuxAmd64ManifestDigest": selected["digest"],
        "sourceCommit": commits[0],
        "layerCount": len(layers),
        "compressedLayerBytes": sum(layer["size"] for layer in layers),
        "configBytes": manifest["config"]["size"],
        "manifestBytes": selected["size"],
        "indexBytes": len(inspect(reference, "--raw")),
        "attestationManifestDescriptors": sum(1 for item in index["manifests"]
                                               if item.get("platform", {}).get("os") == "unknown"),
        "layers": [{"digest": layer["digest"], "compressedBytes": layer["size"]}
                   for layer in layers],
    }


def ghcr_token(repository):
    if not repository.startswith("ghcr.io/"):
        raise ValueError("streamed layer measurement currently supports ghcr.io only")
    name = repository.removeprefix("ghcr.io/")
    query = urllib.parse.urlencode({
        "scope": f"repository:{name}:pull", "service": "ghcr.io"
    })
    with urllib.request.urlopen(f"https://ghcr.io/token?{query}", timeout=30) as response:
        token = json.load(response).get("token")
    if not token:
        raise ValueError("GHCR did not return an anonymous pull token")
    return token, name


def count_uncompressed(repository, layers):
    token, name = ghcr_token(repository)
    sizes = {}
    for layer in layers:
        digest = layer["digest"]
        if digest in sizes:
            continue
        request = urllib.request.Request(
            f"https://ghcr.io/v2/{name}/blobs/{digest}",
            headers={"Authorization": f"Bearer {token}"},
        )
        checksum = hashlib.sha256()
        inflater = zlib.decompressobj(wbits=31)
        compressed = uncompressed = 0
        with urllib.request.urlopen(request, timeout=120) as response:
            while chunk := response.read(1024 * 1024):
                compressed += len(chunk)
                checksum.update(chunk)
                uncompressed += len(inflater.decompress(chunk))
        uncompressed += len(inflater.flush())
        if "sha256:" + checksum.hexdigest() != digest:
            raise ValueError(f"compressed blob digest mismatch: {digest}")
        if compressed != layer["compressedBytes"] or not inflater.eof:
            raise ValueError(f"blob length or gzip stream mismatch: {digest}")
        sizes[digest] = uncompressed
        print(f"Verified {digest[:19]}: {compressed} gzip / {uncompressed} tar bytes",
              file=sys.stderr)
    return sizes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", help="immutable OCI index reference")
    parser.add_argument("after", help="immutable OCI index reference")
    parser.add_argument("--stream-uncompressed", action="store_true",
                        help="stream and digest-check GHCR gzip layers; never store or extract them")
    args = parser.parse_args()
    before, after = measure(args.before), measure(args.after)
    common = {layer["digest"] for layer in before["layers"]} & {
        layer["digest"] for layer in after["layers"]
    }
    if args.stream_uncompressed:
        before_repo = args.before.rpartition("@")[0]
        after_repo = args.after.rpartition("@")[0]
        if before_repo != after_repo:
            raise ValueError("streamed layer comparison requires one GHCR repository")
        unique = {layer["digest"]: layer for layer in before["layers"] + after["layers"]}
        sizes = count_uncompressed(before_repo, unique.values())
        for image in (before, after):
            for layer in image["layers"]:
                layer["uncompressedTarBytes"] = sizes[layer["digest"]]
            image["uncompressedTarLayerBytes"] = sum(layer["uncompressedTarBytes"]
                                                      for layer in image["layers"])
    report = {
        "scope": ("registry OCI metadata plus streamed, digest-verified gzip layer expansion "
                  "for linux/amd64; layers never stored or extracted"
                  if args.stream_uncompressed else
                  "registry OCI metadata for linux/amd64; no layers downloaded or extracted"),
        "before": before,
        "after": after,
        "comparison": {
            "compressedLayerByteDelta": after["compressedLayerBytes"] - before["compressedLayerBytes"],
            "sharedLayerCount": len(common),
            "sharedCompressedLayerBytes": sum(layer["compressedBytes"] for layer in before["layers"]
                                              if layer["digest"] in common),
        },
    }
    if args.stream_uncompressed:
        report["comparison"]["uncompressedTarLayerByteDelta"] = (
            after["uncompressedTarLayerBytes"] - before["uncompressedTarLayerBytes"]
        )
    print(json.dumps(report, indent=2) + "\n", end="")


if __name__ == "__main__":
    main()
