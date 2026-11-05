"""Full authenticated product benchmark; no request interception or product-state injection.

Requires private arm JSON from native-artifact-serve.mjs and real product services.
Ten alternating pairs qualify cold full-navigation gates. Workbench-open timings
are separate observations. Run --diagnostic first; it never produces qualification.
No arm credentials, source text, prompts, raw browser exceptions or URL queries
are written to the public report. --self-check exercises only pure data helpers.
"""
import argparse
import base64
import hashlib
import json
import math
import os
from html.parser import HTMLParser
import platform
import re
import subprocess
import tempfile
import threading
import time
import zipfile
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

MODES = ("fullNavigation", "workbenchOpen")
KINDS = ("design", "slides")
FORMATS = ("html", "pdf", "pptx")
MARKER = " ✓"


class MeasurementFailure(RuntimeError):
    def __init__(self, code, observations=None):
        self.code = code
        self.observations = observations
        super().__init__(code)


def safe_url(raw):
    """Route class plus one-way resource identity; never return raw credentials or names."""
    try:
        parts = urlsplit(raw)
        if parts.scheme not in ("http", "https"):
            return (parts.scheme if parts.scheme in ("blob", "data", "about") else "other") + ":<redacted>"
        route = "/resource"
        if re.search(r"/artifact-editor/(design|slides)-assets/", parts.path):
            route = re.search(r"/artifact-editor/(?:design|slides)-assets", parts.path)[0]
        elif re.search(r"/artifact-editor/(design|slides)/", parts.path):
            route = "/artifact-editor/" + re.search(r"/artifact-editor/(design|slides)/", parts.path)[1] + "/<grant>"
        elif parts.path.startswith("/api/artifacts/"):
            route = "/api/artifacts/<artifact>"
        elif parts.path.startswith("/_blob/"):
            route = "/_blob/<capability>"
        elif parts.path.startswith("/assets/"):
            route = "/assets"
        extension = re.search(r"\.(js|mjs|cjs|html|json|css|png|woff2?|ttf)$", parts.path)
        digest = hashlib.sha256(parts.path.encode()).hexdigest()[:16]
        return "https://<host>" + route + "/" + digest + ("." + extension[1] if extension else "")
    except (ValueError, TypeError):
        return "<invalid-url>"


def failure_code(error):
    if isinstance(error, MeasurementFailure):
        return error.code
    if isinstance(error, (OSError, subprocess.SubprocessError)):
        return "process_or_filesystem_error"
    if type(error).__name__ == "TimeoutError":
        return "browser_timeout"
    return "browser_or_measurement_error"


def script_request(row):
    return bool(row.get("network") and (row.get("type") == "Script" or row.get("scriptPath")
                or re.search(r"(?:java|ecma)script", row.get("mime") or "", re.I)))


def script_totals(rows):
    scripts = [row for row in rows if script_request(row)]
    return {"transferredBytes": sum(row.get("transferredBytes", 0) for row in scripts),
            "decodedBytes": sum(row.get("decodedBytes", 0) for row in scripts),
            "requests": len(scripts), "inflight": sum(not row.get("finished") for row in scripts),
            "missingDecoded": sum(row.get("finished") and not row.get("decodedObserved")
                                  and 200 <= row.get("status", 0) < 300 and row.get("declaredEncodedBodyBytes") != 0 for row in scripts)}


def script_delta(before, after):
    a, b = script_totals(before), script_totals(after)
    return {key: b[key] - a[key] for key in ("transferredBytes", "decodedBytes", "requests")}


