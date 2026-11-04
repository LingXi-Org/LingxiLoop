"""Real library drag/keyboard/reload test of the Desktop width owner, no server auth."""
import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
port=int(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
key='lingxiloop:desktop-layout:sidebar-width:v1'
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://127.0.0.1:{port}/?kind=desktop');handle=page.get_by_role('separator');handle.wait_for();page.wait_for_timeout(100)
 panel=page.locator('#conversations[data-panel]');box=handle.bounding_box();x=box['x']+box['width']/2;y=100
 page.mouse.move(x,y);page.mouse.down()
 for dx in [10,20,30,40]:page.mouse.move(x+dx,y)
 assert page.evaluate('sidebarWrites()')==0,'no storage writes during drag'
 page.mouse.up();page.wait_for_timeout(60)
 count=page.evaluate('sidebarWrites()');stored=page.evaluate('(k)=>localStorage.getItem(k)',key)
 assert count==1 and stored is not None,{'writes':count,'stored':stored}
 assert abs(panel.bounding_box()['width']-float(stored))<1
 page.reload();handle.wait_for();assert abs(panel.bounding_box()['width']-float(stored))<1
 assert page.evaluate('sidebarWrites()')==0,'restoring a saved layout must not rewrite it'
 handle.focus();page.keyboard.press('ArrowLeft');page.wait_for_timeout(50)
 assert page.evaluate('sidebarWrites()')==1
 assert float(page.evaluate('(k)=>localStorage.getItem(k)',key))<float(stored)
 page.set_viewport_size({'width':1000,'height':1000});page.wait_for_timeout(100)
 assert page.evaluate('sidebarWrites()')==1,'container resize is not a user separator change'
 page.evaluate('(k)=>localStorage.setItem(k,"not-a-number")',key);page.reload();handle.wait_for()
 assert abs(panel.bounding_box()['width']-300)<1
 # Denied storage keeps the usable layout and keyboard control; no token/settings change.
 page.evaluate('()=>{Storage.prototype.setItem=function(){throw new DOMException("denied","SecurityError")};return true}')
 handle.focus();page.keyboard.press('ArrowRight');page.wait_for_timeout(50)
 assert panel.bounding_box()['width']>300 and not errors,errors
 page.screenshot(path=str(out/'persistence.png'));browser.close()
(out/'persistence.json').write_text(json.dumps({'dragWrites':count,'savedWidth':float(stored),'reloadRestored':True,'keyboard':True,'resizeDoesNotWrite':True,'malformedStorage':True,'deniedStorage':True,'errors':errors},indent=2))
print((out/'persistence.json').read_text())
