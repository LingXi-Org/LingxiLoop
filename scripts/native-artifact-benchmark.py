"""Focused full-application cold-open benchmark. Requires private arm JSON from
native-artifact-serve.mjs. No API interception, auth bypass, or old harness imports.

python scripts/native-artifact-benchmark.py --baseline /tmp/baseline.json \
  --candidate /tmp/candidate.json --runs 10 --out docs/evidence/native-artifact-editor/paired.json
"""
import argparse
import json
import math
import os
import platform
import re
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from playwright.sync_api import sync_playwright


def safe_url(raw):
    parts = urlsplit(raw)
    path = re.sub(r"/(design|slides)/[^/]+/", r"/\1/<grant>/", parts.path)
    host = re.sub(r"[a-f0-9]{32}-artifact", "grant-artifact", parts.netloc)
    return urlunsplit((parts.scheme, host, path, "", ""))


class Trace:
    """Attach before navigation and throttle every iframe/worker before it runs."""
    def __init__(self, context, page):
        self.cdp = context.new_cdp_session(page)
        self.requests, self.targets, self.errors = {}, {}, []
        self.sequence = 0
        for method in ["requestWillBeSent", "responseReceived", "dataReceived", "loadingFinished", "loadingFailed"]:
            self.cdp.on("Network." + method, lambda params, name=method: self.event("", name, params))
        self.cdp.on("Target.attachedToTarget", lambda value: self.attach("", value))
        self.cdp.on("Target.receivedMessageFromTarget", lambda value: self.message("", value))
        self.configure("")

    def send(self, route, method, params=None):
        if not route:
            return self.cdp.send(method, params or {})
        self.sequence += 1
        parent, _, child = route.rpartition("/")
        self.send(parent, "Target.sendMessageToTarget", {"sessionId": child, "message": json.dumps({"id": self.sequence, "method": method, "params": params or {}})})

    def configure(self, route):
        self.send(route, "Network.enable")
        self.send(route, "Network.setCacheDisabled", {"cacheDisabled": False})
        self.send(route, "Network.emulateNetworkConditions", {"offline": False, "latency": 20, "downloadThroughput": 500000, "uploadThroughput": 375000})
        if not route or self.targets[route] in ["page", "iframe"]:
            self.send(route, "Emulation.setCPUThrottlingRate", {"rate": 1})
        self.send(route, "Target.setAutoAttach", {"autoAttach": True, "waitForDebuggerOnStart": True, "flatten": False})
        self.send(route, "Runtime.runIfWaitingForDebugger")

    def attach(self, parent, value):
        route = (parent + "/" if parent else "") + value["sessionId"]
        self.targets[route] = value["targetInfo"]["type"]
        self.configure(route)

    def message(self, parent, value):
        route = (parent + "/" if parent else "") + value["sessionId"]
        message = json.loads(value["message"])
        method, params = message.get("method", ""), message.get("params", {})
        if "error" in message:
            self.errors.append({"target": self.targets.get(route), "error": message["error"]})
        if method == "Target.attachedToTarget": self.attach(route, params)
        elif method == "Target.receivedMessageFromTarget": self.message(route, params)
        elif method.startswith("Network."): self.event(route, method[8:], params)

    def event(self, route, method, value):
        key = route + ":" + value.get("requestId", "")
        if method == "requestWillBeSent":
            self.requests[key] = {"url": safe_url(value["request"]["url"]), "type": value.get("type"), "start": value["timestamp"], "targetType": self.targets.get(route, "page")}
        elif key in self.requests:
            row = self.requests[key]
            if method == "responseReceived":
                response = value["response"]
                headers = {key.lower(): value for key, value in response["headers"].items()}
                row.update(status=response["status"], cache=response.get("fromDiskCache", False), mime=response.get("mimeType"), encoding=headers.get("content-encoding"), transferredBytes=response.get("encodedDataLength", 0))
            elif method == "dataReceived":
                row["transferredBytes"] = row.get("transferredBytes", 0) + value.get("encodedDataLength", 0)
                row["decodedBytes"] = row.get("decodedBytes", 0) + value.get("dataLength", 0)
            elif method == "loadingFinished": row.update(end=value["timestamp"], transferredBytes=value["encodedDataLength"])
            elif method == "loadingFailed": row.update(failed=value.get("errorText"), canceled=value.get("canceled", False))

    def snapshot(self):
        return [dict(row) for row in self.requests.values()]


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
    total, unreadable = 0, []
    for pid in family:
        try:
            match = re.search(r"^Pss:\s+(\d+) kB$", Path(f"/proc/{pid}/smaps_rollup").read_text(), re.M)
            if match: total += int(match[1]) * 1024
            else: unreadable.append(pid)
        except OSError:
            if Path(f"/proc/{pid}").exists(): unreadable.append(pid)
    if unreadable: raise RuntimeError("PSS incomplete for live browser processes")
    return {"bytes": total, "processes": len(family)}