class Trace:
    """CDP attaches before navigation and applies the same limits to iframe/Worker targets."""
    def __init__(self, context, page):
        self.cdp = context.new_cdp_session(page)
        self.requests, self.targets, self.errors, self.pending = {}, {}, [], {}
        self.sequence = 0
        self.request_sequence = 0
        for method in ("requestWillBeSent", "responseReceived", "dataReceived", "loadingFinished", "loadingFailed"):
            self.cdp.on("Network." + method, lambda params, name=method: self.event("", name, params))
        self.cdp.on("Target.attachedToTarget", lambda value: self.attach("", value))
        self.cdp.on("Target.detachedFromTarget", lambda value: self.detach("", value))
        self.cdp.on("Target.receivedMessageFromTarget", lambda value: self.message("", value))
        self.configure("")

    def send(self, route, method, params=None):
        if not route:
            return self.cdp.send(method, params or {})
        self.sequence += 1
        command_id = self.sequence
        self.pending[(route, command_id)] = method
        parent, _, child = route.rpartition("/")
        self.send(parent, "Target.sendMessageToTarget", {"sessionId": child,
                  "message": json.dumps({"id": command_id, "method": method, "params": params or {}})})
        return command_id

    def configure(self, route):
        for method, params in (
            ("Network.enable", {}), ("Network.setCacheDisabled", {"cacheDisabled": True}),
            ("Network.emulateNetworkConditions", {"offline": False, "latency": 20,
             "downloadThroughput": 500000, "uploadThroughput": 375000}),
        ):
            self.send(route, method, params)
        if not route or self.targets[route]["type"] in ("page", "iframe"):
            self.send(route, "Emulation.setCPUThrottlingRate", {"rate": 1})
        self.send(route, "Target.setAutoAttach", {"autoAttach": True, "waitForDebuggerOnStart": True, "flatten": False})
        self.send(route, "Runtime.runIfWaitingForDebugger")

    def attach(self, parent, value):
        route = (parent + "/" if parent else "") + value["sessionId"]
        self.targets[route] = {"type": value["targetInfo"]["type"], "active": True}
        self.configure(route)

    def detach(self, parent, value):
        route = (parent + "/" if parent else "") + value["sessionId"]
        for target in self.targets:
            if target == route or target.startswith(route + "/"):
                self.targets[target]["active"] = False
        for key in list(self.pending):
            if key[0] == route or key[0].startswith(route + "/"):
                del self.pending[key]

    def message(self, parent, value):
        route = (parent + "/" if parent else "") + value["sessionId"]
        message = json.loads(value["message"])
        command = self.pending.pop((route, message.get("id")), None)
        if "error" in message:
            self.errors.append({"targetType": self.targets.get(route, {}).get("type", "unknown"),
                                "command": command, "code": message["error"].get("code")})
        method, params = message.get("method", ""), message.get("params", {})
        if method == "Target.attachedToTarget": self.attach(route, params)
        elif method == "Target.detachedFromTarget": self.detach(route, params)
        elif method == "Target.receivedMessageFromTarget": self.message(route, params)
        elif method.startswith("Network."): self.event(route, method[8:], params)

    def event(self, route, method, value):
        key = route + ":" + value.get("requestId", "")
        if method == "requestWillBeSent":
            # Preserve redirected transfers instead of overwriting them.
            if key in self.requests and value.get("redirectResponse"):
                old = self.requests.pop(key)
                old.update(finished=True, status=value["redirectResponse"]["status"])
                self.requests[key + ":redirect:" + str(len(self.requests))] = old
            url = urlsplit(value["request"]["url"])
            self.request_sequence += 1
            self.requests[key] = {"url": safe_url(value["request"]["url"]), "type": value.get("type"),
                "start": value["timestamp"], "startEpochMs": value.get("wallTime", 0) * 1000, "requestOrdinal": self.request_sequence, "targetType": self.targets.get(route, {}).get("type", "page"),
                "network": url.scheme in ("http", "https"), "scriptPath": bool(re.search(r"\.(?:m?js|cjs)$", url.path)),
                "sourcePayload": bool(re.search(r"/artifact-editor/(?:design|slides)/[^/]+/project/.*\.(?:html|jsx)$", url.path)),
                "retiredEditor": bool(re.search(r"/artifact-editor/(?:design|slides)-assets/", url.path))}
        elif key in self.requests:
            row = self.requests[key]
            if method == "responseReceived":
                response = value["response"]
                headers = {key.lower(): value for key, value in response["headers"].items()}
                declared_length = headers.get("content-length")
                if isinstance(declared_length, str) and declared_length.isdigit(): row["declaredEncodedBodyBytes"] = int(declared_length)
                row.update(status=response["status"], cache=response.get("fromDiskCache", False),
                           mime=response.get("mimeType"), encoding=headers.get("content-encoding") if headers.get("content-encoding") in ("gzip", "br", "deflate", "zstd") else "identity",
                           transferredBytes=response.get("encodedDataLength", 0))
            elif method == "dataReceived":
                row["transferredBytes"] = row.get("transferredBytes", 0) + value.get("encodedDataLength", 0)
                row["decodedBytes"] = row.get("decodedBytes", 0) + value.get("dataLength", 0)
                row["decodedObserved"] = True
                row["decodedBytesSource"] = "Network.dataReceived"
            elif method == "loadingFinished":
                row.update(finished=True, end=value["timestamp"], transferredBytes=value["encodedDataLength"])
            elif method == "loadingFailed":
                row.update(finished=True, failed=True, canceled=value.get("canceled", False))

    def snapshot(self):
        return [dict(row) for row in self.requests.values()]

    def inflight(self):
        return [row for row in self.requests.values() if row["network"] and not row.get("finished")
                and row.get("type") not in ("WebSocket", "EventSource") and row.get("mime") != "text/event-stream"]

    def reconcile_decoded(self, page):
        # Cached requests can omit dataReceived. Use measured ResourceTiming,
        # never Content-Length/gzip estimates or downloaded source bodies.
        entries = []
        for frame in page.frames:
            try:
                entries.extend(frame.evaluate("() => performance.getEntriesByType('resource').filter(row=>row.decodedBodySize>0).map(row=>({url:row.name,epochMs:performance.timeOrigin+row.startTime,decodedBytes:row.decodedBodySize}))"))
            except Exception: pass
        for row in self.requests.values():
            if not script_request(row) or row.get('decodedObserved') or not row.get('finished'): continue
            matches = [entry for entry in entries if safe_url(entry['url']) == row['url'] and abs(entry['epochMs'] - row['startEpochMs']) < 100]
            if len(matches) == 1:
                row.update(decodedBytes=matches[0]['decodedBytes'], decodedObserved=True, decodedBytesSource='PerformanceResourceTiming')

    def reconcile_snapshot(self, snapshot):
        current = {row['requestOrdinal']: row for row in self.requests.values()}
        for row in snapshot:
            observed = current.get(row['requestOrdinal'], {})
            if row.get('finished') and not row.get('decodedObserved') and observed.get('decodedObserved'):
                row.update(decodedBytes=observed['decodedBytes'], decodedObserved=True, decodedBytesSource=observed['decodedBytesSource'])

    def forced_gc(self, page):
        before = len(self.errors)
        routes = [""] + [route for route, target in self.targets.items() if target["active"]
                          and target["type"] in ("page", "iframe", "worker", "service_worker")]
        failed = 0
        for route in routes:
            try: self.send(route, "HeapProfiler.collectGarbage")
            except Exception: failed += 1
        deadline = time.monotonic() + 10
        while any(method == "HeapProfiler.collectGarbage" for method in self.pending.values()) and time.monotonic() < deadline:
            page.wait_for_timeout(50)
        failed += sum(method == "HeapProfiler.collectGarbage" for method in self.pending.values()) + len(self.errors) - before
        return {"status": "observed" if not failed else "incomplete", "targets": len(routes), "failedTargets": failed}


def process_pss(root_pid):
    parents = {}
    for path in Path("/proc").glob("[0-9]*/stat"):
        try:
            rest = path.read_text().rsplit(")", 1)[1].split()
            parents[int(path.parent.name)] = int(rest[1])
        except (OSError, ValueError, IndexError): pass
    family = {root_pid}
    while True:
        children = {pid for pid, parent in parents.items() if parent in family}
        if children <= family: break
        family |= children
    total, live, unreadable = 0, 0, 0
    for pid in family:
        try:
            match = re.search(r"^Pss:\s+(\d+) kB$", Path(f"/proc/{pid}/smaps_rollup").read_text(), re.M)
            if match: total += int(match[1]) * 1024; live += 1
            else: unreadable += 1
        except OSError:
            if Path(f"/proc/{pid}").exists(): unreadable += 1
    if unreadable or not live: raise MeasurementFailure("pss_incomplete")
    return {"bytes": total, "processes": live}


class PssSampler:
    """OS-only sampler; the browser interaction thread never calls Playwright here."""
    def __init__(self, pid, interval_ms=100):
        self.pid, self.interval_ms = pid, interval_ms
        self.rows, self.failures = [], 0
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True)

    def run(self):
        started = time.monotonic()
        while not self.stop_event.is_set():
            try: self.rows.append({"elapsedMs": round((time.monotonic() - started) * 1000), **process_pss(self.pid)})
            except MeasurementFailure: self.failures += 1
            self.stop_event.wait(self.interval_ms / 1000)

    def __enter__(self): self.thread.start(); return self
    def __exit__(self, *_): self.stop_event.set(); self.thread.join(timeout=5)
    def report(self):
        return {"intervalMs": self.interval_ms, "samples": self.rows, "failedSamples": self.failures,
                "peakBytes": max((row["bytes"] for row in self.rows), default=None)}


def launch(pw, config, executable):
    directory = tempfile.TemporaryDirectory(prefix="native-artifact-browser-")
    process = browser = context = None
    try:
        command = [executable or pw.chromium.executable_path, "--headless", "--no-sandbox", "--no-first-run",
                   "--no-default-browser-check", "--remote-debugging-port=0", f"--user-data-dir={directory.name}"]
        if config.get("spki"): command.append("--ignore-certificate-errors-spki-list=" + config["spki"])
        process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.monotonic() + 20
        portfile = Path(directory.name) / "DevToolsActivePort"
        while not portfile.exists():
            if time.monotonic() > deadline or process.poll() is not None: raise MeasurementFailure("browser_startup_failed")
            time.sleep(.05)
        browser = pw.chromium.connect_over_cdp("http://127.0.0.1:" + portfile.read_text().splitlines()[0])
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=1, accept_downloads=True)
        context.add_cookies([{**cookie, "url": config["origin"]} for cookie in config["cookies"]])
        page = context.new_page(); page.set_default_timeout(15000)
        return browser, context, page, process, directory
    except Exception:
        close((browser, context, None, process, directory))
        raise


def close(resources):
    if not resources: return
    browser, context, _, process, directory = resources
    try:
        if context: context.close()
        if browser: browser.close()
    except Exception: pass
    finally:
        if process and process.poll() is None:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill(); process.wait()
        if directory: directory.cleanup()


