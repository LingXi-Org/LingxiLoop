"""Owning native Panel keyboard collapse contract for the #664 integration boundary.
This uses the #660 hook; it preserves the visual behavior already merged into main.
python perf/issue-660/workspace/collapse.py <port> <out-dir>
"""
import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
port=int(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
key='lingxiloop:desktop-layout:sidebar-width:v1'
with sync_playwright()as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://127.0.0.1:{port}/?kind=desktop&collapse=true');h=page.get_by_role('separator');h.wait_for()
 rect=h.bounding_box();x=rect['x']+rect['width']/2;page.mouse.move(x,100);page.mouse.down();page.mouse.move(x+60,100);page.mouse.up();page.wait_for_timeout(60)
 saved=page.evaluate('(k)=>localStorage.getItem(k)',key);writes=page.evaluate('sidebarWrites()')
 assert saved=='340',saved
 h.focus();page.keyboard.press('Enter');page.wait_for_timeout(80)
 measured=page.locator('#conversations[data-panel]').bounding_box()['width'];after=page.evaluate('(k)=>localStorage.getItem(k)',key)
 assert measured<1,measured
 assert after==saved and page.evaluate('sidebarWrites()')==writes,{'expanded':saved,'collapsedStored':after,'writes':page.evaluate('sidebarWrites()')}
 page.keyboard.press('Enter');page.wait_for_timeout(80)
 assert abs(page.locator('#conversations[data-panel]').bounding_box()['width']-float(saved))<1
 page.reload();h.wait_for();assert abs(page.locator('#conversations[data-panel]').bounding_box()['width']-float(saved))<1
 # The shared native ref also owns the Mingli double-click reset.
 h.dblclick();page.wait_for_timeout(80)
 assert page.evaluate('(k)=>localStorage.getItem(k)',key)=='280'
 assert abs(page.locator('#conversations[data-panel]').bounding_box()['width']-280)<1
 page.reload();h.wait_for();assert abs(page.locator('#conversations[data-panel]').bounding_box()['width']-280)<1
 assert not errors,errors
 b.close()
(out/'collapse.json').write_text(json.dumps({'savedExpandedWidth':saved,'keyboardCollapsePreservesWidth':True,'keyboardExpandRestoresWidth':True,'reloadRestoresWidth':True,'doubleClickReset280':True,'errors':errors},indent=2));print((out/'collapse.json').read_text())
