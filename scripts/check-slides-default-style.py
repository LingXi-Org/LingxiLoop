"""Real opaque Slides editor with deterministic API fixtures. Build editor first.
No production authentication, database or deployment is exercised.
"""
import argparse
import subprocess
import shutil
import xml.etree.ElementTree as ET
import base64
import hashlib
import io
import json
from pathlib import Path
import re
import tempfile
import time
import zipfile

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "https://slides.test"
BASE = "/artifact-editor/slides/test-grant/"


def run(browser, legacy=False):
    upstream = False
    mobile = False
    evidence = ROOT / "docs/evidence/issue-621"
    evidence.mkdir(parents=True, exist_ok=True)
    editor = ROOT / ("third_party/baoyu-design/upstream/claude-slides/scripts/editor" if upstream else "server/assets/slides-editor")
    if legacy == "custom":
        initial = {"project/deck.json": json.dumps(dict(v=4, lists="css", title="Historical custom", order=["history"], sections={}, faces={}, designSystems=[])), "project/slides/history.html": '<section id="history" style="background:#123456"><h1 style="font-family:Georgia;font-size:72px;color:#fedcba">Historical custom 文稿</h1></section>'}
    elif legacy:
        initial = {"project/deck.json": json.dumps(dict(v=4, lists="css", title="Legacy", order=[], sections={}, faces={}, designSystems=[]))}
    else:
        result = subprocess.check_output(["node", "--import", "tsx", "--input-type=module", "-e", "import {ARTIFACT_KIND_DEFINITIONS as k} from './server/src/modules/artifacts/kinds.ts'; console.log(JSON.stringify({'project/deck.json':JSON.stringify(k.slides.initialIndex('Slides 风格验收','2026-11-02T00:00:00.000Z')),...Object.fromEntries(Object.entries(k.slides.initialResources).map(([p,v])=>[p,JSON.stringify(v)]))}))"], cwd=ROOT)
        initial = json.loads(result)
    files = {path: value.encode() for path, value in initial.items()}
    requests, errors, publishes = [], [], []
    page = browser.new_page(viewport={"width": 390 if mobile else 1280, "height": 844 if mobile else 900})
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
            body, content_type = '{"canEdit":true}', "application/json"
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
    page.goto(ORIGIN + (BASE if upstream else "/host"), wait_until="domcontentloaded")
    view = page if upstream else page.frame_locator("iframe")
    if legacy == "custom":
        expect(view.get_by_text("Historical custom 文稿", exact=True).first).to_be_visible()
        page.wait_for_timeout(800)
        assert {p:v.decode() for p,v in files.items()} == initial
        assert not publishes and not errors
        page.screenshot(path=str(evidence / "legacy-custom.png"))
        page.close()
        return {"unchanged": True, "publishes":len(publishes), "errors":errors}

    def add(index):
        print("ADD", legacy, index, flush=True)
        previous = len(json.loads(files["project/deck.json"])["order"])
        view.get_by_role("button", name="添加幻灯片", exact=True).click()
        layouts = view.get_by_role("group", name="布局", exact=True)
        expect(layouts).to_be_visible()
        layouts.get_by_role("button").nth(index).click()
        deadline = time.monotonic() + 15
        while len(json.loads(files["project/deck.json"])["order"]) <= previous and time.monotonic() < deadline:
            page.wait_for_timeout(100)
        assert len(json.loads(files["project/deck.json"])["order"]) == previous + 1
        page.wait_for_timeout(400)

    add(0)  # first blank, then title/body/two-column must still inherit
    add(1)
    surface = view.locator('[data-slides-editor] [style*="width: 1920px"][style*="background:"]').first
    expect(surface).to_be_visible()
    measured = surface.evaluate("""el => ({background:getComputedStyle(el).backgroundColor,text:[...el.querySelectorAll('[style]')].filter(n=>n.style.fontFamily).map(n=>({text:n.textContent,font:getComputedStyle(n).fontFamily,size:getComputedStyle(n).fontSize,weight:getComputedStyle(n).fontWeight,color:getComputedStyle(n).color}))})""")
    page.screenshot(path=str(evidence / ("legacy.png" if legacy else "title.png")))
    if legacy:
        assert measured["background"] == "rgb(255, 255, 255)", measured
        assert "helvetica" in json.dumps(measured).lower(), measured
        page.close()
        return {"legacy": measured, "errors": errors}
    assert measured["background"] == "rgb(245, 244, 237)", measured
    assert any("Georgia" in n["font"] for n in measured["text"]), measured
    add(3)
    add(5)
    page.screenshot(path=str(evidence / "two-column.png"))
    before = dict(files)
    page.reload(wait_until="domcontentloaded")
    expect(view.get_by_text("左栏正文。", exact=True).first).to_be_visible()
    page.wait_for_timeout(800)
    assert files == before, "opening a saved deck rewrote files"
    evidence.joinpath("saved-files.json").write_text(json.dumps({p:v.decode() for p,v in files.items()}, ensure_ascii=False, indent=2))
    page.screenshot(path=str(evidence / "reopened.png"))

    # Native restyling deliberately keeps existing non-Latin text families.
    # Exercise an actual Latin heading for the font change, while retaining
    # the Chinese template/inheritance checks below.
    view.get_by_label(re.compile(r"第\s*4\s*页.*对比")).click()
    heading = view.locator('[data-slides-editor] [data-text-path]').first
    heading.dblclick()
    editable = view.locator('[contenteditable="true"]').first
    expect(editable).to_be_visible()
    editable.fill('Native styled heading')
    page.keyboard.press('Escape')
    view.get_by_role("button", name="属性", exact=True).first.click()
    view.get_by_role("tab", name="主题", exact=True).click()
    expect(view.get_by_text("Claude 经典", exact=True).first).to_be_visible()
    page.screenshot(path=str(evidence / "theme.png"))
    view.get_by_role("button", name="关闭面板", exact=True).click()

    for label, filename in [("网页（.html）", "sample.html"), ("PowerPoint，保留当前字体（.pptx）", "sample.pptx"), ("PDF（.pdf）", "sample.pdf")]:
        view.get_by_role("button", name="下载", exact=True).click()
        with page.expect_download(timeout=90_000) as download_event:
            view.get_by_role("menuitem", name=label, exact=True).click()
            if filename.endswith(".pdf"):
                page.wait_for_timeout(600)
                page.screenshot(path=str(evidence / "pdf-options.png"))
                view.get_by_test_id("pdf-options-dialog").get_by_role("button", name="下载", exact=True).click()
        download_event.value.save_as(evidence / filename)
        page.wait_for_timeout(300)
    view.get_by_role("button", name="属性", exact=True).first.click()
    view.get_by_role("tab", name="主题", exact=True).click()
    view.get_by_role("button", name="标题, Georgia", exact=True).click()
    view.get_by_role("button", name="字体：Georgia", exact=True).click()
    view.get_by_role("menuitemradio", name="Helvetica", exact=True).click()
    view.get_by_text("颜色", exact=True).click()
    view.get_by_role("button", name=re.compile(r"^背景：")).click()
    view.get_by_role("button", name="oat", exact=True).click()
    page.keyboard.press("Escape")
    view.get_by_role("button", name="关闭面板", exact=True).click()
    expect(view.get_by_text('Native styled heading',exact=True).last).to_have_css('font-family',re.compile('Helvetica'))
    add(3)
    assert 'Helvetica' in json.loads(files['project/deck.json'])['style'][0]['fonts']
    current = surface.evaluate("""el => ({background:getComputedStyle(el).backgroundColor,fonts:[...el.querySelectorAll('[style]')].filter(n=>n.style.fontFamily).map(n=>getComputedStyle(n).fontFamily)})""")
    assert current["background"] == "rgb(227, 218, 204)", current
    assert any("Georgia" in family for family in current["fonts"]), current  # native non-Latin family protection
    page.screenshot(path=str(evidence / "edited-inheritance.png"))
    changed = dict(files)
    page.reload(wait_until="domcontentloaded")
    expect(view.get_by_text("演示文稿标题", exact=True).first).to_be_visible()
    page.wait_for_timeout(700)
    assert files == changed, "reopening after theme edits rewrote saved style"
    evidence.joinpath("edited-files.json").write_text(json.dumps({p:v.decode() for p,v in files.items()}, ensure_ascii=False, indent=2))
    assert not errors, errors
    return {"edited":current, "title": measured, "files":list(files), "publishes":len(publishes), "errors":errors, "requests":requests}


