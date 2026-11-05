import hashlib, json
from pathlib import Path
from urllib.parse import urlencode
from playwright.sync_api import sync_playwright
out=Path(__file__).parent
f=json.loads(Path('/tmp/issue604-case-ids.json').read_text())
case=f['ids']['plain']; headers={'x-company-id':f['company']}
base='http://127.0.0.1:5198/docs/evidence/issue-604-persistence/fixture.html?'
url=lambda manage=False:base+urlencode({'case':case,'company':f['company'],**({'caseView':'manage'} if manage else {})})
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':1000})
    def api(view):
        response=page.request.get(f'http://127.0.0.1:5196/api/cases/{case}?view={view}',headers=headers)
        assert response.ok,response.text()
        return response.json()
    original=api('reader')
    page.goto(url(True),wait_until='networkidle')
    page.get_by_role('button',name='编辑案例',exact=True).click()
    code=page.get_by_role('textbox',name='正文',exact=True).locator('pre code')
    code.wait_for()
    code.evaluate('el => {el.closest("[contenteditable=true]").focus(); const r=document.createRange();r.selectNodeContents(el);r.collapse(false);const s=window.getSelection();s.removeAllRanges();s.addRange(r)}')
    page.keyboard.type(' # saved-again')
    expected=f['code']+' # saved-again'
    with page.expect_response(lambda r:r.request.method=='PUT' and '/api/cases/' in r.url) as saved:
        page.get_by_role('button',name='保存草稿',exact=True).click()
    assert saved.value.ok,saved.value.text()
    draft=api('manage')
    native=draft['editorDocument']['blocks'][0]
    assert native['props']['language']=='text'
    assert ''.join(p['text'] for p in native['content'])==expected
    assert api('reader')['body']==original['body']
    page.reload(wait_until='networkidle')
    page.get_by_role('button',name='编辑案例',exact=True).click()
    assert page.get_by_role('textbox',name='正文',exact=True).locator('pre code').inner_text()==expected
    with page.expect_response(lambda r:r.url.endswith('/publish') and r.request.method=='POST') as published:
        page.get_by_role('button',name='发布',exact=True).click()
    assert published.value.ok,published.value.text()
    page.goto(url(),wait_until='networkidle')
    page.reload(wait_until='networkidle')
    assert page.locator('[data-case-body] pre code').inner_text()==expected
    assert page.locator('[data-case-body] script').count()==0
    after=api('reader')
    assert after['editorDocument']==draft['editorDocument']
    (out/'body-edit-result.json').write_text(json.dumps({'browser':browser.version,'actualNativeCodeEdited':True,'saveReloadPublishReloadRead':True,'language':'text','codeSha256':hashlib.sha256(expected.encode()).hexdigest(),'savedVersion':draft['version'],'publishedVersion':after['publishedVersion'],'readerUnchangedBeforePublish':True,'literalHTMLStayedText':True},indent=2)+'\n')
    browser.close()
