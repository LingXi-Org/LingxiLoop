#!/usr/bin/env python3
"""Root-only Unix-socket broker for Chromium's remote-debugging pipe.

Agent shells run as distinct unprivileged users. They cannot open the 0600
socket and Chromium exposes no TCP debugging port, so CDP authority stays at
the trusted service boundary.
"""
import base64
import grp
import http.server
import json
import os
import pwd
import socketserver
import subprocess
import threading
import time

SOCKET_PATH = "/run/lingxi/browser.sock"


class CdpPipe:
    def __init__(self):
        to_child_r, self._to_child_w = os.pipe()
        self._from_child_r, from_child_w = os.pipe()
        user = pwd.getpwnam("lingxi")

        def child_setup():
            os.dup2(to_child_r, 3)
            os.dup2(from_child_w, 4)
            os.set_inheritable(3, True)
            os.set_inheritable(4, True)
            for descriptor in {to_child_r, self._to_child_w, self._from_child_r, from_child_w}:
                if descriptor not in {3, 4}:
                    os.close(descriptor)
            os.initgroups(user.pw_name, user.pw_gid)
            os.setgid(user.pw_gid)
            os.setuid(user.pw_uid)

        command = [
            "/usr/bin/chromium",
            "--no-sandbox",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-dev-shm-usage",
            "--remote-debugging-pipe",
            "--user-data-dir=/home/lingxi/.config/chromium",
            "about:blank",
        ]
        env = dict(os.environ, DISPLAY=":10", HOME="/home/lingxi")
        self._chromium_log = open("/tmp/chromium-broker.log", "ab", buffering=0)
        self.process = subprocess.Popen(
            command,
            env=env,
            close_fds=False,
            preexec_fn=child_setup,
            stdin=subprocess.DEVNULL,
            stdout=self._chromium_log,
            stderr=subprocess.STDOUT,
        )
        os.close(to_child_r)
        os.close(from_child_w)
        self._next_id = 0
        self._responses = {}
        self._condition = threading.Condition()
        threading.Thread(target=self._read_loop, daemon=True).start()

    def _read_loop(self):
        buffered = b""
        while True:
            chunk = os.read(self._from_child_r, 65536)
            if not chunk:
                return
            buffered += chunk
            while b"\0" in buffered:
                raw, buffered = buffered.split(b"\0", 1)
                if not raw:
                    continue
                message = json.loads(raw.decode("utf-8"))
                if "id" in message:
                    with self._condition:
                        self._responses[message["id"]] = message
                        self._condition.notify_all()

    def call(self, method, params=None, session_id=None, timeout=15):
        with self._condition:
            self._next_id += 1
            request_id = self._next_id
        request = {"id": request_id, "method": method, "params": params or {}}
        if session_id:
            request["sessionId"] = session_id
        os.write(self._to_child_w, json.dumps(request, separators=(",", ":")).encode("utf-8") + b"\0")
        deadline = time.monotonic() + timeout
        with self._condition:
            while request_id not in self._responses:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError(f"CDP {method} timed out")
                self._condition.wait(remaining)
            response = self._responses.pop(request_id)
        if "error" in response:
            raise RuntimeError(response["error"].get("message", f"CDP {method} failed"))
        return response.get("result", {})

    def with_target(self, target_id, callback):
        attached = self.call("Target.attachToTarget", {"targetId": target_id, "flatten": True})
        session_id = attached["sessionId"]
        try:
            return callback(session_id)
        finally:
            try:
                self.call("Target.detachFromTarget", {"sessionId": session_id})
            except Exception:
                pass


CDP = CdpPipe()


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "LingxiBrowserBroker/1"

    def log_message(self, _format, *_args):
        return

    def reply(self, status, payload):
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        try:
            size = int(self.headers.get("content-length", "0"))
            if size > 1024 * 1024:
                raise ValueError("request too large")
            body = json.loads(self.rfile.read(size) or b"{}")
            if self.path == "/health":
                self.reply(200, CDP.call("Browser.getVersion"))
                return
            if self.path == "/shutdown":
                self.reply(200, CDP.call("Browser.close"))
                return
            if self.path == "/targets/create":
                result = CDP.call("Target.createTarget", {"url": body["url"]})
                self.reply(200, {"id": result["targetId"]})
                return
            target_id = body["targetId"]
            if self.path == "/targets/navigate":
                result = CDP.with_target(target_id, lambda session: CDP.call(
                    "Page.navigate", {"url": body["url"]}, session
                ))
                self.reply(200, result)
                return
            if self.path == "/targets/screenshot":
                def capture(session):
                    CDP.call("Page.enable", session_id=session)
                    return CDP.call("Page.captureScreenshot", {
                        "format": "png", "fromSurface": True, "captureBeyondViewport": False
                    }, session)
                result = CDP.with_target(target_id, capture)
                self.reply(200, {"data": result["data"]})
                return
            if self.path == "/targets/input":
                def send_input(session):
                    kind = body["type"]
                    if kind == "click":
                        x, y = body["x"], body["y"]
                        CDP.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y}, session)
                        CDP.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1}, session)
                        return CDP.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1}, session)
                    if kind == "text":
                        return CDP.call("Input.insertText", {"text": body["text"]}, session)
                    key = body["key"]
                    modifiers = 2 if key.lower().startswith("ctrl+") else 0
                    key = key.split("+", 1)[-1] if modifiers else key
                    CDP.call("Input.dispatchKeyEvent", {"type": "keyDown", "key": key, "modifiers": modifiers}, session)
                    return CDP.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": key, "modifiers": modifiers}, session)
                self.reply(200, CDP.with_target(target_id, send_input))
                return
            if self.path == "/targets/evaluate":
                result = CDP.with_target(target_id, lambda session: CDP.call(
                    "Runtime.evaluate", {"expression": body["expression"], "returnByValue": True}, session
                ))
                self.reply(200, result)
                return
            if self.path == "/targets/close":
                self.reply(200, CDP.call("Target.closeTarget", {"targetId": target_id}))
                return
            self.reply(404, {"error": "unknown broker endpoint"})
        except Exception as error:
            self.reply(400, {"error": str(error)})


class ThreadedUnixServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


os.makedirs(os.path.dirname(SOCKET_PATH), mode=0o700, exist_ok=True)
try:
    os.unlink(SOCKET_PATH)
except FileNotFoundError:
    pass
server = ThreadedUnixServer(SOCKET_PATH, Handler)
os.chmod(SOCKET_PATH, 0o600)
server.serve_forever()
