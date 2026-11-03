"""Focused browser regression; requires the existing Python Playwright and Chrome.

Run npm run build:slides-editor first, then python scripts/check-slides-editor.py.
--upstream reproduces the original first-slide crash instead of testing the fix.
HTTP fixtures exercise the real bundled UI; database/ACL coverage is separate.
"""
import argparse
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
HOST_ORIGIN = "https://app.test"
BASE = "/artifact-editor/slides/test-grant/"


def run(browser, upstream=False, mobile=False):
    editor = ROOT / ("third_party/baoyu-design/upstream/claude-slides/scripts/editor" if upstream else "server/assets/slides-editor")
    files = {"project/deck.json": json.dumps(dict(v=4, lists="css", title="Keep English 用户标题", order=[], sections={}, faces={}, designSystems=[])).encode()}
    if not upstream and not mobile:
        themes = json.loads((ROOT / "third_party/baoyu-design/host/builtin-themes.json").read_text(encoding="utf-8"))
        deck = json.loads(files["project/deck.json"])
        deck["designSystems"] = [dict(namespace=t["namespace"], title=t["title"], artifact="LingxiLoop 内置主题", version="1", copiedAt="2026-11-03T00:00:00Z") for t in themes]
        files["project/deck.json"] = json.dumps(deck).encode()
        for theme in themes:
            files[f"project/ds/{theme['namespace']}/tokens.json"] = json.dumps(theme["tokens"]).encode()
    requests, errors, publishes, failed_responses = [], [], [], []
    page = browser.new_page(viewport={"width": 390 if mobile else 1280, "height": 844 if mobile else 900})
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("response", lambda response: failed_responses.append((response.status, response.url)) if response.status >= 400 else None)

    def sha(data):
        return hashlib.sha256(data).hexdigest()

    def route(request):
        path = request.request.url.split("/", 3)[-1].split("?", 1)[0]
        path = "/" + path
        requests.append(path)
        relative = path.removeprefix(BASE)
        headers = {"Access-Control-Allow-Origin": "*"}
        if path == "/host":
            request.fulfill(body=f'<iframe title="演示文稿编辑器" sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-modals" allow="fullscreen" src="{ORIGIN}{BASE}" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>', content_type="text/html")
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
    page.route(HOST_ORIGIN + "/host", route)
    page.goto(ORIGIN + BASE if upstream else HOST_ORIGIN + "/host", wait_until="domcontentloaded")
    view = page if upstream else page.frame_locator("iframe")
    view.get_by_role("button", name="Add slide" if upstream else "添加幻灯片", exact=True).click()
    if not upstream:
        assert not failed_responses, failed_responses
    if upstream:
        expect(page.get_by_text("Cannot read properties of undefined (reading 'useContext')", exact=True)).to_be_visible()
        print("PASS: upstream first-slide rendering error reproduced")
        page.close()
        return

    layouts = view.get_by_role("group", name="布局", exact=True)
    expect(layouts).to_be_visible()
    expect(layouts.get_by_role("button")).to_have_count(10)
    layouts.get_by_role("button").nth(1).click()
    deadline = time.monotonic() + 10
    while not publishes and time.monotonic() < deadline:
        page.wait_for_timeout(50)
    assert publishes, "first slide did not save"
    deck = json.loads(files["project/deck.json"])
    assert len(deck["order"]) == 1 and deck["title"] == "Keep English 用户标题"
    assert "演示文稿标题" in files[f'project/slides/{deck["order"][0]}.html'].decode()
    assert not any(re.search(r"(?:pptx-library|video-worker-source|woff2-decoder)-", path) for path in requests), requests
    page.reload(wait_until="domcontentloaded")
    expect(view.get_by_text("演示文稿标题", exact=True).first).to_be_visible()
    assert not errors, errors
    if mobile:
        view.get_by_role("button", name="显示幻灯片缩略图", exact=True).click()
        view.get_by_role("button", name="添加幻灯片", exact=True).click()
        expect(view.get_by_role("group", name="布局", exact=True)).to_be_visible()
        assert not errors, errors
        assert not failed_responses, failed_responses
        print("PASS: mobile create, save, reload and reopen layout dialog")
        page.close()
        return

    view.get_by_role("button", name="属性", exact=True).click()
    view.get_by_role("tab", name="主题", exact=True).click()
    expect(view.get_by_role("button", name="设计系统：", exact=False)).to_be_visible()
    expect(view.get_by_text("Original look", exact=True)).to_have_count(0)
    view.get_by_role("button", name="设计系统：", exact=False).click()
    for title in ["学术蓝", "森林课堂", "深色演示"]:
        expect(view.get_by_role("button", name=title, exact=True)).to_be_visible()
    page.screenshot(path=str(ROOT / "docs/evidence/issue-648/slides-chinese.png"))
    view.get_by_role("button", name="森林课堂", exact=True).click()
    deadline = time.monotonic() + 10
    while "forest-classroom" not in json.dumps(json.loads(files["project/deck.json"]).get("style")) and time.monotonic() < deadline:
        page.wait_for_timeout(50)
    assert "forest-classroom" in json.dumps(json.loads(files["project/deck.json"]).get("style")), "theme selection was not saved"
    expect(view.get_by_role("button", name="设计系统：森林课堂", exact=False)).to_be_visible()
    view.get_by_role("button", name="关闭面板", exact=True).click()

    view.get_by_role("button", name="下载", exact=True).click()
    with page.expect_download(timeout=60_000) as download_event:
        view.get_by_role("menuitem", name="PowerPoint，使用通用字体（.pptx）", exact=False).click()
    download = download_event.value
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "deck.pptx"
        download.save_as(path)
        with zipfile.ZipFile(io.BytesIO(path.read_bytes())) as archive:
            assert "ppt/slides/slide1.xml" in archive.namelist()
            assert "演示文稿标题" in archive.read("ppt/slides/slide1.xml").decode()
    assert any("pptx-library-" in path for path in requests), "PPTX library did not load on demand"
    assert not any("video-worker-source-" in path for path in requests), "video encoder loaded without a video"
    view.get_by_role("button", name="下载", exact=True).click()
    view.get_by_role("menuitem", name="PDF（.pdf）", exact=False).click()
    dialog = view.get_by_test_id("pdf-options-dialog")
    expect(dialog).to_be_visible()
    with page.expect_download(timeout=60_000) as pdf_event:
        dialog.get_by_role("button", name="下载", exact=True).click()
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "deck.pdf"
        pdf_event.value.save_as(path)
        assert path.read_bytes().startswith(b"%PDF-"), "PDF confirm did not produce a PDF"
    assert not errors, errors
    assert not failed_responses, failed_responses
    print("PASS: desktop create, save, reload, Chinese theme, lazy PPTX and explicit PDF confirm; no HTTP errors")
    page.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--upstream", action="store_true")
    args = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        try:
            run(browser, upstream=args.upstream)
            if not args.upstream:
                run(browser, mobile=True)
        finally:
            browser.close()
