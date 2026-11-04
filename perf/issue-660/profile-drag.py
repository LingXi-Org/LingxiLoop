"""Diagnostic only: profile every streaming drag, with/without geometry sampling.
python perf/issue-660/profile-drag.py <port> <trials> <out-dir>
Profiling/trace overhead prevents treating these as acceptance timings.
"""
import gzip,json,math,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
port=int(sys.argv[1]);runs=int(sys.argv[2]);out=Path(sys.argv[3]);out.mkdir(parents=True,exist_ok=True)
INIT='''window.active=false;window.tasks=[];window.frames=[];window.loafs=[];
new PerformanceObserver(l=>{if(window.active)tasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))}).observe({type:'longtask',buffered:true});
if(PerformanceObserver.supportedEntryTypes.includes('long-animation-frame'))new PerformanceObserver(l=>{if(window.active)loafs.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration,renderStart:e.renderStart,styleAndLayoutStart:e.styleAndLayoutStart,scripts:e.scripts.map(s=>({invoker:s.invoker,sourceURL:s.sourceURL,sourceFunctionName:s.sourceFunctionName,duration:s.duration,forcedStyleAndLayoutDuration:s.forcedStyleAndLayoutDuration}))})))}).observe({type:'long-animation-frame',buffered:true});
let last;function sample(t){if(active){if(last)frames.push(t-last);if(window.geometry)document.querySelector('[data-slot="sidebar-container"]').getBoundingClientRect();last=t}else last=null;requestAnimationFrame(sample)}requestAnimationFrame(sample);'''
rows=[]
with sync_playwright()as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for trial in range(runs):
  for geometry in ([True,False]if trial%2==0 else[False,True]):
   c=b.new_context(viewport={'width':1440,'height':1000});c.add_init_script(INIT);p=c.new_page();p.goto(f'http://127.0.0.1:{port}/?side=right&stream=1');h=p.get_by_role('button',name='调整侧栏',exact=True);h.wait_for();p.wait_for_timeout(300)
   box=h.bounding_box();x=box['x']+box['width']/2;y=100
   d=c.new_cdp_session(p);d.send('Profiler.enable');d.send('Profiler.setSamplingInterval',{'interval':1000});d.send('Profiler.start');d.send('Tracing.start',{'categories':'devtools.timeline,toplevel,blink.user_timing,v8,disabled-by-default-v8.gc','transferMode':'ReturnAsStream'})
   p.evaluate('(geometry)=>{window.geometry=geometry;active=true}',geometry);p.mouse.move(x,y);p.mouse.down()
   for i in range(120):p.mouse.move(x+180*math.sin(i/119*math.pi*4)+30*i/119,y);p.wait_for_timeout(8)
   p.mouse.up();p.wait_for_timeout(40);values=p.evaluate('active=false;({tasks,frames,loafs})');profile=d.send('Profiler.stop')['profile']
   event={};d.on('Tracing.tracingComplete',lambda e:event.update(e));d.send('Tracing.end')
   while not event:p.wait_for_timeout(10)
   chunks=[]
   while True:
    data=d.send('IO.read',{'handle':event['stream']});chunks.append(data['data'])
    if data.get('eof'):break
   d.send('IO.close',{'handle':event['stream']});trace=json.loads(''.join(chunks))['traceEvents']
   main_threads={(e['pid'],e['tid'])for e in trace if e.get('ph')=='M'and e.get('name')=='thread_name'and e.get('args',{}).get('name')=='CrRendererMain'}
   tasks=[e for e in trace if (e['pid'],e['tid'])in main_threads and e.get('ph')=='X'and e.get('name','').endswith('RunTask')and e.get('dur',0)>=50000]
   summaries=[]
   for task in tasks:
    nested=[e for e in trace if e.get('ph')=='X'and e.get('pid')==task['pid']and e.get('tid')==task['tid']and e['ts']>=task['ts']and e['ts']<task['ts']+task['dur']]
    costs={name:round(sum(e.get('dur',0)for e in nested if e['name']==name)/1000,2)for name in ['Layout','UpdateLayoutTree','Paint','FunctionCall','FireAnimationFrame','V8.GCScavenger','V8.GCCompactor','MajorGC','MinorGC']}
    summaries.append({'at':task['ts'],'ms':task['dur']/1000,'costs':costs,'calls':[e.get('args',{})for e in nested if e['name']=='FunctionCall']})
   label=f'{trial}-'+('geometry'if geometry else'frames-only')
   row={'trial':trial,'geometry':geometry,'observer':values,'longTraceTasks':summaries,'browser':b.version,'scope':'Diagnostic profiling overhead; same authored iframe/static history/stream-counter fixture as Phase 1. Not real Agent or editor and not acceptance.'}
   for name,data in [('trace',{'traceEvents':trace}),('profile',profile),('report',row)]:
    with gzip.open(out/f'{label}-{name}.json.gz','wt')as f:json.dump(data,f)
   rows.append(row);print(json.dumps({'trial':trial,'geometry':geometry,'observerTasks':values['tasks'],'longTraceTasks':summaries}),flush=True);c.close()
 b.close()
(out/'summary.json').write_text(json.dumps(rows,indent=2))
