"""Actual pointer drags of the shared production primitives, synthetic contents.
python perf/issue-660/drag.py <out-dir> <pairs> baseline=4461 [candidate=4462]
"""
import gzip, json, math, platform, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
runs=int(sys.argv[2]);arms=[x.split('=') for x in sys.argv[3:]]
def q(values,p):
    values=sorted(values)
    if not values:return None
    n=(len(values)-1)*p;lo=math.floor(n);hi=math.ceil(n)
    return round(values[lo]+(values[hi]-values[lo])*(n-lo),2)
INIT='''window.samples=[];window.longTasks=[];window.active=false;window.target=null;
new PerformanceObserver(l=>{for(const e of l.getEntries())if(window.active)longTasks.push({start:e.startTime,duration:e.duration})}).observe({type:'longtask',buffered:true});
let previous;function sample(t){if(window.active){if(previous)samples.push({dt:t-previous,width:document.querySelector('[data-slot="sidebar-container"], [data-panel][id="conversations"]').getBoundingClientRect().width,target:window.target});previous=t}else previous=null;requestAnimationFrame(sample)}requestAnimationFrame(sample);
addEventListener('pointermove', e=>{if(window.active){window.target=Math.min(window.maxWidth,Math.max(window.minWidth,window.startWidth+(e.clientX-window.startX)*window.direction))}},true);'''
results=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for trial in range(runs):
      for arm,port in arms if trial%2==0 else list(reversed(arms)):
       for case in ['right','left','native','right-stream']:
        context=browser.new_context(viewport={'width':1440,'height':1000},record_video_dir=str(out/'video') if trial==0 else None)
        context.add_init_script(INIT);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{port}/?'+('native=1' if case=='native' else 'side='+case.split('-')[0])+('&stream=1' if 'stream' in case else ''))
        handle=page.get_by_role('separator') if case=='native' else page.get_by_role('button',name='调整侧栏',exact=True)
        handle.wait_for();page.wait_for_timeout(500)
        page.locator('textarea').fill('Unsent scoped draft')
        page.evaluate('window.retained=document.querySelector("iframe")')
        box=handle.bounding_box();x=box['x']+box['width']/2;y=box['y']+100
        width=page.locator('[data-panel][id="conversations"]' if case=='native' else '[data-slot="sidebar-container"]').bounding_box()['width']
        page.evaluate('''([x,width,dir,min,max])=>{reset();samples=[];longTasks=[];startX=x;startWidth=width;direction=dir;minWidth=min;maxWidth=max;active=true}''',[x,width,1 if case in ['left','native'] else -1,260 if case in ['left','native'] else 504,360 if case in ['left','native'] else 936])
        cdp=context.new_cdp_session(page);cdp.send('Performance.enable');before=cdp.send('Performance.getMetrics')
        trace=[];done=[]
        cdp.on('Tracing.dataCollected',lambda e:trace.extend(e['value']))
        cdp.on('Tracing.tracingComplete',lambda e:done.append(True))
        if trial==0:cdp.send('Tracing.start',{'categories':'devtools.timeline,toplevel,blink.user_timing,v8.execute','options':'record-as-much-as-possible'})
        page.mouse.move(x,y);page.mouse.down()
        for i in range(120):
          dx=(45 if case in ['left','native'] else 180)*math.sin(i/119*math.pi*4)+30*i/119
          page.mouse.move(x+dx,y);page.wait_for_timeout(8)
        page.mouse.up();page.wait_for_timeout(40)
        values=page.evaluate('active=false;({samples,longTasks,counts:measurements,retained:retained===document.querySelector("iframe"),draft:document.querySelector("textarea").value})')
        after=cdp.send('Performance.getMetrics')
        if trial==0:
          cdp.send('Tracing.end')
          while not done:page.wait_for_timeout(20)
          with gzip.open(out/f'{arm}-{case}-trace.json.gz','wt') as f:json.dump({'traceEvents':trace},f)
          page.screenshot(path=str(out/f'{arm}-{case}.png'))
        intervals=[s['dt'] for s in values['samples']];lags=[abs(s['width']-s['target']) for s in values['samples'] if s['target'] is not None]
        metrics=lambda r:{x['name']:x['value'] for x in r['metrics']}
        delta={key:round((metrics(after)[key]-metrics(before)[key])*1000,2) for key in ['LayoutDuration','RecalcStyleDuration','ScriptDuration','TaskDuration']}
        row={'trial':trial,'arm':arm,'case':case,'frameP95':q(intervals,.95),'overBudget60Hz':sum(x>1000/60 for x in intervals)/len(intervals),'over100ms':sum(x>100 for x in intervals),'over33ms':sum(x>33.34 for x in intervals)/len(intervals),'lagP95px':q(lags,.95),'longTasks':values['longTasks'],'counts':values['counts'],'costMs':delta,'traceCostMs':{name:round(sum(e.get('dur',0) for e in trace if e.get('ph')=='X' and e.get('name')==name)/1000,2) for name in ['Layout','UpdateLayoutTree','Paint'] } if trial==0 else None,'retained':values['retained'],'draft':values['draft'],'errors':errors,'samples':values['samples']}
        results.append(row);print(json.dumps({k:v for k,v in row.items() if k not in ['samples','longTasks']}),flush=True)
        assert values['draft']=='Unsent scoped draft' and values['retained'] and not errors,row
        video=page.video
        context.close()
        if trial==0:Path(video.path()).rename(out/f'{arm}-{case}.webm')
    version=browser.version;browser.close()
(out/'results.json').write_text(json.dumps({'browser':version,'system':platform.platform(),'rows':results},indent=2))
summary=[]
for arm,_ in arms:
 for case in ['right','left','native','right-stream']:
  rows=[r for r in results if r['arm']==arm and r['case']==case]
  summary.append({'arm':arm,'case':case,'runs':len(rows),'frameP95':q([r['frameP95'] for r in rows],.75),'lagP95px':q([r['lagP95px'] for r in rows],.75),'commitsP50':q([r['counts']['commits'] for r in rows],.5),'changesP50':q([r['counts']['changes'] for r in rows],.5),'writesP50':q([r['counts']['writes'] for r in rows],.5),'longTasks':sum(len(r['longTasks']) for r in rows),'costP50Ms':{k:q([r['costMs'][k] for r in rows],.5) for k in rows[0]['costMs']}})
(out/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2))
