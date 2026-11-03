"""Built Design startup/edit regression with deterministic API fixtures.

Run npm run build:design-editor first. Requires Python Playwright and Chrome.
This checks browser compatibility, not production authentication or persistence.
"""
import base64
import hashlib
import json
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Error, expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "https://design.test"
BASE = "/artifact-editor/design/test-grant/"


def run(browser, read_only=False):
    editor = ROOT / "server/assets/design-editor"
    themes = json.loads((ROOT / "third_party/baoyu-design/host/builtin-themes.json").read_text(encoding="utf-8"))
    builtin = json.loads((ROOT / "third_party/baoyu-design/slides-source/builtin-style.json").read_text(encoding="utf-8"))
    themes.insert(0, dict(namespace=builtin["namespace"], title="Claude 经典", source=builtin["source"], version=builtin["version"], tokens=builtin["tokens"]))
    canvas = dict(v=3, title="Upgrade fixture", launch={"view": "canvas"}, pages=[],
                  boards={"Main.dc.html": dict(x=0, y=0, w=720, h=480)},
                  order=["Main.dc.html"], notes={}, designSystems=[dict(namespace=t["namespace"], title=t["title"], artifact=t["source"], version=t["version"], copiedAt="2026-11-03T00:00:00Z") for t in themes])
    board = r'<html><head><script src="./support.js"></script></head><body><x-dc><h1>Upgrade fixture</h1><p>\(x^2\)</p></x-dc></body></html>'
    files = {"project/canvas.json": json.dumps(canvas).encode(), "project/Main.dc.html": board.encode()}
    for theme in themes:
        files[f"project/ds/{theme['namespace']}/tokens.json"] = json.dumps(theme["tokens"]).encode()
    errors, failed_responses, requests, publishes = [], [], [], []
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("response", lambda response: failed_responses.append((response.status, response.url)) if response.status >= 400 else None)

    def sha(data):
        return hashlib.sha256(data).hexdigest()

    def route(request):
        path = urlparse(request.request.url).path
        requests.append(path)
        relative = path.removeprefix(BASE)
        if path.startswith("/artifact-editor/design-assets/"):
            relative = "assets/" + path.rsplit("/", 1)[1]
        if relative == "_files.json":
            body = json.dumps(dict(ver="fixture", files={name: dict(sha256=sha(data), size=len(data)) for name, data in files.items()}))
            content_type = "application/json"
        elif relative == "__deck/session":
            body, content_type = json.dumps(dict(canEdit=not read_only)), "application/json"
        elif relative == "__deck/publish":
            assert not read_only, "read-only editor tried to publish"
            batch = request.request.post_data_json["files"]
            shas = {}
            for name, entry in batch.items():
                if entry and "ifMatch" in entry:
                    assert entry["ifMatch"] == (sha(files[name]) if name in files else None), name
                if entry is None or entry.get("delete"):
                    files.pop(name, None)
                else:
                    files[name] = base64.b64decode(entry["base64"])
                    shas[name] = sha(files[name])
            publishes.append(batch)
            body, content_type = json.dumps(dict(version="saved", shas=shas)), "application/json"
        elif relative == "__comments":
            body, content_type = '{"threads":[],"agent":{"available":false},"me":{"name":"Fixture"}}', "application/json"
        elif relative in ("__deck/events", "__comments/events"):
            body, content_type = ": connected\n\n", "text/event-stream"
        elif relative in files:
            body, content_type = files[relative], "application/json" if relative.endswith(".json") else "text/html"
        else:
            file = editor / (relative or "index.html")
            if not file.is_file():
                request.fulfill(status=404)
                return
            body = file.read_bytes()
            content_type = {".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2"}.get(file.suffix, "text/html")
            if file.name == "index.html":
                body = body.decode().replace("__LINGXI_DESIGN_ASSET_ORIGIN__", ORIGIN)
        request.fulfill(body=body, content_type=content_type)

    page.route(ORIGIN + "/**", route)
    page.goto(ORIGIN + BASE, wait_until="domcontentloaded")
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            artboard = next((frame for frame in page.frames if frame.locator("h1").count() and frame.locator(".katex").count()), None)
        except Error as error:
            if "detached" not in str(error):
                raise
            artboard = None
        if artboard:
            break
        page.wait_for_timeout(100)
    else:
        raise AssertionError(f"Design artboard/math did not mount: {errors}, {failed_responses}")
    assert not publishes, "opening rewrote the saved source"
    if not read_only:
        page.get_by_role("button", name="属性", exact=True).click()
        page.get_by_role("tab", name="主题", exact=True).click()
        expect(page.get_by_test_id("dc-theme-tab")).to_be_visible()
        expect(page.get_by_text("Original look", exact=True)).to_have_count(0)
        expect(page.get_by_role("button", name="Page 1, pages", exact=True)).to_have_count(0)
        for theme in themes:
            assert BASE + f"project/ds/{theme['namespace']}/tokens.json" in requests
        expect(page.get_by_test_id("dc-theme-system-link")).to_have_count(0)
        page.get_by_test_id("dc-theme-tab").get_by_role("button").filter(has_text="原始外观").click()
        for title in ["Claude 经典", "Ember, Light", "Ember, Dark", "Seazar, Light", "Seazar, Dark", "Seazar, High contrast"]:
            expect(page.get_by_role("button", name=title, exact=True)).to_be_visible()
        page.screenshot(path=str(ROOT / "docs/evidence/issue-648/design-chinese.png"))
        page.get_by_role("button", name="Claude 经典", exact=True).click()
        expect(page.get_by_test_id("dc-theme-tab").get_by_role("button").filter(has_text="Claude 经典")).to_be_visible()
        page.get_by_role("button", name="属性", exact=True).click()
        artboard.locator("h1").dblclick()
        heading = artboard.locator('h1[contenteditable="true"]')
        expect(heading).to_be_visible()
        heading.fill("Upgrade saved")
        page.keyboard.press("Escape")
        deadline = time.monotonic() + 10
        while b"Upgrade saved" not in files["project/Main.dc.html"] and time.monotonic() < deadline:
            page.wait_for_timeout(50)
        assert b"Upgrade saved" in files["project/Main.dc.html"], "edit did not publish"
    else:
        assert not artboard.locator('[contenteditable="true"]').count()
    assert not errors, errors
    assert not failed_responses, failed_responses
    assert not any(any(part in path for part in ("__share", "__history", "__presence", "__ds", "agent/requests")) for path in requests), requests
    print(f"PASS: Design {'read-only' if read_only else 'editable/save'} startup, math, no failed HTTP responses or unported routes")
    page.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        try:
            run(browser)
            run(browser, read_only=True)
        finally:
            browser.close()