def workbench(config, kind):
    if kind in config.get("workbench", {}): return config["workbench"][kind]
    if kind == "design":
        return {"url": config["shellUrl"], "readySelector": config["shellReadySelector"],
                "openSelector": "[data-design-open-trigger]", "closeSelector": '#conversation-design-panel button[aria-label="关闭设计"]'}
    parts = urlsplit(config["urls"][kind])
    query = [(key, value) for key, value in parse_qsl(parts.query) if key != "deck"]
    return {"url": urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), "")),
            "readySelector": "[data-slides-page]", "openSelector": '[data-artifact-open-trigger="' + config["artifactIds"][kind] + '"]',
            "closeSelector": '[data-testid="artifact-surface"] button[aria-label="返回演示文稿列表"]'}


def wait_quiet(page, trace, minimum_ms, timeout_ms=120000):
    started = time.monotonic(); quiet = None
    while (time.monotonic() - started) * 1000 < timeout_ms:
        elapsed = (time.monotonic() - started) * 1000
        if elapsed >= minimum_ms and not trace.inflight():
            quiet = quiet or time.monotonic()
            if time.monotonic() - quiet >= .8: return
        else: quiet = None
        page.wait_for_timeout(100)
    raise MeasurementFailure("network_did_not_settle")


def pss_observations(page, pid, count=5):
    rows = []
    for _ in range(count): rows.append(process_pss(pid)); page.wait_for_timeout(200)
    return {"bytes": round(sum(row["bytes"] for row in rows) / len(rows)), "observations": rows,
            "spreadBytes": max(row["bytes"] for row in rows) - min(row["bytes"] for row in rows)}


def measure_host(pw, config, kind, args):
    resources = launch(pw, config, args.browser)
    _, context, page, process, _ = resources
    try:
        trace = Trace(context, page); control = workbench(config, kind)
        page.goto(control["url"], wait_until="domcontentloaded", timeout=120000)
        page.locator(control["readySelector"]).first.wait_for(timeout=120000)
        wait_quiet(page, trace, args.host_idle_ms)
        trace.reconcile_decoded(page)
        if trace.errors: raise MeasurementFailure("cdp_setup_failed")
        return {**pss_observations(page, process.pid), "scriptBytes": script_totals(trace.snapshot()),
                "idleWindowMs": args.host_idle_ms, "editorOpened": False}
    finally: close(resources)


READINESS_JS = r"""async (heading, {number, kind}) => {
  const root = heading.closest('[data-page-id],[data-slide-surface],[data-mega-artboard]') || heading.closest('x-dc') || document.body;
  const visible = element => {const r=element.getBoundingClientRect();return r.width>2&&r.height>2&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight&&!element.closest('[hidden],[inert],[aria-hidden="true"]')};
  const images=[...root.querySelectorAll('img')].filter(image=>image.complete&&image.naturalWidth===640&&image.naturalHeight===360&&visible(image));
  const decoded=await Promise.all(images.map(image=>image.decode().then(()=>true,()=>false)));
  const math=[...root.querySelectorAll('.katex,[data-formula-ready="true"]')].filter(visible);
  const styles=[heading,...math.flatMap(element=>[element,...element.querySelectorAll('span')])].map(element=>({font:getComputedStyle(element).font,text:element.textContent?.slice(0,80)||'x'}));
  const fonts=styles.every(({font,text})=>font&&document.fonts.check(font,text));
  return {pageNumber:number,headingMatches:heading.textContent.trim()===`验收页面 ${number}`,headingVisible:visible(heading),
    decodedImages:decoded.filter(Boolean).length,formulaElements:math.length,fontChecks:styles.length,fontsReady:fonts&&document.fonts.status==='loaded'};
}"""


def heading_candidates(frame, kind, number):
    title = re.compile("^" + re.escape(f"验收页面 {number}") + "$")
    if frame.locator("[data-native-artifact-editor]").count():
        return frame.locator(f'[data-page-id="page-{number}"] [data-node-id="page-{number}-heading"]').filter(has_text=title)
    if kind == "slides":
        return frame.locator('[data-slides-editor] [data-slide-surface] [data-text-path], [data-slides-editor] [data-slide-surface] h1').filter(has_text=title)
    return frame.locator('h1').filter(has_text=title)


def ready_heading(page, kind, number, timeout=120):
    deadline = time.monotonic() + timeout
    observations = {"frames": 0, "matchingHeadings": 0}
    while time.monotonic() < deadline:
        observations["frames"] = len(page.frames)
        for frame in page.frames:
            try:
                targets = heading_candidates(frame, kind, number)
                observations["matchingHeadings"] = max(observations["matchingHeadings"], targets.count())
                for index in range(targets.count()):
                    heading = targets.nth(index); box = heading.bounding_box(timeout=150)
                    if not box or box["width"] < 40 or box["height"] < 5 or box["x"] >= 1440 or box["y"] >= 1000 or box["x"] + box["width"] <= 0 or box["y"] + box["height"] <= 0: continue
                    proof = heading.evaluate(READINESS_JS, {"number": number, "kind": kind})
                    observations.update(proof)
                    if not all((proof["headingMatches"], proof["headingVisible"], proof["decodedImages"] > 0, proof["formulaElements"] > 0, proof["fontsReady"])): continue
                    return frame, heading, proof
            except Exception: pass
        page.wait_for_timeout(50)
    raise MeasurementFailure("current_page_media_or_fonts_not_ready", observations)


def wheel_to_control(page, target, rail):
    item, viewport = target.bounding_box(), rail.bounding_box()
    if not item or not viewport: return False
    horizontal = rail.get_attribute('aria-orientation') == 'horizontal'
    axis, size = ('x', 'width') if horizontal else ('y', 'height')
    delta = 0
    if item[axis] < viewport[axis]: delta = item[axis] - viewport[axis] - 12
    elif item[axis] + item[size] > viewport[axis] + viewport[size]:
        delta = item[axis] + item[size] - viewport[axis] - viewport[size] + 12
    if not delta: return False
    rail.hover(); delta = max(-600, min(600, delta))
    page.mouse.wheel(delta if horizontal else 0, 0 if horizontal else delta)
    page.wait_for_timeout(80)
    return True


