"""Real opaque Slides editor with deterministic API fixtures. Build editor first.
No production authentication, database or deployment is exercised.
"""
import argparse
import subprocess
import xml.etree.ElementTree as ET
import base64
import hashlib
import json
from pathlib import Path
import re
import time
import zipfile

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "https://slides.test"
BASE = "/artifact-editor/slides/test-grant/"


def run(browser, baseline=False, read_only=False):
    upstream = mobile = legacy = False
    evidence = ROOT / "docs/evidence/issue-631"
    evidence.mkdir(parents=True, exist_ok=True)
    editor = Path("/tmp/lingxi631-baseline/server/assets/slides-editor") if baseline else ROOT / "server/assets/slides-editor"
    matrix = r'\[\begin{pmatrix}' + r'\\'.join('&amp;'.join(f'a_{{{r}{c}}}' for c in range(1,5)) for r in range(1,5)) + r'\end{pmatrix}\]'
    long_html = '<section id="long"><p style="position:absolute;left:100px;top:100px;width:350px;height:800px;font-size:44px">'+r'\['+'+'.join(['x_i^2']*20)+r'\]</p><p style="position:absolute;left:600px;top:100px;width:350px;height:500px;font-size:44px">'+matrix+'</p><table style="position:absolute;left:1100px;top:100px;width:350px;font-size:44px"><tr><td>'+matrix+'</td></tr></table></section>'
    initial = {"project/deck.json": json.dumps(dict(v=4, lists="css", title="Slides math synthetic", order=["math", "plain", "long"], sections={}, faces={}, designSystems=[])), "project/slides/math.html": (evidence / "fixture.html").read_text(), "project/slides/plain.html": '<section id="plain"><h1>Plain native text</h1><p>No math here</p></section>', "project/slides/long.html": long_html}
    files = {path: value.encode() for path, value in initial.items()}
    requests, errors, publishes = [], [], []
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.set_default_timeout(15000)
    page.on("pageerror", lambda error: errors.append(str(error)))
    print("START", legacy, flush=True)

    def sha(data):
        return hashlib.sha256(data).hexdigest()

    def route(request):
        path = request.request.url.split(ORIGIN, 1)[1].split("?", 1)[0]
        requests.append(path)
        relative = path.removeprefix(BASE)
        headers = {"Access-Control-Allow-Origin": "*"}
        if path == "/host":
            request.fulfill(body=f'<iframe title="演示文稿编辑器" sandbox="allow-scripts allow-downloads allow-popups allow-modals" allow="fullscreen" src="{BASE}" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>', content_type="text/html")
            return
        if path.startswith("/artifact-editor/slides-assets/"):
            relative = "assets/" + path.rsplit("/", 1)[1]
        if relative == "_files.json":
            body = json.dumps({"ver": sha(b"".join(files.values())), "files": {name: {"sha256": sha(data), "size": len(data), "contentType": "text/html" if name.endswith(".html") else "application/json"} for name, data in files.items()}})
            content_type = "application/json"
        elif relative == "__deck/session":
            body, content_type = json.dumps({"canEdit":not read_only}), "application/json"
        elif relative == "__deck/publish":
            batch = request.request.post_data_json["files"]
            for name, entry in batch.items():
                if entry and "ifMatch" in entry:
                    assert entry["ifMatch"] == (sha(files[name]) if name in files else None), name
            shas = {}
            for name, entry in batch.items():
                if entry is None or entry.get("delete"):
                    files.pop(name, None)
                else:
                    files[name] = base64.b64decode(entry["base64"])
                    shas[name] = sha(files[name])
            publishes.append(batch)
            body, content_type = json.dumps({"version": sha(b"".join(files.values())), "shas": shas}), "application/json"
        elif relative == "__comments":
            body, content_type = '{"threads":[],"agent":{"available":false},"me":{"name":"测试用户"}}', "application/json"
        elif relative.endswith("events"):
            body, content_type = ": connected\n\n", "text/event-stream"
        elif relative in files:
            body, content_type = files[relative], "text/html" if relative.endswith(".html") else "application/json"
        else:
            file = editor / (relative or "index.html")
            if not file.is_file():
                request.fulfill(status=404, headers=headers)
                return
            body = file.read_bytes()
            content_type = {".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2"}.get(file.suffix, "text/html")
            if file.name == "index.html" and not upstream:
                download_script = (ROOT / "server/src/modules/artifacts/editor-downloads.ts").read_text(encoding="utf-8").split("`", 2)[1]
                body = body.decode().replace("</head>", f"<script>{download_script}</script></head>")
        request.fulfill(body=body, content_type=content_type, headers=headers)

    page.route(ORIGIN + "/**", route)
    page.goto(ORIGIN + "/host", wait_until="domcontentloaded")
    view = page.frame_locator("iframe")

    surface = view.locator('[data-slides-editor] [style*="width: 1920px"][style*="background:"]').first
    expect(surface).to_be_visible()
    page.wait_for_timeout(900)
    page.screenshot(path=str(evidence / ("before.png" if baseline else "readonly-preview.png" if read_only else "editor.png")))
    fonts = [] if baseline else surface.evaluate("""async el => {
        await document.fonts.ready;
        return [...document.fonts].filter(face=>face.status==='loaded').map(face=>face.family);
    }""")
    if not baseline:
        for family in ['KaTeX_Main','KaTeX_Math','KaTeX_Size3']:
            assert family in fonts, (family, fonts)
    count = surface.locator('[data-slide-math]').count()
    if baseline:
        assert count == 0
        assert "\\frac" in surface.inner_text()
        page.close()
        return {"baselineMathCount": count, "rawSourceVisible": True, "errors":errors}
    assert count == 7, count
    assert len(publishes) == 0, "opening rewrote saved source"
    if read_only:
        assert not view.locator("[contenteditable=\"true\"]").count()
        page.screenshot(path=str(evidence / "readonly-preview.png"))
        page.close()
        return {"readOnlyPreviewMathCount":count,"errors":errors}
    assert "$5 and $10" in surface.inner_text()
    assert "`$x^2$`" in surface.inner_text()
    assert r"\notACommand" in surface.inner_text()
    bounds = surface.locator('[data-slide-math]').evaluate_all("""els => els.map(el => {
        const rect=el.getBoundingClientRect(), parent=el.closest('[data-text-path], [data-cell]').getBoundingClientRect();
        return {width:rect.width,height:rect.height,within:rect.left>=parent.left-1&&rect.right<=parent.right+1&&rect.top>=parent.top-1&&rect.bottom<=parent.bottom+1};
    })""")
    assert all(n['within'] for n in bounds), bounds
    surface.locator('[data-text-path]').nth(1).dblclick()
    editable = view.locator('[contenteditable="true"]').first
    expect(editable).to_be_visible()
    assert r"\frac{1}{2}" in editable.inner_text()
    assert editable.locator('[data-slide-math]').count() == 0
    page.screenshot(path=str(evidence / "editing-source.png"))
    page.keyboard.press("End")
    page.keyboard.type(" revised")
    page.keyboard.press("Escape")
    deadline = time.monotonic() + 15
    while not publishes and time.monotonic() < deadline:
        page.wait_for_timeout(100)
    assert publishes, "edit did not save"
    saved = files["project/slides/math.html"].decode()
    assert "revised" in saved and r"\frac{1}{2}" in saved
    assert "class=\"katex" not in saved
    before = dict(files)
    page.reload(wait_until="domcontentloaded")
    expect(surface.locator('[data-slide-math]')).to_have_count(7)
    page.wait_for_timeout(500)
    assert files == before, "reopening changed source"
    page.screenshot(path=str(evidence / "reopened.png"))
    view.get_by_role("button", name="放映", exact=True).click()
    view.get_by_role("menuitem", name="放映", exact=True).click()
    page.wait_for_timeout(600)
    page.screenshot(path=str(evidence / "presentation.png"))
    frame = page.frames[1]
    fullscreen = frame.evaluate("!!document.fullscreenElement")
    assert fullscreen, "presentation did not enter actual fullscreen"
    assert view.locator('[data-slide-math]:visible').count() >= 7
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)
    for label, filename in [("PowerPoint，保留当前字体（.pptx）", "sample.pptx"), ("网页（.html）", "sample.html"), ("PDF（.pdf）", "sample.pdf")]:
        print("EXPORT", filename, flush=True)
        view.get_by_role("button", name="下载", exact=True).click()
        with page.expect_download(timeout=45_000) as download_event:
            view.get_by_role("menuitem", name=label, exact=True).click()
            if filename.endswith(".pdf"):
                view.get_by_test_id("pdf-options-dialog").get_by_role("button", name="下载", exact=True).click()
        download_event.value.save_as(evidence / filename)
        page.wait_for_timeout(300)
        notes_close = view.get_by_role("button", name="知道了", exact=True)
        if notes_close.count(): notes_close.click()
    assert not errors, errors
    evidence.joinpath("saved-files.json").write_text(json.dumps({p:v.decode() for p,v in files.items()}, ensure_ascii=False, indent=2))
    page.close()
    return {"mathCount":count,"errors":errors,"fullscreen":fullscreen,"bounds":bounds,"publishes":len(publishes),"sourcePreserved":True,"fonts":fonts,"requests":requests}

