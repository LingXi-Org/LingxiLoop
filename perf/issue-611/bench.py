"""Actual Chromium/UI benchmark. python3 perf/issue-611/bench.py --help."""
import argparse, json, math, platform, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

p = argparse.ArgumentParser()
p.add_argument('--urls', nargs='+', default=['http://127.0.0.1:4191/'])
p.add_argument('--runs', type=int, default=10)
p.add_argument('--cpu', type=int, default=1)
p.add_argument('--kinds', nargs='+', default=['design', 'visualize'])
p.add_argument('--out', default='/tmp/611-baseline.json')
p.add_argument('--width', type=int, default=1440)
a = p.parse_args()

class Trace:
    def __init__(self, context, page):
        self.cdp = context.new_cdp_session(page)
        self.requests = {}; self.targets = {}; self.seq = 0; self.contexts={}; self.responses={};self.page=page
        self.cdp.on('Network.requestWillBeSent', lambda x: self.event('', 'Network.requestWillBeSent', x))
        self.cdp.on('Network.responseReceived', lambda x: self.event('', 'Network.responseReceived', x))
        self.cdp.on('Network.loadingFinished', lambda x: self.event('', 'Network.loadingFinished', x))
        self.cdp.on('Target.attachedToTarget', lambda x: self.attach('', x))
        self.cdp.on('Target.receivedMessageFromTarget', lambda x: self.message('', x))
        self.cdp.on('Runtime.executionContextCreated', lambda x:self.contexts.__setitem__(('',x['context']['id']),x['context']))
        self.cdp.on('Runtime.executionContextDestroyed', lambda x:self.contexts.pop(('',x['executionContextId']),None))
        self.cdp.on('Runtime.executionContextsCleared', lambda _:self.clear_contexts(''))
        self.configure('')
    def clear_contexts(self,route):
        self.contexts={k:v for k,v in self.contexts.items() if k[0]!=route}
    def send(self, route, method, params=None):
        if not route: return self.cdp.send(method, params or {})
        self.seq += 1
        ident=self.seq
        parent, _, child = route.rpartition('/')
        self.send(parent, 'Target.sendMessageToTarget', {'sessionId': child, 'message': json.dumps({'id': ident, 'method':method, 'params':params or {}})})
        return ident
    def evaluate(self,route,context,expression):
        try:result=self.send(route,'Runtime.evaluate',{'contextId':context,'expression':expression,'returnByValue':True})
        except Exception:
            self.contexts.pop((route,context),None);return None
        if route:
            until=time.monotonic()+2
            while (route,result) not in self.responses and time.monotonic()<until:self.page.wait_for_timeout(5)
            result=self.responses.pop((route,result),{}).get('result',{})
        return result.get('result',{}).get('value')
    def configure(self, route):
        self.send(route, 'Network.enable')
        self.send(route, 'Network.emulateNetworkConditions', {'offline':False,'latency':20,'downloadThroughput':4_000_000/8,'uploadThroughput':3_000_000/8,'connectionType':'cellular4g'})
        self.send(route, 'Emulation.setCPUThrottlingRate', {'rate':a.cpu})
        self.send(route, 'Performance.enable')
        self.send(route, 'Runtime.enable')
        self.send(route, 'Target.setAutoAttach', {'autoAttach':True,'waitForDebuggerOnStart':True,'flatten':False})
        self.send(route, 'Runtime.runIfWaitingForDebugger')
    def attach(self, parent, msg):
        route = (parent+'/' if parent else '')+msg['sessionId']
        self.targets[route] = msg['targetInfo']['type']
        self.configure(route)
    def message(self, parent, event):
        route = (parent+'/' if parent else '')+event['sessionId']
        msg=json.loads(event['message'])
        if 'id' in msg:self.responses[(route,msg['id'])]=msg
        if msg.get('method')=='Runtime.executionContextCreated':self.contexts[(route,msg['params']['context']['id'])]=msg['params']['context']
        if msg.get('method')=='Runtime.executionContextDestroyed':self.contexts.pop((route,msg['params']['executionContextId']),None)
        if msg.get('method')=='Runtime.executionContextsCleared':self.contexts={k:v for k,v in self.contexts.items() if k[0]!=route}
        if msg.get('method') == 'Target.attachedToTarget': self.attach(route,msg['params'])
        elif msg.get('method') == 'Target.receivedMessageFromTarget': self.message(route,msg['params'])
        elif msg.get('method','').startswith('Network.'): self.event(route,msg['method'],msg['params'])
    def event(self, route, method, event):
        key=route+':'+event.get('requestId','')
        if method == 'Network.requestWillBeSent':
            self.requests[key]={'url':event['request']['url'],'start':event['timestamp'],'type':event['type'],'initiator':event.get('initiator',{}).get('type'),'target':route}
        elif key in self.requests:
            r=self.requests[key]
            if method == 'Network.responseReceived':
                x=event['response']; r.update({'status':x['status'],'cache':x.get('fromDiskCache',False),'encoding':x['headers'].get('Content-Encoding',x['headers'].get('content-encoding')),'ttfb':event['timestamp']-r['start']})
            if method == 'Network.loadingFinished': r.update({'end':event['timestamp'],'bytes':event['encodedDataLength']})
    def metrics(self):
        return {x['name']:x['value'] for x in self.cdp.send('Performance.getMetrics')['metrics']}