def navigate(page, kind, number):
    deadline = time.monotonic() + 20; wheel_count = 0
    while time.monotonic() < deadline:
        for frame in page.frames:
            native = frame.locator('.native-page-list')
            if native.count():
                target = frame.locator(f'[data-page-target="page-{number}"]')
                if target.count():
                    if wheel_to_control(page, target.first, native.first): wheel_count += 1; continue
                    target.first.click()
                    target.first.wait_for(state="visible")
                    if target.first.get_attribute("aria-current") != "page":
                        page.wait_for_timeout(50); continue
                    return {"control": "nativePageStrip", "wheelEvents": wheel_count}
                current = native.locator('[data-page-target]').evaluate_all("nodes=>nodes.map(node=>Number(node.dataset.pageTarget.replace('page-','')))")
                native.hover(); delta = -500 if current and number < min(current) else 500
                page.mouse.wheel(delta if native.get_attribute('aria-orientation') == 'horizontal' else 0, 0 if native.get_attribute('aria-orientation') == 'horizontal' else delta)
                wheel_count += 1; page.wait_for_timeout(80)
                break
            native_design = frame.locator('[data-native-artifact-editor="design"][data-current-page]')
            if kind == 'design' and native_design.count():
                current_id = native_design.get_attribute('data-current-page') or ''
                current = int(current_id.replace('page-', '')) if re.fullmatch(r'page-\d+', current_id) else 1
                if current == number: return {"control": "nativeDesignKeyboard", "wheelEvents": wheel_count}
                native_design.focus()
                page.keyboard.press('PageDown' if current < number else 'PageUp')
                page.wait_for_timeout(50)
                continue
            if kind == "slides":
                target = frame.locator(f'[role="option"][data-slide-id="page-{number}"]')
                if target.count():
                    rail = target.first.locator('xpath=ancestor::*[@role="listbox"]').first
                    if rail.count() and wheel_to_control(page, target.first, rail): wheel_count += 1; continue
                    target.first.click(); return {"control": "legacySlidesRail", "wheelEvents": wheel_count}
            else:
                expanded = frame.get_by_test_id('mega-expanded-name')
                if expanded.count() and expanded.first.is_visible():
                    current = re.search(r'Page(\d+)', expanded.first.inner_text())
                    if not current: raise MeasurementFailure('legacy_focused_page_unknown')
                    current_number = int(current[1])
                    if current_number == number: return {"control": "legacyDesignPageKey", "wheelEvents": wheel_count}
                    expanded.first.click()
                    page.keyboard.press('PageDown' if current_number < number else 'PageUp')
                    expected = current_number + (1 if current_number < number else -1)
                    frame.wait_for_function("number => {const name=document.querySelector('[data-testid=mega-expanded-name]')?.textContent;return Number(/Page(\\d+)/.exec(name||'')?.[1])===number}", arg=expected)
                    continue
                target = frame.locator(f'[data-mega-artboard="Page{number}.dc.html"] [data-mega-title-text]')
                if target.count():
                    target.first.dblclick()
                    frame.get_by_test_id('mega-expanded-name').first.wait_for(state='visible')
                    return {"control": "legacyDesignBoard", "wheelEvents": wheel_count}
        page.wait_for_timeout(50)
    raise MeasurementFailure("page_navigation_control_missing")


def save_request_matches(response, artifact_id, marker=None, legacy_prefix=None):
    try:
        request = response.request; path = urlsplit(response.url).path
        if request.method != "POST" or not re.search(r"(?:/__deck/publish|/operations)$", path): return False
        body = request.post_data_json
        if path.endswith('/operations'):
            if f'/artifacts/{artifact_id}/operations' not in path: return False
            return marker is None or marker in json.dumps(body, ensure_ascii=False)
        if not legacy_prefix or not path.startswith(legacy_prefix): return False
        if marker is None: return True
        for item in body.get('files', {}).values():
            if isinstance(item, dict) and isinstance(item.get('base64'), str):
                if marker in base64.b64decode(item['base64']).decode('utf-8', errors='replace'): return True
        return False
    except Exception: return False


def legacy_save_prefix(frame):
    current = frame
    while current:
        match = re.search(r'(/artifact-editor/(?:design|slides)/[^/]+/)', urlsplit(current.url).path)
        if match: return match[1]
        current = current.parent_frame
    return None


def edit_heading(page, frame, heading, trace, artifact_id, number):
    saves = []
    prefix = legacy_save_prefix(frame)
    listener = lambda response: saves.append({"status": response.status, "epochMs": time.time() * 1000, "requests": trace.snapshot()}) if save_request_matches(response, artifact_id, MARKER.strip(), prefix) else None
    page.on("response", listener)
    try:
        heading.dblclick()
        frame.wait_for_function("Boolean(document.activeElement?.isContentEditable)")
        frame.evaluate(r"""({number,marker}) => {
          window.__nativeArtifactInput=null;
          document.addEventListener('beforeinput', event=>{
            const target=event.target,start=performance.now(),before=target.textContent;
            requestAnimationFrame(()=>requestAnimationFrame(()=>{
              const text=target.textContent,painted=performance.now();
              window.__nativeArtifactInput={ms:painted-start,paintedEpochMs:performance.timeOrigin+painted,
                trusted:event.isTrusted,inputType:event.inputType,targetEditable:target.isContentEditable,
                expectedBefore:before.trim()===`验收页面 ${number}`,samePagePainted:text.trim()===`验收页面 ${number}${marker}`};
            }));
          },{once:true,capture:true});
        }""", {"number": number, "marker": MARKER})
        page.keyboard.press("End"); page.keyboard.insert_text(MARKER)
        frame.wait_for_function("window.__nativeArtifactInput?.samePagePainted")
        proof = frame.evaluate("window.__nativeArtifactInput")
        if not all(proof.get(key) for key in ("trusted", "targetEditable", "expectedBefore", "samePagePainted")):
            raise MeasurementFailure("trusted_input_proof_failed")
        requests_at_paint = trace.snapshot()
        page.keyboard.press("Escape")
        deadline = time.monotonic() + 20
        while not any(row["status"] == 200 for row in saves) and time.monotonic() < deadline: page.wait_for_timeout(50)
        acknowledgments = [row for row in saves if row["status"] == 200]
        if not acknowledgments: raise MeasurementFailure("matching_edit_save_not_acknowledged")
        proof["saveAcknowledged"] = True
        acknowledgment = acknowledgments[0]
        proof["acceptedEpochMs"] = acknowledgment["epochMs"]
        proof["editableEpochMs"] = max(proof["paintedEpochMs"], proof["acceptedEpochMs"])
        proof["saveAfterPaintMs"] = round(proof["acceptedEpochMs"] - proof["paintedEpochMs"], 1)
        requests_at_editable = acknowledgment["requests"] if proof["acceptedEpochMs"] >= proof["paintedEpochMs"] else requests_at_paint
        return proof, requests_at_editable
    finally: page.remove_listener("response", listener)


def undo_edit(page, kind, number, artifact_id):
    saves = []
    prefixes = {legacy_save_prefix(frame) for frame in page.frames} - {None}
    listener = lambda response: saves.append(response.status) if any(save_request_matches(response, artifact_id, legacy_prefix=prefix) for prefix in prefixes or {None}) else None
    page.on("response", listener)
    try:
        page.keyboard.press("Control+z")
        ready_heading(page, kind, number, timeout=20)
        deadline = time.monotonic() + 20
        while 200 not in saves and time.monotonic() < deadline: page.wait_for_timeout(50)
        if 200 not in saves: raise MeasurementFailure("undo_save_not_acknowledged")
        return {"pageNumber": number, "originalHeadingRestored": True, "saveAcknowledged": True}
    finally: page.remove_listener("response", listener)