def inspect_exports(browser):
    evidence = ROOT / "docs/evidence/issue-631"
    html = evidence.joinpath("sample.html").read_text()
    assert 'data-slide-math' in html
    assert 'data:font/' in html or 'data:application/' in html
    assert not re.search(r'url\([\"\']?/artifact-editor/slides-assets/KaTeX_', html), "HTML still needs editor fonts"
    page = browser.new_page(viewport={"width":1280,"height":900})
    remote = []
    page.route("**/*", lambda route: route.fulfill(body=html, content_type="text/html") if route.request.url == "https://export.test/sample.html" else (remote.append(route.request.url), route.abort()))
    page.goto("https://export.test/sample.html", wait_until="domcontentloaded")
    expect(page.locator('[data-slide-math]')).to_have_count(10)
    page.wait_for_timeout(600)
    page.screenshot(path=str(evidence / "html.png"))
    page.keyboard.press("ArrowRight")
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(500)
    long = page.locator('.deck-slide').nth(2).locator('[data-slide-math]')
    dimensions = long.evaluate_all("els=>els.map(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight}))")
    assert all(n['scrollWidth'] <= n['width']+1 for n in dimensions), dimensions
    content_bounds = long.evaluate_all("""els=>els.map(el=>{
        const container=el.closest('[data-text-path], [data-cell]'), rect=container.getBoundingClientRect(), css=getComputedStyle(container);
        const scale=rect.width/container.offsetWidth, left=rect.left+(parseFloat(css.paddingLeft)||0)*scale, right=rect.right-(parseFloat(css.paddingRight)||0)*scale;
        return [...el.querySelectorAll('.katex-html > .base')].every(base=>{const b=base.getBoundingClientRect();return b.left>=left-1&&b.right<=right+1});
    })""")
    assert all(content_bounds), content_bounds
    page.screenshot(path=str(evidence / "long-wrapped.png"))
    assert not remote, remote
    page.close()
    ns = {"a":"http://schemas.openxmlformats.org/drawingml/2006/main","p":"http://schemas.openxmlformats.org/presentationml/2006/main"}
    with zipfile.ZipFile(evidence / "sample.pptx") as archive:
        root = ET.fromstring(archive.read("ppt/slides/slide1.xml"))
        assert len(root.findall('.//p:pic',ns)) == 1
        assert not root.findall('.//a:t',ns), "formula slide leaked source text into native runs"
        image = next(name for name in archive.namelist() if name.startswith('ppt/media/') and name.endswith('.png'))
        evidence.joinpath('pptx-page1.png').write_bytes(archive.read(image))
        assert 'Synthetic math fixture' in archive.read('ppt/notesSlides/notesSlide1.xml').decode()
        assert 'Plain native text' in archive.read('ppt/slides/slide2.xml').decode()
    subprocess.run(["pdftoppm","-f","1","-singlefile","-scale-to","1200","-png",str(evidence/'sample.pdf'),str(evidence/'pdf-page1')], check=True)
    print("PASS actual HTML offline, PPTX packaged picture/notes, PDF rasterization",flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", action="store_true")
    args = parser.parse_args()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
        try:
            result = run(browser, args.baseline)
            if not args.baseline:
                result["readOnlyPreview"] = run(browser, read_only=True)
                inspect_exports(browser)
            result["browser"] = browser.version
            (ROOT / "docs/evidence/issue-631" / ("baseline.json" if args.baseline else "browser.json")).write_text(json.dumps(result,ensure_ascii=False,indent=2))
            print({k:v for k,v in result.items() if k not in ["requests", "bounds"]})
        finally:
            browser.close()
