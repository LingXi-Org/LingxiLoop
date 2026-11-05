"""Focused real-browser resize interaction regression on the synthetic host."""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
port=int(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
reports=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for side in ['right','left']:
  context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page()
  page.goto(f'http://127.0.0.1:{port}/?side={side}')
  handle=page.get_by_role('button',name='调整侧栏',exact=True);handle.wait_for();page.wait_for_timeout(250)
  page.locator('textarea').fill('Scoped unsent draft')
  page.locator('main').evaluate('(el)=>{el.scrollTop=400}')
  page.evaluate('window.frame=document.querySelector("iframe");window.input=document.querySelector("textarea")')
  if side=='right':
   page.frame_locator('iframe').locator('h1').fill('Unsaved native content')
   assert page.frame_locator('iframe').locator('img').evaluate_all('(els)=>els.length===80 && els.every(el=>el.complete && el.naturalWidth===320)')
  box=handle.bounding_box();x=box['x']+box['width']/2;y=box['y']+100
  initial=page.locator('[data-slot="sidebar-container"]').bounding_box()['width']
  inherited=page.locator('main').evaluate('(el)=>getComputedStyle(el).getPropertyValue("--sidebar-width")')
  page.mouse.move(x,y);page.mouse.down();page.evaluate('reset()')
  page.mouse.move(x+(40 if side=='left' else -100),y)
  page.wait_for_timeout(32)
  measured=page.locator('[data-slot="sidebar-container"]').bounding_box()['width']
  expected=initial+(40 if side=='left' else 100)
  assert abs(measured-expected)<2,{'case':'pointer must track within two pixels after two 60Hz frames','side':side,'measured':measured,'expected':expected}
  assert page.locator('main').evaluate('(el)=>getComputedStyle(el).getPropertyValue("--sidebar-width")')==inherited,'pointer width must stay out of conversation style inheritance'
  assert page.evaluate('measurements.changes')==0,'parent must not rerender on every pointer move'
  page.mouse.up();page.wait_for_timeout(50)
  assert page.evaluate('measurements.changes')==1,'one settled owner update'
  assert page.locator('[data-slot="sidebar"]').evaluate('(el)=>el.style.getPropertyValue("--sidebar-width")')==''
  assert page.evaluate('document.querySelector("[data-sidebar-resizing]")===null')
  assert abs(page.locator('main').evaluate('(el)=>el.scrollTop')-400)<2
  handle.focus();page.keyboard.press('ArrowRight');page.wait_for_timeout(240)
  after=page.locator('[data-slot="sidebar-container"]').bounding_box()['width']
  assert abs(after-(expected+(10 if side=='left' else -10)))<2
  assert handle.evaluate('(el)=>el===document.activeElement && getComputedStyle(el).outlineWidth!=="0px"')
  box=handle.bounding_box();page.mouse.move(box['x']+box['width']/2,y);page.mouse.down();page.mouse.move(box['x']+20,y)
  updates_before_cancel=page.evaluate('measurements.changes')
  handle.dispatch_event('pointercancel',{'pointerId':1});page.mouse.up();page.wait_for_timeout(240)
  assert page.evaluate('document.querySelector("[data-sidebar-resizing]")===null')
  cancelled_width=page.locator('[data-slot="sidebar-container"]').bounding_box()['width']
  assert abs(cancelled_width-after)<2, {'case':'cancelling a drag must restore the last committed width','side':side,'before':after,'after':cancelled_width,'updates':page.evaluate('measurements.changes')}
  assert page.evaluate('measurements.changes')==updates_before_cancel, 'cancel must not commit an interrupted width'
  page.click('#toggle');page.wait_for_timeout(240);page.click('#toggle');page.wait_for_timeout(240)
  assert page.evaluate('input===document.querySelector("textarea")&&frame===document.querySelector("iframe")')
  assert page.locator('textarea').input_value()=='Scoped unsent draft'
  if side=='right':assert page.frame_locator('iframe').locator('h1').inner_text()=='Unsaved native content'
  page.emulate_media(reduced_motion='reduce')
  assert page.locator('[data-slot="sidebar-container"]').evaluate('(el)=>getComputedStyle(el).transitionProperty')=='none'
  page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not handle.is_visible()
  page.screenshot(path=str(out/f'{side}-narrow.png'));reports.append({'side':side,'pointer':True,'settledUpdates':1,'keyboard':True,'visibleFocus':True,'scrollPosition':True,'reducedMotion':True,'cancelRollback':True,'retainedDraftAndFrame':True,'narrow':True})
  context.close()
 # Touch drag crosses into the authored iframe while capture stays with the handle.
 context=browser.new_context(viewport={'width':1440,'height':1000},has_touch=True)
 page=context.new_page();page.goto(f'http://127.0.0.1:{port}/?side=right')
 handle=page.get_by_role('button',name='调整侧栏',exact=True);handle.wait_for();page.wait_for_timeout(250)
 box=handle.bounding_box();x=box['x']+box['width']/2;y=box['y']+100
 initial=page.locator('[data-slot="sidebar-container"]').bounding_box()['width']
 cdp=context.new_cdp_session(page);page.evaluate('reset()')
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x-100,'y':y}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(32)
 assert abs(page.locator('[data-slot="sidebar-container"]').bounding_box()['width']-(initial+100))<2
 assert page.evaluate('measurements.changes')==1
 assert page.evaluate('document.querySelector("[data-sidebar-resizing]")===null')
 reports.append({'touchViaCDP':True,'immediateRelease':True,'settledUpdates':1,'captureCleanup':True})
 context.close()
 browser.close()
(out/'regression.json').write_text(json.dumps(reports,indent=2));print(json.dumps(reports,indent=2))
