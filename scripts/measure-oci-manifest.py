#!/usr/bin/env python3
"""Compare immutable OCI images using registry metadata, without pulling layers."""

import argparse
import hashlib
import json
import subprocess


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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", help="immutable OCI index reference")
    parser.add_argument("after", help="immutable OCI index reference")
    args = parser.parse_args()
    before, after = measure(args.before), measure(args.after)
    common = {layer["digest"] for layer in before["layers"]} & {
        layer["digest"] for layer in after["layers"]
    }
    report = {
        "scope": "registry OCI metadata for linux/amd64; no layers downloaded or extracted",
        "before": before,
        "after": after,
        "comparison": {
            "compressedLayerByteDelta": after["compressedLayerBytes"] - before["compressedLayerBytes"],
            "sharedLayerCount": len(common),
            "sharedCompressedLayerBytes": sum(layer["compressedBytes"] for layer in before["layers"]
                                              if layer["digest"] in common),
        },
    }
    print(json.dumps(report, indent=2) + "\n", end="")


if __name__ == "__main__":
    main()