def inspect_exports(browser):
    evidence = ROOT / "docs/evidence/issue-621"
    ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
    pptx = {}
    with zipfile.ZipFile(evidence / "sample.pptx") as archive:
        for index in range(1, 5):
            name = f"ppt/slides/slide{index}.xml"
            root = ET.fromstring(archive.read(name))
            pptx[name] = {
                "colors": sorted(set(n.get("val") for n in root.findall(".//a:srgbClr", ns))),
                "fonts": sorted(set(n.get("typeface") for n in root.findall(".//a:latin", ns))),
                "sizes": sorted(set(n.get("sz") for n in root.findall(".//a:rPr", ns))),
                "text": [n.text for n in root.findall(".//a:t", ns)],
            }
        assert "F5F4ED" in pptx["ppt/slides/slide2.xml"]["colors"]
        assert "Georgia" in pptx["ppt/slides/slide2.xml"]["fonts"]
        assert "演示文稿标题" in pptx["ppt/slides/slide2.xml"]["text"]
    (evidence / "export-inspection.json").write_text(json.dumps(pptx, ensure_ascii=False, indent=2))
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.route("https://export.test/**", lambda route: route.fulfill(body=(evidence / "sample.html").read_text(), content_type="text/html"))
    page.goto("https://export.test/sample.html", wait_until="domcontentloaded")
    page.wait_for_timeout(300)
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(500)
    expect(page.locator(".deck-pager")).to_have_text("2 / 4")
    page.screenshot(path=str(evidence / "html-page2.png"))
    measured = page.locator(".deck-slide").nth(1).evaluate("""el => ({text:el.innerText,fonts:[...el.querySelectorAll('[style]')].filter(n=>n.style.fontFamily).map(n=>({font:getComputedStyle(n).fontFamily,size:getComputedStyle(n).fontSize}))})""")
    assert "演示文稿标题" in measured["text"]
    assert any("Georgia" in n["font"] for n in measured["fonts"])
    (evidence / "html-inspection.json").write_text(json.dumps(measured, ensure_ascii=False, indent=2))
    page.close()
    if shutil.which("pdftoppm"):
        subprocess.run(["pdftoppm", "-f", "2", "-singlefile", "-scale-to", "1200", "-png", str(evidence / "sample.pdf"), str(evidence / "pdf-page2")], check=True)


if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
        try:
            result = {"browser":browser.version, "baseline":run(browser, legacy=True), "historical":run(browser, legacy="custom"), "styled":run(browser)}
            inspect_exports(browser)
            (ROOT / "docs/evidence/issue-621/browser.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
            print("PASS: baseline, historical preservation, default style, edited inheritance, reload and three actual exports")
        finally:
            browser.close()
