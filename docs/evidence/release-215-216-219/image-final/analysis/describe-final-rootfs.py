#!/usr/bin/env python3
"""Derive bounded path-category observations from an already verified inventory."""
import hashlib,json,sys
from pathlib import Path
inventory=Path(sys.argv[1]);receipt=Path(sys.argv[2]);output=Path(sys.argv[3])
entries=json.loads(inventory.read_text());verified=json.loads(receipt.read_text())
assert verified['passed'] is True
assert hashlib.sha256(inventory.read_bytes()).hexdigest()==verified['inventorySha256']
regular={p:e for p,e in entries.items() if e['kind']=='file'}
def summarize(paths):
 paths=sorted(paths)
 return {'files':len(paths),'regularFileBytes':sum(regular[p]['bytes'] for p in paths)}
regions={prefix:summarize(p for p in regular if p.startswith(prefix)) for prefix in ('app/server/','app/src/','app/third_party/zcode/','app/dist/','app/node_modules/')}
assert regions['app/node_modules/']['files']==verified['rootfs']['deps']['files']
assert regions['app/node_modules/']['regularFileBytes']==verified['rootfs']['deps']['regularBytes']
assert sum(e['bytes'] for e in regular.values())==verified['rootfs']['regularFileBytes']
deps=[p for p in regular if p.startswith('app/node_modules/')]
testdirs={'test','tests','__tests__','fixture','fixtures','__fixtures__'}
docdirs={'doc','docs','example','examples'}
categories={
 'sourceMaps':summarize(p for p in deps if p.endswith('.map')),
 'testOrFixtureDirectories':summarize(p for p in deps if testdirs.intersection(p.split('/')[2:-1])),
 'docOrExampleDirectories':summarize(p for p in deps if docdirs.intersection(p.split('/')[2:-1])),
 'markdown':summarize(p for p in deps if p.lower().endswith(('.md','.markdown'))),
}
owned=[p for p in regular if p.startswith(('app/server/','app/src/','app/third_party/zcode/','app/dist/'))]
owned_candidates=sorted(p for p in owned if (testdirs|{'__integration__','screenshots','recordings'}).intersection(p.split('/')[1:-1]) or p.endswith(('.test.ts','.test.tsx','.spec.ts','.spec.tsx')))
result={'sourceCommit':verified['sourceCommit'],'indexDigest':verified['indexDigest'],'inputInventorySha256':verified['inventorySha256'],'analysisScriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'scope':'regular-file path/extension classification only; no content or credentials read beyond verified metadata','regions':regions,'dependencyCategories':categories,'categoryOverlap':True,'categoriesAreDeletionProof':False,'productOwnedCandidatePaths':owned_candidates,'productOwnedCandidateScanExhaustive':False,'hardlinks':'excluded from regular-file categories; logical bytes are reported separately in the verified receipt','largestFiles':verified['rootfs']['largestFiles'],'largestPackages':verified['rootfs']['largestPackages'],'remainingProofNeeded':['package-specific dynamic import/resource usage before further removal','licenses and diagnostic/source-map requirements','controlled same-cache-policy cold/warm builds and measured peak disk','configured exact-image readiness/isolation and production short observation']}
with output.open('x') as f: json.dump(result,f,indent=2);f.write('\n')
print(json.dumps({'verifiedSourceCommit':result['sourceCommit'],'regularFiles':len(regular),'productOwnedCandidates':len(owned_candidates)}))