INIT = """window.__longTasks=[];try{new PerformanceObserver(l=>window.__longTasks.push(...l.getEntries().map(x=>({start:x.startTime,duration:x.duration})))).observe({type:'longtask',buffered:true})}catch{}"""
def guest(page, kind):
    for f in page.frames:
        try:
            if f.locator('h1').count() and f.locator('h1').inner_text(timeout=50).startswith('Fixed '):return f
        except Exception: pass
    return None
def usable(page, kind, start, trace):
    if kind=='visualize':
        # Chromium state-preserving moveBefore retains the guest but can leave
        # Playwright's Frame map stale. Inspect the real OOPIF execution context.
        deadline=time.monotonic()+25
        while time.monotonic()<deadline:
            for (route,context),value in list(trace.contexts.items()):
                if not value.get('auxData',{}).get('isDefault'):continue
                result=trace.evaluate(route,context,"(()=>{const h=document.querySelector('h1'),b=document.querySelector('#increment');return h&&b&&h.getBoundingClientRect().height?{rect:b.getBoundingClientRect().toJSON(),count:Number(document.querySelector('#count').textContent)}:null})()")
                if result:break
            else:page.wait_for_timeout(20);continue
            break
        else:raise RuntimeError('No visible GenUI context: '+repr(trace.contexts))
        visible=(time.monotonic()-start)*1000
        box=page.locator('[data-visualize-guest]').bounding_box();r=result['rect']
        page.mouse.click(box['x']+r['x']+r['width']/2,box['y']+r['y']+r['height']/2)
        deadline=time.monotonic()+8
        while time.monotonic()<deadline:
            if trace.evaluate(route,context,'Number(document.querySelector("#count").textContent)')==result['count']+1:break
            page.wait_for_timeout(10)
        else:raise RuntimeError('GenUI did not acknowledge trusted interaction')
        return None, {'visibleMs':visible,'usableMs':(time.monotonic()-start)*1000}
    deadline=time.monotonic()+40
    f=None
    while time.monotonic()<deadline:
        f=guest(page,kind)
        if f:
            box=f.locator('h1').bounding_box()
            if box and box['width']>0 and box['height']>0:
                f.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
                break
        page.wait_for_timeout(20)
    else: raise RuntimeError('No visible authored content: '+repr([(f.url,f.locator('body').inner_text()[:160])for f in page.frames]))
    visible=(time.monotonic()-start)*1000
    if kind=='design':
        box=f.locator('h1').bounding_box()
        page.mouse.dblclick(box['x']+min(120,box['width']/2),box['y']+box['height']/2)
        f.locator('h1[contenteditable="true"]').wait_for(timeout=10000)
    else:
        old=int(f.locator('#count').inner_text())
        f.locator('#increment').click()
        f.wait_for_function('(n)=>Number(document.querySelector("#count").textContent)===n',arg=old+1)
    return f, {'visibleMs':visible,'usableMs':(time.monotonic()-start)*1000}