def launch(pw, config):
    directory = tempfile.TemporaryDirectory(prefix="native-artifact-browser-")
    command = ["/usr/bin/chromium", "--headless", "--no-sandbox", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", f"--user-data-dir={directory.name}"]
    if config.get("spki"): command.append("--ignore-certificate-errors-spki-list=" + config["spki"])
    process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.monotonic() + 15
    portfile = Path(directory.name) / "DevToolsActivePort"
    while not portfile.exists():
        if time.monotonic() > deadline or process.poll() is not None: raise RuntimeError("Chromium startup failed")
        time.sleep(.05)
    browser = pw.chromium.connect_over_cdp("http://127.0.0.1:" + portfile.read_text().splitlines()[0])
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    context.add_cookies([{**cookie, "url": config["origin"]} for cookie in config["cookies"]])
    page = context.new_page()
    page.set_default_timeout(10000)
    return browser, context, page, process, directory


def close(resources):
    browser, context, page, process, directory = resources
    try: context.close(); browser.close()
    finally:
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill(); process.wait()
        directory.cleanup()


def ready_heading(page, number, timeout=90):
    deadline = time.monotonic() + timeout
    title = f"验收页面 {number}"
    while time.monotonic() < deadline:
        for frame in page.frames:
            try:
                target = frame.locator(f'[data-node-id="page-{number}-heading"], [data-text-path], h1').filter(has_text=re.compile("^" + re.escape(title) + "$"))
                for index in range(target.count()):
                    heading = target.nth(index)
                    box = heading.bounding_box(timeout=100)
                    if not box or box["width"] < 40 or box["height"] < 5: continue
                    if not frame.evaluate("""() => [...document.images].some(img=>img.complete&&img.naturalWidth===640&&img.getBoundingClientRect().width>100)
                      && !!document.querySelector('.katex,[data-formula-ready="true"]')"""): continue
                    return frame, heading
            except Exception: pass
        page.wait_for_timeout(25)
    raise RuntimeError(f"Page {number} did not show its heading, decoded image and rendered formula")


def edit_heading(page, frame, heading, trace):
    saves = []
    def saved(response):
        if re.search(r"(?:/__deck/publish|/operations)$", urlsplit(response.url).path):
            saves.append(response.status)
    page.on("response", saved)
    heading.dblclick()
    frame.wait_for_function("Boolean(document.activeElement?.isContentEditable)")
    frame.evaluate("""() => { window.__nativeArtifactInput=null; document.addEventListener('beforeinput',()=>{const started=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__nativeArtifactInput={ms:performance.now()-started,text:document.activeElement?.textContent}}))},{once:true,capture:true}) }""")
    page.keyboard.press("End")
    page.keyboard.insert_text(" ✓")
    frame.wait_for_function("window.__nativeArtifactInput?.text?.includes('✓')")
    result = frame.evaluate("window.__nativeArtifactInput")
    painted_at = time.monotonic()
    requests_at_paint = trace.snapshot()
    page.keyboard.press("Escape")
    deadline = time.monotonic() + 15
    while 200 not in saves and time.monotonic() < deadline: page.wait_for_timeout(25)
    page.remove_listener("response", saved)
    if 200 not in saves: raise RuntimeError("Real edit was painted but the API did not acknowledge its save")
    return result["ms"], painted_at, round((time.monotonic() - painted_at) * 1000, 1), requests_at_paint


def navigate(page, kind, number):
    for frame in page.frames:
        target = frame.locator(f'[data-page-target="page-{number}"], [data-slide-id="page-{number}"]')
        if target.count(): target.first.click(); return
    if kind == "design":
        for frame in page.frames:
            target = frame.locator(f'[data-mega-artboard="Page{number}.dc.html"] [data-mega-title-text]')
            if target.count(): target.first.dblclick(); return
    raise RuntimeError(f"No real page navigation control for {kind} page {number}")


def percentile(values, p):
    values = sorted(values)
    return values[math.ceil(len(values) * p / 100) - 1] if values else None


def measure_host(pw, config):
    resources = launch(pw, config)
    browser, context, page, process, directory = resources
    try:
        trace = Trace(context, page)
        page.goto(config["shellUrl"], wait_until="domcontentloaded", timeout=90000)
        page.locator(config["shellReadySelector"]).first.wait_for(timeout=90000)
        page.wait_for_timeout(2000)
        observations = []
        for _ in range(5):
            observations.append(process_pss(process.pid))
            page.wait_for_timeout(200)
        if trace.errors: raise RuntimeError("Host shell CDP setup was incomplete")
        return {"bytes": round(sum(row["bytes"] for row in observations) / len(observations)), "observations": observations,
                "definition": "separate fresh Chromium process; same authenticated production shell, no editor open; five stable PSS observations"}
    finally: close(resources)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--candidate")
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--kinds", default="design,slides")
    parser.add_argument("--out", required=True)
    parser.add_argument("--skip-traversal", action="store_true", help="diagnostic only; memory gate will remain unverified")
    parser.add_argument("--keep-going", action="store_true", help="continue after a failed sample; default preserves the failure and stops")
    args = parser.parse_args()
    configs = {arm: json.loads(Path(path).read_text()) for arm, path in [("baseline", args.baseline), ("candidate", args.candidate)] if path}
    output = Path(args.out); output.parent.mkdir(parents=True, exist_ok=True)
    report = {"scope": "Full authenticated local production app, real API/PostgreSQL/Redis/IM; fixed image resources; no model latency or production-network claim", "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "environment": {"platform": platform.platform(), "viewport": [1440, 1000], "network": {"latencyMs": 20, "downloadMbps": 4, "uploadMbps": 3}, "cpuRate": 1, "cold": "new Chromium process and empty browser context; only valid login cookie restored"},
              "arms": {name: {key: config[key] for key in ["commit", "fixtureManifests", "authentication"] if key in config} for name, config in configs.items()}, "samples": []}
    with sync_playwright() as pw:
        aborted = False
        for run in range(args.runs):
            for arm in (list(configs) if run % 2 == 0 else list(configs)[::-1]):
                config = configs[arm]
                host_pss, host_failure = None, None
                try: host_pss = measure_host(pw, config)
                except Exception as error: host_failure = str(error)
                for kind in args.kinds.split(","):
                    resources = launch(pw, config)
                    browser, context, page, process, directory = resources
                    report["environment"]["browser"] = browser.version
                    sample = {"run": run + 1, "arm": arm, "kind": kind, "errors": []}
                    page.on("pageerror", lambda error: sample["errors"].append(str(error)))
                    trace = Trace(context, page)
                    try:
                        if host_failure: raise RuntimeError("Authenticated empty host measurement failed: " + host_failure)
                        sample["hostOnlyPss"] = host_pss
                        sample["emptyBrowserPss"] = process_pss(process.pid)
                        started = time.monotonic()
                        page.goto(config["urls"][kind], wait_until="domcontentloaded", timeout=90000)
                        if kind == "design": page.locator("[data-design-open-trigger]").first.click(timeout=90000)
                        frame, heading = ready_heading(page, 1)
                        sample["firstInputMs"], painted_at, sample["saveAfterPaintMs"], sample["requestsAtEditable"] = edit_heading(page, frame, heading, trace)
                        sample["inputSamplesMs"] = [sample["firstInputMs"]]
                        sample["editableMs"] = round((painted_at - started) * 1000, 1)
                        sample["scriptTransferBytes"] = sum(row.get("transferredBytes", 0) for row in sample["requestsAtEditable"] if row.get("type") == "Script" or re.search(r"\.(?:m?js|cjs)$", urlsplit(row["url"]).path))
                        sample["firstEditablePss"] = process_pss(process.pid)
                        page.wait_for_timeout(1000)
                        page.keyboard.press("Control+z")
                        page.wait_for_timeout(1000)
                        sample["visitedPages"] = [1]
                        if not args.skip_traversal:
                            for number in range(2, 51):
                                navigate(page, kind, number)
                                frame, heading = ready_heading(page, number, timeout=30)
                                sample["visitedPages"].append(number)
                                if number in [25, 50]:
                                    sample["inputSamplesMs"].append(edit_heading(page, frame, heading, trace)[0])
                                    page.keyboard.press("Control+z")
                                    ready_heading(page, number, timeout=15)
                            page.wait_for_timeout(1000)
                            sample["afterTraversalPss"] = process_pss(process.pid)
                            sample["pssDeltaBytes"] = sample["afterTraversalPss"]["bytes"] - sample["hostOnlyPss"]["bytes"]
                            sample["blankSubtractedPssBytes"] = sample["afterTraversalPss"]["bytes"] - sample["emptyBrowserPss"]["bytes"]
                        sample["requestsAtStable"] = trace.snapshot()
                        sample["cdpErrors"] = trace.errors
                        if arm == "candidate":
                            sample["retiredRequests"] = [row["url"] for row in sample["requestsAtStable"] if re.search(r"/artifact-editor/(?:design|slides)-assets/", row["url"])]
                        sample["status"] = "passed"
                    except Exception as error:
                        sample["status"], sample["failure"] = "failed", str(error)
                        page.screenshot(path=str(output.parent / f"{arm}-{kind}-{run+1}-failure.png"))
                    finally:
                        report["samples"].append(sample)
                        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
                        print(json.dumps({key: value for key, value in sample.items() if key in ["run", "arm", "kind", "status", "failure", "editableMs", "scriptTransferBytes", "pssDeltaBytes", "firstInputMs"]}, ensure_ascii=False), flush=True)
                        close(resources)
                    if sample["status"] == "failed" and not args.keep_going:
                        aborted = True
                        break
                if aborted: break
            if aborted: break
    report["summary"] = {}
    gates = []
    for kind in args.kinds.split(","):
        for arm in configs:
            rows = [row for row in report["samples"] if row["kind"] == kind and row["arm"] == arm and row["status"] == "passed"]
            report["summary"][f"{arm}:{kind}"] = {"successfulSamples": len(rows), **{field: {f"p{p}": percentile([row[field] for row in rows if field in row], p) for p in [50, 75, 95]} for field in ["editableMs", "scriptTransferBytes", "pssDeltaBytes", "firstInputMs"]}}
            report["summary"][f"{arm}:{kind}"]["inputFeedbackP95Ms"] = percentile([value for row in rows for value in row.get("inputSamplesMs", [])], 95)
        before, after = report["summary"].get(f"baseline:{kind}"), report["summary"].get(f"candidate:{kind}")
        if not before or not after: continue
        for metric, percentile_key, ratio in [("editableMs", "p75", .7), ("scriptTransferBytes", "p50", .5), ("pssDeltaBytes", "p50", .7)]:
            a, b = before[metric][percentile_key], after[metric][percentile_key]
            qualified = before["successfulSamples"] >= 10 and after["successfulSamples"] >= 10 and a is not None and b is not None and a > 0
            gates.append({"kind": kind, "metric": metric, "requiredRatio": ratio, "observedRatio": b / a if qualified else None, "passed": qualified and b <= a * ratio})
        gates.append({"kind": kind, "metric": "inputFeedbackP95", "maximumMs": 100, "passed": after["successfulSamples"] >= 10 and (after["inputFeedbackP95Ms"] or math.inf) <= 100})
    report["gates"] = gates
    report["qualified"] = len(configs) == 2 and len(gates) == 4 * len(args.kinds.split(",")) and all(gate["passed"] for gate in gates) and all(row["status"] == "passed" and not row.get("retiredRequests") and not row.get("cdpErrors") and not row.get("errors") for row in report["samples"])
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return 0 if report["qualified"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
