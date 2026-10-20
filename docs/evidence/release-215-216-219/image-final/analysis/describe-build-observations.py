#!/usr/bin/env python3
"""Summarize one CI build's recorded observations without inferring cold/warm/peak."""
import datetime,hashlib,json,re,sys
from pathlib import Path
runpath,publishlogpath,serverlogpath,output=map(Path,sys.argv[1:5])
run=json.loads(runpath.read_text());buildlog=publishlogpath.read_text();serverlog=serverlogpath.read_text()
assert run['status']=='completed' and run['conclusion']=='success'
publish=[j for j in run['jobs'] if j['name'].startswith('publish') and j['conclusion']=='success']
assert len(publish)==1
job=publish[0]
jobproof=Path(sys.argv[5]) if len(sys.argv)>5 else None
if jobproof:
 detailed=json.loads(jobproof.read_text())
 assert detailed['id']==job['databaseId'] and detailed['conclusion']=='success' and detailed['head_sha']==run['headSha']
 step_records=[{'name':s['name'],'conclusion':s['conclusion'],'startedAt':s.get('started_at'),'completedAt':s.get('completed_at')} for s in detailed['steps']]
else:
 step_records=job['steps']
def elapsed(start,end):
 return (datetime.datetime.fromisoformat(end.replace('Z','+00:00'))-datetime.datetime.fromisoformat(start.replace('Z','+00:00'))).total_seconds()
steps=[{'name':s['name'],'conclusion':s['conclusion'],'seconds':elapsed(s['startedAt'],s['completedAt'])} for s in step_records if s.get('conclusion')=='success' and s.get('startedAt') and s.get('completedAt')]
log_access=Path(sys.argv[6]) if len(sys.argv)>6 else None
if buildlog.strip():
 assert run['headSha'] in buildlog and re.search(r'#\d+\s+',buildlog), 'unqualified publication log'
 cached=sorted(set(re.findall(r'#(\d+)\s+CACHED\b',buildlog)),key=int)
 log_status='available'
else:
 assert log_access is not None, 'empty publication log cannot establish cache observations'
 access=json.loads(log_access.read_text())
 assert access['status']=='denied' and access['jobId']==job['databaseId'] and access['sourceCommit']==run['headSha']
 cached=None
 log_status='denied; raw log unavailable; cache reuse unverified'
footprints=[int(n) for n in re.findall(r'Z\s+(\d+)\s+node_modules\s*$',serverlog,re.M)]
assert len(footprints)==1
result={'sourceCommit':run['headSha'],'workflowUrl':run['url'],'event':run['event'],'publishJobName':job['name'],'publishJobSeconds':elapsed(job['startedAt'],job['completedAt']),'successfulStepSeconds':steps,'buildKitCachedStepIdsObserved':cached,'buildKitCachedStepCountObserved':len(cached) if cached is not None else None,'rawPublicationLogStatus':log_status,'cachePolicy':'workflow configures GitHub Actions cache-from/cache-to; cache reuse is not verified without raw publication log; not a controlled cold or warm benchmark','rootCiNodeModulesDuSbBytes':footprints[0],'footprintScope':'single root CI install du -sb observation, including development dependencies; not final production deps and not peak filesystem usage','controlledColdBuild':'not-measured','controlledWarmBuild':'not-measured','peakDisk':'not-measured','localImagePull':'not-performed','inputSha256':{str(p.name):hashlib.sha256(p.read_bytes()).hexdigest() for p in (runpath,publishlogpath,serverlogpath,*([jobproof] if jobproof else []),*([log_access] if log_access else []))},'analysisScriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
with output.open('x') as f:json.dump(result,f,indent=2);f.write('\n')
print(json.dumps({'publishJobSeconds':result['publishJobSeconds'],'cachedStepsObserved':len(cached) if cached is not None else None,'rootCiNodeModulesDuSbBytes':footprints[0]}))
