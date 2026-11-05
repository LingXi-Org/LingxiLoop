import json
from pathlib import Path
from urllib.parse import urlencode
from playwright.sync_api import sync_playwright
out = Path(__file__).parent
fixture = json.loads(Path('/tmp/issue604-case-ids.json').read_text())
headers = {'x-company-id': fixture['company']}
results = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1280,'height':1000})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    def api(case, view):
        response=page.request.get(f'http://127.0.0.1:5196/api/cases/{case}?view={view}',headers=headers)
        assert response.ok, response.text()
        return response.json()
    def url(case, manage=False):
        return 'http://127.0.0.1:5198/docs/evidence/issue-604-persistence/fixture.html?' + urlencode({'case':case,'company':fixture['company'],**({'caseView':'manage'} if manage else {})})
    for kind, case in fixture['ids'].items():
        original=api(case,'reader')
        assert len(original['editorDocument']['blocks']) == 6
        page.goto(url(case),wait_until='networkidle')
        page.locator('[data-case-body] .bn-editor').wait_for()
        initial_pre=page.locator('[data-case-body] pre code').count()
        if kind=='plain': assert initial_pre==1
        if kind=='styled':
            assert page.locator('[data-case-body] em').all_text_contents()==['if x:','    print(y)']
            before_switch=api(case,'reader')
            toggle=page.get_by_role('button',name='查看代码排版',exact=True)
            toggle.focus()
            page.keyboard.press('Enter')
            assert page.locator('[data-case-body] pre code').inner_text()==fixture['code']
            assert page.locator('[data-case-body] script').count()==0
            page.get_by_role('button',name='返回原排版',exact=True).click()
            assert page.locator('[data-case-body] em').all_text_contents()==['if x:','    print(y)']
            assert api(case,'reader')==before_switch
        else:
            assert page.get_by_role('button',name='查看代码排版',exact=True).count()==0
        assert page.locator('[data-case-body] script').count()==0
        page.goto(url(case,True),wait_until='networkidle')
        page.get_by_role('button',name='编辑案例',exact=True).click()
        page.get_by_role('textbox',name='正文',exact=True).wait_for()
        page.get_by_role('textbox',name='案例标题',exact=True).fill(original['title']+' 已更新')
        with page.expect_response(lambda r:r.request.method=='PUT' and '/api/cases/' in r.url) as save:
            page.get_by_role('button',name='保存草稿',exact=True).click()
        assert save.value.ok, save.value.text()
        draft=api(case,'manage')
        before_publish=api(case,'reader')
        assert before_publish['body']==original['body']
        assert before_publish['editorDocument']==original['editorDocument']
        assert before_publish['title']==original['title']
        assert draft['hasUnpublishedChanges']
        stale={key:original[key] for key in ['title','summary','body','editorDocument','cover','category','tags']}
        stale['version']=original['version']
        assert page.request.put(f'http://127.0.0.1:5196/api/cases/{case}',headers=headers,data=stale).status==409
        if kind=='plain':
            code=draft['editorDocument']['blocks'][0]
            assert code['type']=='codeBlock'
            assert ''.join(p['text'] for p in code['content'])==fixture['code']
        else:
            assert draft['body']==original['body']
            assert draft['editorDocument']==original['editorDocument']
        page.reload(wait_until='networkidle')
        page.get_by_role('button',name='编辑案例',exact=True).click()
        assert page.get_by_role('textbox',name='案例标题').input_value()==draft['title']
        with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/publish')) as publish:
            page.get_by_role('button',name='发布',exact=True).click()
        assert publish.value.ok, publish.value.text()
        page.goto(url(case),wait_until='networkidle')
        page.reload(wait_until='networkidle')
        page.locator('[data-case-body] .bn-editor').wait_for()
        published=api(case,'reader')
        assert published['body']==draft['body']
        assert published['editorDocument']==draft['editorDocument']
        assert published['title']==draft['title']
        assert not api(case,'manage')['hasUnpublishedChanges']
        pre=page.locator('[data-case-body] pre code').count()
        if kind=='plain': assert page.locator('[data-case-body] pre code').inner_text()==fixture['code']
        if kind=='styled':
            assert page.locator('[data-case-body] em').all_text_contents()==['if x:','    print(y)']
            before_switch=api(case,'reader')
            toggle=page.get_by_role('button',name='查看代码排版',exact=True)
            toggle.focus()
            page.keyboard.press('Enter')
            assert page.locator('[data-case-body] pre code').inner_text()==fixture['code']
            assert page.locator('[data-case-body] script').count()==0
            page.get_by_role('button',name='返回原排版',exact=True).click()
            assert page.locator('[data-case-body] em').all_text_contents()==['if x:','    print(y)']
            assert api(case,'reader')==before_switch
        else:
            assert page.get_by_role('button',name='查看代码排版',exact=True).count()==0
        if kind=='styled':
            page.set_viewport_size({'width':390,'height':844})
            page.get_by_role('button',name='查看代码排版',exact=True).click()
            assert page.get_by_role('button',name='返回原排版',exact=True).get_attribute('aria-pressed')=='true'
            assert page.locator('[data-case-body] pre code').inner_text()==fixture['code']
            assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
            page.screenshot(path=str(out/'code-reading-mobile.png'))
            page.reload(wait_until='networkidle')
            page.locator('[data-case-body] .bn-editor').wait_for()
            assert page.get_by_role('button',name='查看代码排版',exact=True).get_attribute('aria-pressed')=='false'
            assert page.locator('[data-case-body] em').all_text_contents()==['if x:','    print(y)']
            assert api(case,'reader')==published
            page.set_viewport_size({'width':1280,'height':1000})
        if kind=='escaped': assert pre==0
        results.append({'kind':kind,'id':case,'savedVersion':draft['version'],'publishedVersion':published['publishedVersion'],'initialReaderCodeBlocks':initial_pre,'finalReaderCodeBlocks':pre,'explicitCodeViewAvailable':kind=='styled','explicitViewCodeBlocks':1 if kind=='styled' else None,'viewSwitchDoesNotWrite':True if kind=='styled' else None,'staleSaveRejected':True,'snapshotStayedUnchangedUntilPublish':True,'nativeFormatPreserved':True,'serverSaveReloadPublishRead':True})
    assert not errors, errors
    report={'browser':browser.version,'base':'bb1186f4','scope':'Actual CasesPage + casesRouter/CasesApplication + PostgreSQL owning-case schema slice; synthetic session identity and recording storage; not full runtime bootstrap or production acceptance.','results':results,'errors':errors}
    (out/'browser-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    browser.close()
print(json.dumps(results,ensure_ascii=False,indent=2))