class ExportHtmlPages(HTMLParser):
    def __init__(self, arm):
        super().__init__(convert_charrefs=True)
        self.arm, self.stack, self.pages, self.active = arm, [], [], None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        page = self.stack and self.stack[-1] == 'main' and (
            tag == 'article' if self.arm == 'candidate' else tag == 'section' and 'deck-slide' in attrs.get('class', '').split())
        if page:
            self.pages.append({'text': '', 'images': 0, 'formulas': 0})
            self.active = len(self.stack)
        if self.active is not None:
            if tag == 'img': self.pages[-1]['images'] += 1
            if 'katex' in attrs.get('class', '').split(): self.pages[-1]['formulas'] += 1
        if tag not in ('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'):
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.stack:
            index = len(self.stack) - 1 - self.stack[::-1].index(tag)
            if self.active is not None and index <= self.active: self.active = None
            self.stack = self.stack[:index]

    def handle_data(self, data):
        if self.active is not None and not any(tag in ('script', 'style') for tag in self.stack):
            self.pages[-1]['text'] += data


def exported_page_count(path, format_name, arm):
    if format_name == 'pdf':
        try:
            result = subprocess.run(['pdfinfo', str(path)], capture_output=True, text=True, timeout=60,
                                    env={**os.environ, 'LC_ALL': 'C'})
        except FileNotFoundError: raise MeasurementFailure('export_pdf_parser_unavailable') from None
        match = re.search(r'^Pages:\s+(\d+)\s*$', result.stdout, re.M)
        if result.returncode or not match: raise MeasurementFailure('export_pdf_parser_failed')
        return {'pages': int(match[1]), 'pageCountSource': 'pdfinfo'}
    if format_name == 'html':
        parser = ExportHtmlPages(arm)
        parser.feed(path.read_text(encoding='utf-8'))
        valid = all(re.search(r'验收页面\s*' + str(index) + r'(?!\d)', row['text']) and row['images'] > 0 and row['formulas'] > 0
                    for index, row in enumerate(parser.pages, 1))
        return {'pages': len(parser.pages), 'pageCountSource': 'htmlParser', 'pageContentVerified': bool(parser.pages and valid)}
    with zipfile.ZipFile(path) as archive:
        return {'pages': sum(bool(re.fullmatch(r'ppt/slides/slide\d+\.xml', name)) for name in archive.namelist()),
                'pageCountSource': 'zipSlideParts'}


def export_control(page, arm, kind, format_name):
    for frame in page.frames:
        select = frame.locator('select[aria-label="导出格式"]')
        if select.count(): select.select_option(format_name); return
        menu = frame.locator('summary[aria-label="导出格式"]')
        if menu.count():
            menu.click()
            frame.get_by_role('button', name={'html':'HTML 网页','pdf':'PDF','pptx':'PowerPoint'}[format_name], exact=True).click()
            return
    if arm == "candidate": raise MeasurementFailure("native_export_control_missing")
    for frame in page.frames:
        if kind == "slides" and frame.locator('[data-slides-editor]').count():
            frame.get_by_role('button', name='下载', exact=True).click()
            labels = {"html": "网页（.html）", "pdf": "PDF（.pdf）", "pptx": "PowerPoint，使用通用字体（.pptx）"}
            frame.get_by_role('menuitem', name=re.compile('^' + re.escape(labels[format_name]))).click()
            if format_name == "pdf": frame.get_by_test_id('pdf-options-dialog').get_by_role('button', name='下载', exact=True).click()
            return
        if kind == "design" and frame.get_by_test_id('mega-export').count():
            frame.get_by_test_id('mega-export').click()
            if format_name == 'pdf':
                frame.get_by_role('menuitem', name=re.compile(r'^(所有画板|All artboards) \(\.pdf\)')).click()
                picker = frame.get_by_test_id('artboard-pick-all')
                if picker.count() and picker.is_visible():
                    picker.click(); frame.get_by_test_id('artboard-pick-export').click()
                return
            # The focused board menu's HTML is only one board. Never label it a 50-board export.
            raise MeasurementFailure("legacy_all_board_html_control_unverified")
    raise MeasurementFailure("export_control_missing")


def verify_offline_html(source_page, target, arm, browser_executable=None):
    """Real file:// open in a separate browser process; never an HTTP mirror.

    The verifier has no cookies, storage state or network access. It runs after
    the product export PSS sampler has stopped, so validation cost is not counted
    as export memory. A host policy/file-open refusal is a failed observation.
    """
    browser = context = None
    observations = {'directFileOpen': False, 'networkOffline': True, 'networkRequests': 0}
    try:
        source_browser = source_page.context.browser
        browser = source_browser.browser_type.launch(headless=True,
            executable_path=browser_executable or source_browser.browser_type.executable_path,
            args=['--no-sandbox'])
        if browser.version != source_browser.version: raise MeasurementFailure('export_offline_browser_mismatch')
        context = browser.new_context(offline=True, viewport={'width': 1440, 'height': 1000})
        def deny_network(route):
            observations['networkRequests'] += 1
            route.abort()
        context.route(re.compile(r'^https?://'), deny_network)
        offline = context.new_page()
        offline.set_default_timeout(30000)
        offline.goto(target.resolve().as_uri(), wait_until='load', timeout=30000)
        observations['directFileOpen'] = True
        proof = offline.evaluate(r"""async arm => {
          const pages=[...document.querySelectorAll(arm==='candidate'?'main > article':'main > section.deck-slide')];
          const fonts=new Map();
          for(const page of pages) for(const element of page.querySelectorAll('h1,h2,p,span,td,text')) {
            const text=element.textContent?.trim(), font=getComputedStyle(element).font;
            if(text&&font&&!fonts.has(font)) fonts.set(font,text.slice(0,128));
          }
          await Promise.race([
            (async()=>{
              await Promise.all(pages.flatMap(page=>[...page.querySelectorAll('img')].map(image=>image.decode())));
              await Promise.all([...fonts].map(([font,text])=>document.fonts.load(font,text)));
              await document.fonts.ready;
            })(),
            new Promise((_,reject)=>setTimeout(()=>reject(new Error('offline resource readiness timeout')),25000))
          ]);
          return {pages:pages.length,
            pagesWithDecodedImages:pages.filter(page=>{const images=[...page.querySelectorAll('img')];return images.length>0&&images.every(image=>image.complete&&image.naturalWidth>0)}).length,
            pagesWithFormula:pages.filter(page=>page.querySelector('.katex')).length,
            textVerified:pages.every((page,index)=>new RegExp('验收页面\\s*'+(index+1)+'(?!\\d)').test(page.textContent)),
            fontsReady:document.fonts.status==='loaded'&&[...fonts].every(([font,text])=>document.fonts.check(font,text))&&![...document.fonts].some(face=>face.status==='error'),
            fontStylesChecked:fonts.size,fontFacesLoaded:[...document.fonts].filter(face=>face.status==='loaded').length};
        }""", 'candidate' if source_page.locator('[data-native-artifact-editor]').count() else arm)
        observations.update(proof, sameBrowserVersion=True)
        if not (proof['pages'] == proof['pagesWithDecodedImages'] == proof['pagesWithFormula'] == 50
                and proof['textVerified'] and proof['fontsReady'] and proof['fontStylesChecked'] > 0
                and observations['networkRequests'] == 0):
            raise MeasurementFailure('export_offline_html_incomplete', observations)
        observations['verified'] = True
        return observations
    except MeasurementFailure: raise
    except Exception:
        raise MeasurementFailure('export_offline_html_open_failed', observations) from None
    finally:
        if context: context.close()
        if browser: browser.close()