report={'browser':None,'host':{'system':platform.platform(),'cpu':Path('/proc/cpuinfo').read_text().split('model name')[1].split('\n')[0].lstrip(':\t ')},'profile':{'latencyMs':20,'downloadMbps':4,'uploadMbps':3,'cpu':a.cpu,'width':a.width,'height':1000,'oopifThrottled':True},'scope':'Production UI/isolated gateway/editor/SDK, synthetic local API; excludes production authorization/database/IM/model latency','samples':[]}
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    report['browser']=browser.version
    for n in range(a.runs):
        for url in a.urls:
            for kind in a.kinds:
                urllib.request.urlopen(urllib.request.Request(url+'__fixture/reset',data=b'{}',headers={'Content-Type':'application/json'})).close()
                ctx=browser.new_context(viewport={'width':a.width,'height':1000},device_scale_factor=1)
                ctx.add_init_script(INIT)
                page=ctx.new_page();page.set_default_timeout(12000)
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                trace=Trace(ctx,page)
                for scenario in ['cold','reopen','warm','refresh']:
                    if scenario in ['cold','refresh']:
                        page.goto(url+'?kind='+kind,wait_until='domcontentloaded')
                        page.locator('#open').wait_for()
                    elif scenario=='warm':
                        page.locator('#switch').click()
                    else:
                        page.locator('#close').click()
                        page.wait_for_timeout(50)
                    before=set(trace.requests);metrics=trace.metrics(); start=time.monotonic()
                    page.locator('#open').click()
                    f,timing=usable(page,kind,start,trace)
                    end=trace.metrics()
                    requests=[v for k,v in trace.requests.items() if k not in before and v['url'].startswith('http')]
                    # Remove ephemeral capability values from recorded URLs.
                    import re
                    for item in requests:
                        item['url']=re.sub(r'/design/[^/]+/','/design/<grant>/',item['url'])
                        item['url']=re.sub(r'http://[a-f0-9]{32}-artifact','http://<grant-origin>-artifact',item['url'])
                        item['url']=re.sub(r'/pages/page-[^/]+','/pages/<page>',item['url'])
                    frames=[]
                    for frame in page.frames:
                        try:frames.append(frame.evaluate('()=>({url:location.href.startsWith("about:")?location.href:"host/editor",resources:performance.getEntriesByType("resource").map(x=>({name:x.name.split("/").at(-1),start:x.startTime,end:x.responseEnd,transfer:x.transferSize,encoded:x.encodedBodySize,decoded:x.decodedBodySize})),longTasks:window.__longTasks??[]})'))
                        except Exception:pass
                    row={'run':n,'url':url,'kind':kind,'scenario':scenario,**timing,'bytes':sum(x.get('bytes',0)for x in requests),'requests':requests,'frames':frames,'targets':list(trace.targets.values()),'metricsDelta':{k:end[k]-metrics.get(k,0)for k in ['ScriptDuration','TaskDuration','JSHeapUsedSize']},'errors':errors[:]}
                    report['samples'].append(row)
                    print(json.dumps({k:row[k]for k in ['run','url','kind','scenario','visibleMs','usableMs','bytes']}),flush=True)
                    if n==0:page.screenshot(path=str(Path(a.out).with_suffix(''))+'-'+kind+'-'+str(a.urls.index(url))+'-'+scenario+'.png')
                    if kind=='design':page.keyboard.press('Escape')
                    Path(a.out).write_text(json.dumps(report,indent=2))
                ctx.close()
    browser.close()
groups={}
for row in report['samples']:
    key='|'.join([row['url'],row['kind'],row['scenario']]);groups.setdefault(key,[]).append(row)
report['summary']={key:{metric:{'p'+str(p):sorted(x[metric]for x in rows)[max(0,math.ceil(len(rows)*p/100)-1)] for p in [50,75,95]} for metric in ['visibleMs','usableMs','bytes']}for key,rows in groups.items()}
Path(a.out).write_text(json.dumps(report,indent=2))
print(json.dumps(report['summary'],indent=2))
