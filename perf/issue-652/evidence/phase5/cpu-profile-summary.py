import gzip,json,collections
from pathlib import Path
for kind in ['design','slides']:
 path=Path('.codex-tmp/issue-652/phase5')/(kind+'-profile');r=json.loads(gzip.decompress((path/'profile.json.gz').read_bytes()));byurl=collections.Counter();functions=collections.Counter();inclusive=collections.Counter()
 for route,p in r['profiles'].items():
  p=p.get('profile',{});nodes={n['id']:n for n in p.get('nodes',[])};parents={child:n['id']for n in nodes.values()for child in n.get('children',[])}
  for ident,delta in zip(p.get('samples',[]),p.get('timeDeltas',[])):
   n=nodes[ident];cf=n['callFrame'];url=cf['url'];name=cf['functionName'];functions[(url,name,cf['lineNumber'],cf['columnNumber'])]+=delta/1000
   byurl[url or name]+=delta/1000
   visited=set()
   while ident in nodes and ident not in visited:
    visited.add(ident);cf=nodes[ident]['callFrame'];inclusive[(cf['url'],cf['functionName'],cf['lineNumber'],cf['columnNumber'])]+=delta/1000;ident=parents.get(ident)
 t=json.loads(gzip.decompress((path/'trace.json.gz').read_bytes()));events=collections.Counter();counts=collections.Counter();compileDetails=[]
 for e in t['traceEvents']:
  if e.get('dur')and e.get('ph')=='X':events[e['name']]+=e['dur']/1000;counts[e['name']]+=1
  if e.get('dur',0)>10000 and any(s in e['name'].lower()for s in ['compile','parse','evaluatescript']):compileDetails.append({'name':e['name'],'ms':e['dur']/1000,'pid':e['pid'],'args':e.get('args')})
 summary={'scope':r['scope'],'selfCpuByUrl':byurl.most_common(15),'selfCpuFunctions':[{'key':k,'ms':v}for k,v in functions.most_common(20)],'inclusiveCpuFunctions':[{'key':k,'ms':v}for k,v in inclusive.most_common(20)],'timelineInclusiveByName':[(n,ms,counts[n])for n,ms in events.most_common(30)],'longCompileEvents':compileDetails}
 (path/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(kind,json.dumps(summary,ensure_ascii=False)[:12000])