def measure_export(page, process, trace, arm, kind, format_name, host_pss, timeout_ms, browser_executable=None, fidelity=False):
    if not fidelity and arm == 'baseline' and kind == 'design' and format_name in ('html', 'pptx'):
        return {"format": format_name, "status": "unsupported", "peakPssBytes": None, "bytes": None,
                "scope": 'frozenBaselineDesignHasNoPptx' if format_name == 'pptx' else 'frozenBaselineDesignOnlySingleBoardHtml'}
    result = {"format": format_name, "status": "failed", "peakPssBytes": None, "bytes": None}
    before = trace.snapshot(); started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='native-artifact-download-') as directory:
        target = Path(directory) / ('document.' + format_name)
        with PssSampler(process.pid) as sampler:
            try:
                with page.expect_download(timeout=timeout_ms) as download_event:
                    export_control(page, arm, kind, format_name)
                download = download_event.value
                download.save_as(str(target))
                if download.failure(): raise MeasurementFailure('export_download_failed')
                result['downloadCompletedMs'] = round((time.monotonic() - started) * 1000)
                data = target.read_bytes()
                if not data: raise MeasurementFailure('export_download_empty')
                valid = data.startswith(b'%PDF-') if format_name == 'pdf' else data.startswith(b'PK') if format_name == 'pptx' else b'<html' in data[:2048].lower() or data.startswith(b'PK')
                if not valid: raise MeasurementFailure('export_signature_invalid')
                result.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), signatureVerified=True)
                result.update(exported_page_count(target, format_name, arm))
                if result['pages'] != 50: raise MeasurementFailure('export_page_count_mismatch')
                if format_name == 'html' and not result['pageContentVerified']: raise MeasurementFailure('export_page_content_mismatch')
                result['status'] = 'passed'
            except Exception as error: result['failureCode'] = failure_code(error)
            finally: page.wait_for_timeout(100)
        memory = sampler.report()
        result.update(durationMs=round((time.monotonic() - started) * 1000), memory=memory,
                      peakPssBytes=memory['peakBytes'], scriptBytes=script_delta(before, trace.snapshot()))
        if memory['peakBytes'] is not None: result['hostSubtractedPeakPssBytes'] = memory['peakBytes'] - host_pss['bytes']
        if memory['failedSamples'] or memory['peakBytes'] is None:
            result.update(status='failed', failureCode='export_pss_incomplete')
        if result['status'] == 'passed' and format_name == 'html':
            try: result['offlineHtml'] = verify_offline_html(page, target, arm, browser_executable)
            except Exception as error:
                result.update(status='failed', failureCode=failure_code(error))
                if isinstance(error, MeasurementFailure) and error.observations: result['offlineHtml'] = error.observations
    return result


def close_editor(page, config, kind):
    selector = workbench(config, kind).get('closeSelector')
    if not selector: raise MeasurementFailure('editor_close_control_missing')
    page.locator(selector).first.click()
    page.locator(workbench(config, kind)['readySelector']).first.wait_for()
    if page.locator('[data-native-artifact-editor]:visible').count(): raise MeasurementFailure('editor_close_not_observed')


def measure_reclamation(page, process, trace, config, kind, args, host_pss):
    before = process_pss(process.pid)
    close_editor(page, config, kind)
    with PssSampler(process.pid, 250) as natural:
        page.wait_for_timeout(args.natural_close_ms)
    stable = pss_observations(page, process.pid)
    result = {"beforeClosePss": before, "natural": {"windowMs": args.natural_close_ms, **natural.report(),
        "afterPss": stable, "hostSubtractedPssBytes": stable['bytes'] - host_pss['bytes'],
        "reclaimedBytes": before['bytes'] - stable['bytes'], "forcedGc": False}}
    result['forcedGcDiagnostic'] = trace.forced_gc(page)
    page.wait_for_timeout(500)
    forced = pss_observations(page, process.pid)
    result['forcedGcDiagnostic'].update(afterPss=forced, reclaimedBeyondNaturalBytes=stable['bytes'] - forced['bytes'], usedForPerformanceGate=False)
    if natural.failures: raise MeasurementFailure('natural_reclamation_pss_incomplete')
    return result


def safe_screenshot(page, kind, output):
    # Only fixture document surfaces: never login pages, headers, notices or chat text.
    for frame in page.frames:
        targets = frame.locator('[data-page-id], [data-slides-editor] [data-slide-surface], x-dc')
        for index in range(targets.count()):
            target = targets.nth(index)
            if not target.locator('h1, [data-node-id$="-heading"], [data-text-path]').filter(has_text=re.compile(r'验收页面 \d+')).count(): continue
            if target.is_visible():
                try: target.screenshot(path=str(output), timeout=3000); return True
                except Exception: pass
    return False


def percentile(values, percent):
    values = sorted(value for value in values if value is not None)
    return values[math.ceil(len(values) * percent / 100) - 1] if values else None


def summarize(report, kinds, arms, diagnostic):
    report['summary'] = {}
    for kind in kinds:
        for arm in arms:
            for mode in MODES:
                rows = [row for row in report['samples'] if row['kind'] == kind and row['arm'] == arm and row['mode'] == mode and row['status'] == 'passed']
                summary = {"successfulSamples": len(rows), **{field: {f'p{p}': percentile([row.get(field) for row in rows], p) for p in (50, 75, 95)}
                    for field in ('editableMs', 'scriptTransferBytes', 'scriptDecodedBytes', 'idleScriptTransferBytes', 'idleScriptDecodedBytes', 'pssDeltaBytes', 'firstInputMs')}}
                summary['inputFeedbackP95Ms'] = percentile([value for row in rows for value in row.get('inputSamplesMs', [])], 95)
                report['summary'][f'{arm}:{kind}:{mode}'] = summary
                if mode == 'fullNavigation': report['summary'][f'{arm}:{kind}'] = summary
    gates = []
    for kind in kinds:
        before, after = report['summary'].get(f'baseline:{kind}'), report['summary'].get(f'candidate:{kind}')
        if not before or not after: continue
        ratios = [('editableMs', 'p75', 1.05), ('scriptTransferBytes', 'p50', 1.05), ('pssDeltaBytes', 'p50', 1.05)] if report.get('fidelity') else [('editableMs', 'p75', .7), ('scriptTransferBytes', 'p50', .5), ('pssDeltaBytes', 'p50', .7)]
        for metric, point, ratio in ratios:
            a, b = before[metric][point], after[metric][point]
            observed = before['successfulSamples'] >= 10 and after['successfulSamples'] >= 10 and a is not None and b is not None and a > 0
            gates.append({'kind': kind, 'mode': 'fullNavigation', 'metric': metric, 'requiredRatio': ratio,
                          'observedRatio': b / a if observed else None, 'passed': bool(observed and b <= a * ratio)})
        value = after['inputFeedbackP95Ms']
        gates.append({'kind': kind, 'mode': 'fullNavigation', 'metric': 'inputFeedbackP95', 'maximumMs': 100,
                      'passed': after['successfulSamples'] >= 10 and value is not None and value <= 100})
    report['gates'] = gates
    expected = report['requestedRuns'] * len(arms) * len(kinds) * len(MODES)
    complete = len(report['samples']) == expected and all(row['status'] == 'passed' for row in report['samples'])
    report['diagnosticPassed'] = bool(diagnostic and complete and len(arms) == 2)
    report['qualified'] = bool(not diagnostic and len(arms) == 2 and report['requestedRuns'] >= 10 and complete
                               and len(gates) == 4 * len(kinds) and all(gate['passed'] for gate in gates))


