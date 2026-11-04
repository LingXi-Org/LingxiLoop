import json
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(__file__).parent
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':1100},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('http://127.0.0.1:5194/docs/evidence/issue-674-679/fixture.html',wait_until='networkidle')
    page.get_by_role('heading',name='学习报告',exact=True).wait_for()
    page.get_by_role('heading',name='学生作答',exact=True).wait_for()
    body=page.locator('body').inner_text()
    assert '待验收' in body and '已掌握' not in body
    answer=page.get_by_role('region',name='提交的作答')
    for token in ['2+3*4','3*-2','a*b','x**2']:
        assert token in answer.inner_text(),token
    assert answer.locator('em').inner_text()=='斜体'
    assert answer.locator('pre code').inner_text().startswith('x = 2+3*4')
    assert page.get_by_text('来源未包含在共享片段中，或引用已失效，无法定位。',exact=True).count()==1
    assert page.locator('a[href="#fixture-submission-message-deleted-message"]').count()==0
    page.screenshot(path=str(out/'report-desktop.png'),full_page=True)
    page.get_by_role('link',name='定位原消息 · assistant-stable-4').click()
    assert page.locator('#fixture-submission-reference-0').evaluate('(el)=>el.open')
    assert page.evaluate('document.activeElement.id')=='fixture-submission-message-assistant-stable-4'
    assert '消息 4' in page.locator('#fixture-submission-message-assistant-stable-4').inner_text()
    page.get_by_role('link',name='定位原消息 · student-stable-2').first.click()
    assert page.evaluate('document.activeElement.id')=='fixture-submission-message-student-stable-2'
    page.screenshot(path=str(out/'citation-desktop.png'),full_page=True)
    page.get_by_text('核对保存的作答原文',exact=True).click()
    assert '2+3*4' in answer.inner_text()
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(out/'report-mobile.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
    assert not errors,errors
    (out/'browser-result.json').write_text(json.dumps({'browser':browser.version,'viewport':[1280,1100],'mobile':[390,844],'operatorTokens':['2+3*4','3*-2','a*b','x**2'],'italic':True,'fencedCode':True,'pendingIsNotMastered':True,'studentAndAssistantMessageFocus':True,'missingSourceDoesNotLink':True,'horizontalOverflow':False,'errors':errors,'scope':'Synthetic authorized snapshots through actual HomeworkTeacher, HomeworkSubmissionView, ForumBody and ConversationReferences components; no production session or live model.'},ensure_ascii=False,indent=2)+'\n')
    browser.close()
