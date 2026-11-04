"""Real initialized editor frames; synthetic grants/documents, local HTTPS/Brotli.
The app's cross-view owner is checked separately by check-artifact-view-retention.
python perf/issue-652/retained.py <port> <out.json> [width]
"""
import base64, hashlib, json, math, subprocess, sys, time
from pathlib import Path
import psutil
from playwright.sync_api import sync_playwright
port, output, *rest = sys.argv[1:]
width = int(rest[0]) if rest else 1440
sys.argv = [sys.argv[0]]
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'issue-611'))
from bench import Trace, INIT
public = subprocess.check_output(['openssl','x509','-pubkey','-noout','-in','.codex-tmp/issue-652/tls/cert.pem'])
der = subprocess.check_output(['openssl','pkey','-pubin','-outform','der'],input=public)
spki = base64.b64encode(hashlib.sha256(der).digest()).decode()
report = {'scope':'Actual ArtifactEditorFrame, actual Design/Slides, synthetic grants/documents. App owner lifecycle has a separate DesktopApp regression. Memory is Linux PSS of this Chromium process family, not a browser-enforced byte cap.',
          'profile':{'width':width,'height':1000,'downloadMbps':4,'latencyMs':20,'recursiveOopifThrottle':True},'samples':[],'memory':[],'errors':[]}

def usable(page, kind):
    deadline = time.monotonic()+45
    while time.monotonic()<deadline:
        for frame in page.frames:
            owner = frame
            while owner and f'/artifact-editor/{kind}/' not in owner.url:
                owner = owner.parent_frame
            if owner is None:
                continue
            try:
                target=frame.locator('h1' if kind=='design' else '[data-text-path]').filter(has_text='Fixed performance board' if kind=='design' else '幻灯片 1').first
                box=target.bounding_box(timeout=80)
                if not box or box['width']<=0 or box['height']<=0:continue
                if kind=='slides' and not frame.evaluate('Array.from(document.images).some(i=>i.complete&&i.naturalWidth>=640&&i.getBoundingClientRect().width>0)'):continue
                target.dblclick(timeout=1500,position={'x':min(50,box['width']/2),'y':min(20,box['height']/2)})
                frame.wait_for_function('Boolean(document.activeElement?.isContentEditable)',timeout=2000)
                return frame
            except Exception:pass
        page.wait_for_timeout(25)
    raise AssertionError('Actual editor did not enter editing')

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server','--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1','--ignore-certificate-errors-spki-list='+spki])
    report['browser']=browser.version
    driver=psutil.Process(pw._impl_obj._connection._transport._proc.pid)
    def memory(label):
        rows=[]
        for process in driver.children(recursive=True):
            try:
                if 'chrom' not in process.name():continue
                cpu=process.cpu_times()
                rows.append({'pid':process.pid,'pss':process.memory_full_info().pss,'cpu':cpu.user+cpu.system})
            except (psutil.NoSuchProcess,psutil.AccessDenied):pass
        item={'label':label,'pssMiB':round(sum(p['pss'] for p in rows)/2**20,2),'processes':rows}
        report['memory'].append(item)
        return item
    context=browser.new_context(viewport={'width':width,'height':1000})
    context.add_init_script(INIT)
    page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
    trace=Trace(context,page)
    page.goto(f'https://app.lingxi-perf.cn:{port}/?retain=true',wait_until='domcontentloaded')
    page.locator('#open-board-a').wait_for()
    memory('host only')
    document_times = {}
    for kind, prefix in [('design','board'),('slides','deck')]:
        page.locator('#open-'+prefix+'-a').click();frame=usable(page,kind)
        page.evaluate("kind=>{window.held??={};const f=document.querySelector('[data-artifact-editor='+kind+'] iframe');window.held[kind]={frame:f,proxy:f.contentWindow}}",kind)
        document_times[kind] = frame.evaluate('performance.timeOrigin')
        memory('initialized '+kind)
        page.keyboard.press('Escape');page.locator('#close').click();page.wait_for_timeout(100)
    for trial in range(10):
        for kind,prefix in ([('design','board'),('slides','deck')] if trial%2==0 else [('slides','deck'),('design','board')]):
            before=set(trace.requests)
            started=time.monotonic();page.locator('#open-'+prefix+'-a').click();frame=usable(page,kind)
            elapsed=(time.monotonic()-started)*1000
            same=page.evaluate("kind=>{const f=document.querySelector('[data-artifact-editor='+kind+'] iframe');return f===window.held[kind].frame&&f.contentWindow===window.held[kind].proxy}",kind)
            requests=[dict(value) for key,value in trace.requests.items() if key not in before]
            scripts=[r for r in requests if r.get('type')=='Script' and r.get('bytes',0)>1024]
            same_document = frame.evaluate('performance.timeOrigin') == document_times[kind]
            assert same and same_document and not scripts,(same,same_document,scripts)
            sample={'trial':trial,'arm':'candidate','kind':kind,'scenario':'retained','editableMs':round(elapsed,1),'sameIframe':same,'sameDocument':same_document,'requests':requests,'scriptTransfers':len(scripts),'bytes':sum(r.get('bytes',0) for r in requests),'errors':list(report['errors'])}
            report['samples'].append(sample);print(json.dumps(sample),flush=True)
            if trial==0:page.screenshot(path=str(Path(output).parent/f'retained-{kind}-{width}.png'))
            page.keyboard.press('Escape');page.locator('#close').click();page.wait_for_timeout(100)
    assert page.locator('iframe').count()==2
    for label, show in [('both hidden',False),('Slides visible',True)]:
        if show:page.locator('#open-deck-a').click();usable(page,'slides');page.keyboard.press('Escape')
        start=memory(label+' start');page.wait_for_timeout(5000);end=memory(label+' end')
        prior={p['pid']:p['cpu'] for p in start['processes']}
        delta=sum(max(0,p['cpu']-prior.get(p['pid'],p['cpu'])) for p in end['processes'])
        report.setdefault('background',[]).append({'label':label,'seconds':5,'processCpuSeconds':round(delta,4),'sameProcessSet':set(prior)==set(p['pid'] for p in end['processes'])})
    page.locator('#evict').click();page.wait_for_timeout(1000)
    assert page.locator('iframe').count()==0
    assert page.evaluate("Object.values(window.held).every(x=>!x.frame.isConnected)")
    page.evaluate('delete window.held')
    memory('after releasing both frames')
    context.new_cdp_session(page).send('HeapProfiler.collectGarbage')
    page.wait_for_timeout(1000)
    memory('after host GC without test references')
    page.locator('#open-board-a').click();frame=usable(page,'design')
    assert frame.evaluate('performance.timeOrigin') != document_times['design']
    report['evictionReopen']=True
    assert not report['errors'],report['errors']
    browser.close()
report['summary']={}
for kind in ['design','slides']:
    values=sorted(s['editableMs'] for s in report['samples'] if s['kind']==kind)
    report['summary'][kind]={f'p{q}':values[math.ceil(len(values)*q/100)-1] for q in [50,75,95]}
Path(output).write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'summary':report['summary'],'memory':[{k:v for k,v in m.items() if k!='processes'} for m in report['memory']],'background':report['background']},ensure_ascii=False),flush=True)
