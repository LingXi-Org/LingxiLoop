#!/usr/bin/env python3
"""Explicit parent-run source metadata read only; never downloads image layers."""
import importlib.util,json,hashlib,re,datetime,os
from pathlib import Path
AUDITOR=Path('/workspace/LingxiLoop-release-229/docs/evidence/release-215-216-219/image-final/auditor/audit.py')
SOURCE='cf4a299bcfb44d7e7ed74a250ea1404588a4e901'
INDEX='sha256:cfcf92c9db9cd0c446eb4400f2a9b4267a3a3c0a716427d2e1b9edac9e9e465e'
OUT=Path('/workspace/geometry-release/source/oci-metadata.json')
def main():
    assert not OUT.exists(),'Exclusive output already exists'
    spec=importlib.util.spec_from_file_location('reviewed_oci_auditor',AUDITOR);a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
    registry=a.Registry()
    index,ib=a.metadata(registry,'manifests',INDEX);a.require(index.get('mediaType') in a.INDEX,'index_type')
    selected=[x for x in index['manifests'] if x.get('platform',{}).get('os')=='linux' and x.get('platform',{}).get('architecture')=='amd64' and x.get('platform',{}).get('variant') in (None,'')]
    a.require(len(selected)==1,'unique_platform');m=selected[0]
    manifest,mb=a.metadata(registry,'manifests',m['digest'],m['size']);a.require(manifest.get('mediaType') in a.MANIFEST,'manifest_type')
    c=manifest['config'];config,cb=a.metadata(registry,'blobs',c['digest'],c['size'])
    a.require(config.get('os')=='linux' and config.get('architecture')=='amd64','config_platform')
    a.require([v.split('=',1)[1] for v in config.get('config',{}).get('Env',[]) if isinstance(v,str) and v.startswith('LINGXILOOP_COMMIT_SHA=')]==[SOURCE],'source_commit')
    a.require((config.get('config',{}).get('Labels') or {}).get('org.opencontainers.image.revision') in (None,SOURCE),'source_label')
    diffs=config.get('rootfs',{}).get('diff_ids');layers=manifest.get('layers')
    a.require(config.get('rootfs',{}).get('type')=='layers' and len(diffs)==len(layers)==22,'rootfs_inventory')
    a.require(all(a.DIGEST.fullmatch(x) for x in diffs) and all(a.DIGEST.fullmatch(x.get('digest','')) for x in layers),'digest_format')
    out={'format':'source-oci-metadata/v1','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verified':True,'sourceCommit':SOURCE,'repository':a.REPOSITORY,'indexDigest':INDEX,'linuxAmd64ManifestDigest':m['digest'],'configDigest':c['digest'],'indexBytes':ib,'manifestBytes':mb,'configBytes':cb,'os':'linux','architecture':'amd64','layers':[{'digest':l['digest'],'compressedBytes':l['size'],'diffId':d} for l,d in zip(layers,diffs)],'layerBodiesDownloaded':False,'fullLayerAudit':False,'auditorPath':str(AUDITOR),'auditorSha256':hashlib.sha256(AUDITOR.read_bytes()).hexdigest(),'scope':'Digest-verified index/platform manifest/config only. Does not recreate the lost full22-layer audit.'}
    with OUT.open('x') as f:json.dump(out,f,indent=2);f.write('\n')
    print(json.dumps({'verified':True,'output':str(OUT),'metadataBytes':ib+mb+cb,'layerBodiesDownloaded':False}))
if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit('Source metadata qualification failed; no successful metadata receipt written.')