def self_check():
    assert safe_url('https://token-artifact.localhost/artifact-editor/design/secret-grant/?cookie=secret') == safe_url('https://other/artifact-editor/design/secret-grant/?other=value')
    for url in ('blob:https://secret/token', 'data:text/javascript,secret', 'https://u:secret@h/_blob/secret', 'https://h/artifact-editor/slides/secret'):
        assert 'secret' not in safe_url(url)
    assert script_request({'network': True, 'type': 'Fetch', 'mime': 'application/javascript'})
    assert not script_request({'network': False, 'type': 'Script', 'mime': 'application/javascript'})
    assert percentile([], 75) is None
    assert script_totals([])['decodedBytes'] == 0
    report = {'samples': [], 'requestedRuns': 1}
    summarize(report, KINDS, ['baseline', 'candidate'], True)
    assert not report['qualified'] and not report['diagnosticPassed']
    parsed = ExportHtmlPages('candidate')
    parsed.feed('<main><article><p>one</p></article><article><p>two</p><script>let fake="<article>"</script></article></main>')
    assert len(parsed.pages) == 2 and parsed.pages[1]['text'] == 'two'
    assert failure_code(RuntimeError('cookie=secret')) == 'browser_or_measurement_error'
    print(json.dumps({'selfCheck': 'passed', 'performanceSamples': 0, 'qualified': False}))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline'); parser.add_argument('--candidate'); parser.add_argument('--out')
    parser.add_argument('--browser', '--chromium', dest='browser')
    parser.add_argument('--runs', type=int, default=10); parser.add_argument('--kinds', default='design,slides')
    parser.add_argument('--fidelity', action='store_true')
    parser.add_argument('--diagnostic', action='store_true'); parser.add_argument('--self-check', action='store_true')
    parser.add_argument('--skip-traversal', action='store_true'); parser.add_argument('--keep-going', action='store_true')
    parser.add_argument('--idle-ms', type=int, default=5000); parser.add_argument('--host-idle-ms', type=int, default=12000)
    parser.add_argument('--natural-close-ms', type=int, default=10000); parser.add_argument('--export-timeout-ms', type=int, default=180000)
    args = parser.parse_args()
    if args.self_check: return self_check()
    if not args.baseline or not args.out: parser.error('--baseline and --out are required')
    if args.runs < 1 or args.runs > 10: parser.error('--runs must be between1and10')
    kinds = args.kinds.split(',')
    if not kinds or len(set(kinds)) != len(kinds) or any(kind not in KINDS for kind in kinds): parser.error('invalid kinds')
    if args.skip_traversal and not args.diagnostic: parser.error('--skip-traversal is diagnostic only')
    if min(args.idle_ms, args.host_idle_ms, args.natural_close_ms, args.export_timeout_ms) < 1: parser.error('observation windows must be positive')
    if not args.diagnostic and (args.idle_ms < 5000 or args.host_idle_ms < 12000 or args.natural_close_ms < 10000): parser.error('qualification requires full observation windows')
    runs = 1 if args.diagnostic else args.runs
    output = Path(args.out); output.parent.mkdir(parents=True, exist_ok=True)
    try:
        configs = {arm: json.loads(Path(path).read_text()) for arm, path in [('baseline', args.baseline), ('candidate', args.candidate)] if path}
        for config in configs.values():
            if urlsplit(config['origin']).hostname not in ('localhost', '127.0.0.1'): raise MeasurementFailure('configuration_invalid')
            if not isinstance(config['cookies'], list) or not all(kind in config['urls'] and kind in config['artifactIds'] for kind in kinds):
                raise MeasurementFailure('configuration_invalid')
    except Exception:
        failed = {'qualified': False, 'diagnosticPassed': False, 'samples': [],
                  'setupFailure': {'failureStage': 'configuration', 'failureCode': 'configuration_invalid'}}
        output.write_text(json.dumps(failed) + '\n'); print(json.dumps(failed['setupFailure']), flush=True); return 1
    report = {'schemaVersion': 2, 'scope': 'fullAuthenticatedProduct', 'requestedRuns': runs, 'diagnostic': args.diagnostic,
        'qualified': False, 'diagnosticPassed': False, 'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'environment': {'platform': platform.platform(), 'viewport': [1440, 1000], 'network': {'latencyMs': 20, 'downloadMbps': 4, 'uploadMbps': 3},
            'cpuRate': 1, 'coldProcessPerSample': True, 'authenticatedCookieOnly': True, 'hostIdleMs': args.host_idle_ms,
            'scriptIdleWindowMs': args.idle_ms, 'naturalCloseWindowMs': args.natural_close_ms, 'exportPeakIntervalMs': 100},
        'fidelity': args.fidelity, 'arms': {arm: {'commit': config.get('commit') if re.fullmatch('[a-f0-9]{40}', config.get('commit', '')) else None,
                      'fixtureSemanticHashes': {kind: config.get('fixtureManifests', {}).get(kind, {}).get('semanticSha256') for kind in kinds}}
                 for arm, config in configs.items()}, 'samples': []}
    def persist():
        summarize(report, kinds, list(configs), args.diagnostic)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    hash_values = {arm: report['arms'][arm]['fixtureSemanticHashes'] for arm in configs}
    report['fixtureComparison'] = {kind: all(re.fullmatch('[a-f0-9]{64}', hash_values[arm].get(kind) or '') for arm in configs)
        and len({hash_values[arm].get(kind) for arm in configs}) == 1 for kind in kinds}
    if not all(report['fixtureComparison'].values()):
        report['setupFailure'] = {'failureStage': 'fixture', 'failureCode': 'fixture_mismatch'}
        persist(); print(json.dumps(report['setupFailure']), flush=True); return 1
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        report['setupFailure'] = {'failureStage': 'launch', 'failureCode': 'browser_dependency_missing'}
        persist(); print(json.dumps(report['setupFailure']), flush=True); return 1
    with sync_playwright() as pw:
        aborted = False
        for run in range(runs):
            for arm in (list(configs) if run % 2 == 0 else list(configs)[::-1]):
                config = configs[arm]
                for kind in kinds:
                    host, host_failure = None, None
                    try: host = measure_host(pw, config, kind, args)
                    except Exception as error: host_failure = failure_code(error)
                    for mode in MODES:
                        sample = {'run': run + 1, 'arm': arm, 'kind': kind, 'mode': mode, 'status': 'failed', 'phase': 'host', 'pageErrors': 0}
                        resources = trace = None
                        try:
                            if host_failure: raise MeasurementFailure(host_failure)
                            sample['hostOnlyPss'] = host; sample['phase'] = 'launch'
                            resources = launch(pw, config, args.browser)
                            browser, context, page, process, _ = resources
                            report['environment']['browser'] = browser.version
                            def page_error(_error): sample['pageErrors'] += 1
                            page.on('pageerror', page_error)
                            trace = Trace(context, page); sample['emptyBrowserPss'] = process_pss(process.pid)
                            sample['phase'] = 'workbenchPreparation'; preopen = []
                            if mode == 'workbenchOpen':
                                control = workbench(config, kind)
                                page.goto(control['url'], wait_until='domcontentloaded', timeout=120000)
                                page.locator(control['readySelector']).first.wait_for(timeout=120000)
                                wait_quiet(page, trace, args.host_idle_ms); trace.reconcile_decoded(page); preopen = trace.snapshot()
                                sample['preOpenScriptBytes'] = script_totals(preopen)
                            sample['phase'] = 'open'; started_ms = time.time() * 1000
                            if mode == 'fullNavigation':
                                page.goto(config['urls'][kind], wait_until='domcontentloaded', timeout=120000)
                                if kind == 'design': page.locator('[data-design-open-trigger]').first.click(timeout=120000)
                            else: page.locator(workbench(config, kind)['openSelector']).first.click()
                            if arm == 'baseline' and kind == 'design': navigate(page, kind, 1)
                            sample['phase'] = 'firstReadiness'
                            frame, heading, proof = ready_heading(page, kind, 1)
                            sample['readiness'] = [proof]; sample['phase'] = 'firstInput'
                            input_proof, requests_at_editable = edit_heading(page, frame, heading, trace, config['artifactIds'][kind], 1)
                            sample.update(firstInputMs=input_proof['ms'], saveAfterPaintMs=input_proof['saveAfterPaintMs'],
                                editableMs=round(input_proof['editableEpochMs'] - started_ms, 1), inputProofs=[input_proof],
                                inputSamplesMs=[input_proof['ms']], requestsAtEditable=requests_at_editable, firstEditablePss=process_pss(process.pid))
                            byte_delta = script_delta(preopen, requests_at_editable)
                            sample.update(scriptTransferBytes=byte_delta['transferredBytes'], scriptDecodedBytes=byte_delta['decodedBytes'])
                            sample['phase'] = 'idleObservation'
                            wait_quiet(page, trace, max(0, args.idle_ms - (time.time() * 1000 - input_proof['editableEpochMs'])))
                            sample['idleObservedAfterEditableMs'] = round(time.time() * 1000 - input_proof['editableEpochMs'])
                            trace.reconcile_decoded(page); trace.reconcile_snapshot(requests_at_editable)
                            sample['scriptDecodedBytes'] = script_delta(preopen, requests_at_editable)['decodedBytes']
                            stable = trace.snapshot(); sample['requestsAtStable'] = stable
                            idle_delta = script_delta(requests_at_editable, stable)
                            sample.update(idleScriptTransferBytes=idle_delta['transferredBytes'], idleScriptDecodedBytes=idle_delta['decodedBytes'])
                            sample['scriptAccounting'] = script_totals(stable)
                            sample['phase'] = 'undo'; sample['undoProofs'] = [undo_edit(page, kind, 1, config['artifactIds'][kind])]
                            sample['visitedPages'] = [1]; sample['navigation'] = []
                            if args.skip_traversal: raise MeasurementFailure('traversal_intentionally_unverified')
                            sample['phase'] = 'traversal'
                            for number in range(2, 51):
                                sample['navigation'].append({'pageNumber': number, **navigate(page, kind, number)})
                                frame, heading, proof = ready_heading(page, kind, number, timeout=30)
                                sample['readiness'].append(proof); sample['visitedPages'].append(number)
                                if number in (25, 50):
                                    proof, _ = edit_heading(page, frame, heading, trace, config['artifactIds'][kind], number)
                                    sample['inputProofs'].append(proof); sample['inputSamplesMs'].append(proof['ms'])
                                    sample['undoProofs'].append(undo_edit(page, kind, number, config['artifactIds'][kind]))
                            page.wait_for_timeout(1000)
                            sample['afterTraversalPss'] = pss_observations(page, process.pid)
                            sample['pssDeltaBytes'] = sample['afterTraversalPss']['bytes'] - host['bytes']
                            sample['blankSubtractedPssBytes'] = sample['afterTraversalPss']['bytes'] - sample['emptyBrowserPss']['bytes']
                            sample['phase'] = 'export'
                            if run == 0 and mode == 'fullNavigation':
                                sample['exports'] = [measure_export(page, process, trace, arm, kind, name, host, args.export_timeout_ms, args.browser, args.fidelity) for name in FORMATS]
                            sample['phase'] = 'closeReclamation'
                            sample['reclamation'] = measure_reclamation(page, process, trace, config, kind, args, host)
                            sample['cdpErrors'] = [row for row in trace.errors if row.get('command') != 'HeapProfiler.collectGarbage']
                            sample['retiredRequests'] = [row['url'] for row in trace.snapshot() if arm == 'candidate' and row.get('retiredEditor')]
                            sample['failedRequests'] = [row for row in trace.snapshot() if row.get('status', 200) >= 400 or row.get('failed') and not row.get('canceled')]
                            sample['phase'] = 'validation'
                            if sample['pageErrors']: raise MeasurementFailure('page_exception_observed')
                            if sample['failedRequests']: raise MeasurementFailure('network_failure_observed')
                            if sample['cdpErrors']: raise MeasurementFailure('cdp_setup_failed')
                            if sample['retiredRequests']: raise MeasurementFailure('retired_editor_loaded')
                            if sample['scriptAccounting']['missingDecoded']: raise MeasurementFailure('decoded_script_accounting_incomplete')
                            if any(row['status'] == 'failed' for row in sample.get('exports', [])): raise MeasurementFailure('export_diagnostic_incomplete')
                            sample['status'] = 'passed'; sample['phase'] = 'complete'
                        except Exception as error:
                            sample.update(failureStage=sample['phase'], failureCode=failure_code(error))
                            if isinstance(error, MeasurementFailure) and error.observations: sample['failureObservations'] = error.observations
                            if resources:
                                try: sample['failureScreenshot'] = safe_screenshot(resources[2], kind, output.parent / f'{arm}-{kind}-{run+1}-{mode}-failure.png')
                                except Exception: sample['failureScreenshot'] = False
                        finally:
                            if trace:
                                rows = trace.snapshot()
                                sample['networkObservations'] = {'requests': len(rows), 'scripts': script_totals(rows), 'inflight': len(trace.inflight()),
                                    'failed': sum(row.get('status', 200) >= 400 or row.get('failed', False) and not row.get('canceled', False) for row in rows),
                                    'sourcePayloadTransferBytes': sum(row.get('transferredBytes', 0) for row in rows if row.get('sourcePayload')),
                                    'sourcePayloadDecodedBytes': sum(row.get('decodedBytes', 0) for row in rows if row.get('sourcePayload'))}
                                sample.setdefault('cdpErrors', trace.errors[:32])
                            report['samples'].append(sample); persist(); close(resources)
                            print(json.dumps({key: sample[key] for key in ('run', 'arm', 'kind', 'mode', 'status', 'failureStage', 'failureCode', 'editableMs', 'scriptTransferBytes', 'scriptDecodedBytes', 'pssDeltaBytes') if key in sample}), flush=True)
                        if sample['status'] == 'failed' and not args.keep_going: aborted = True; break
                    if aborted: break
                if aborted: break
            if aborted: break
    persist()
    succeeded = report['diagnosticPassed'] if args.diagnostic else report['qualified']
    return 0 if succeeded else 1


if __name__ == '__main__':
    raise SystemExit(main())
