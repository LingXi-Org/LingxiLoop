"""Persistent IPython worker for LingxiLoop Agent OS.

Protocol is newline-delimited JSON over stdio. Product operations are never
implemented in Python: `loop.<namespace>.<method>` sends a host_call and waits
for a matching host_result. The parent process owns authorization, approvals,
idempotency and durable state.
"""

import asyncio
import builtins
import contextlib
import hashlib
import io
import json
import mimetypes
import os
import pathlib
import socket
import sys
import time
import traceback
import types
import uuid
from typing import Any

from IPython.core.interactiveshell import InteractiveShell

# Isolated mode removes the script directory from sys.path; restore only this
# trusted runtime directory so the bundled SDK remains importable.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from teacher_sdk import TeacherSDK


MAX_STREAM_CHARS = int(os.environ.get("LINGXILOOP_KERNEL_MAX_OUTPUT_CHARS", "8000"))
ROOT = pathlib.Path(os.environ["LINGXILOOP_AGENT_HOME"]).resolve()
HOMES_ROOT = pathlib.Path(os.environ.get("LINGXILOOP_HOMES_ROOT", str(ROOT.parent.parent))).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
os.chdir(ROOT)


def emit(payload: dict[str, Any]) -> None:
    sys.__stdout__.write(json.dumps(payload, ensure_ascii=True, default=str) + "\n")
    sys.__stdout__.flush()


def read_message() -> dict[str, Any]:
    line = sys.__stdin__.readline()
    if not line:
        raise EOFError()
    value = json.loads(line)
    if not isinstance(value, dict):
        raise ValueError("protocol message must be an object")
    return value


def deny_network(*_args: Any, **_kwargs: Any) -> Any:
    raise PermissionError("direct network access is disabled; use an authorized loop Host Bridge namespace")


if os.environ.get("LINGXILOOP_KERNEL_ALLOW_NETWORK") != "1":
    socket.create_connection = deny_network  # type: ignore[assignment]
    socket.socket.connect = deny_network  # type: ignore[assignment]


def is_within(path: pathlib.Path, parent: pathlib.Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def kernel_audit(event: str, args: tuple[Any, ...]) -> None:
    if event == "open" and args and isinstance(args[0], (str, bytes, os.PathLike)):
        path = pathlib.Path(args[0]).resolve()
        mode = str(args[1]) if len(args) > 1 else "r"
        if is_within(path, HOMES_ROOT) and not is_within(path, ROOT):
            raise PermissionError("cross-agent file access is disabled")
        if any(flag in mode for flag in ("w", "a", "x", "+")) and not is_within(path, ROOT):
            raise PermissionError("files may only be written inside this Agent Home")
    if event in {"os.system", "subprocess.Popen"}:
        # A child process would escape Python's path/network audit hooks. Shell
        # effects must therefore go through a typed Host Bridge capability.
        raise PermissionError("direct child processes are disabled in this Kernel sandbox")
    if event.startswith("socket.") and os.environ.get("LINGXILOOP_KERNEL_ALLOW_NETWORK") != "1":
        raise PermissionError("direct network access is disabled")


sys.addaudithook(kernel_audit)


class ApprovalPending(RuntimeError):
    def __init__(self, approval_id: str):
        super().__init__(f"approval pending: {approval_id}")
        self.approval_id = approval_id


class Namespace:
    def __init__(self, bridge: "LoopBridge", name: str, allowed_methods: frozenset[str] | None = None):
        self._bridge = bridge
        self._name = name
        self._allowed_methods = allowed_methods

    def __getattr__(self, method: str):
        if method.startswith("_") or (
            self._allowed_methods is not None and method not in self._allowed_methods
        ):
            raise AttributeError(method)

        def invoke(**kwargs: Any) -> Any:
            return self._bridge.call(f"{self._name}.{method}", kwargs)

        return invoke


class LoopBridge:
    KNOWLEDGE_METHODS = frozenset({
        "list_sources",
        "add_text", "add_url", "add_file",
        "retry_ingestion", "set_source_enabled", "delete_source",
    })
    PRESENTATION_METHODS = frozenset({
        "create", "get", "revise_outline", "approve_outline",
        "revise", "cancel", "retry",
    })
    DOCUMENT_METHODS = frozenset({
        "list", "create", "read", "append", "prepend", "replace",
        "replace_block", "rename", "delete",
    })
    NAMESPACES = (
        "chat", "memory", "files", "documents", "canvas", "calendar",
        "routines", "research", "email", "knowledge", "presentations",
        "learning", "polls", "teacher",
    )
    DEFAULT_NAMESPACES = ("chat", "memory", "polls")

    def methods_for(self, name: str, requested: Any = None) -> frozenset[str] | None:
        built_in = (
            self.KNOWLEDGE_METHODS if name == "knowledge"
            else self.PRESENTATION_METHODS if name == "presentations"
            else self.DOCUMENT_METHODS if name == "documents"
            else None
        )
        if not isinstance(requested, list):
            return built_in
        selected = frozenset(method for method in requested if isinstance(method, str))
        return selected if built_in is None else selected & built_in

    def __init__(self) -> None:
        self.execution_id = ""
        self.run_id = ""
        self.cell_id = ""
        self.call_index = 0
        self.directives: list[dict[str, Any]] = []
        for name in self.DEFAULT_NAMESPACES:
            setattr(self, name, Namespace(self, name, self.methods_for(name)))

    def begin(self, execution_id: str, context: dict[str, Any]) -> None:
        self.execution_id = execution_id
        self.run_id = str(context.get("runId", ""))
        self.cell_id = str(context.get("cellId", execution_id))
        self.call_index = 0
        self.directives = []
        requested = context.get("allowedNamespaces")
        requested_methods = context.get("allowedMethods")
        allowed = self.DEFAULT_NAMESPACES if requested is None else tuple(
            name for name in requested if isinstance(name, str) and name in self.NAMESPACES
        )
        for name in self.NAMESPACES:
            if name in self.__dict__:
                delattr(self, name)
        for name in allowed:
            methods = self.methods_for(
                name,
                requested_methods.get(name) if isinstance(requested_methods, dict) else None,
            )
            setattr(self, name, TeacherSDK(self) if name == "teacher" else Namespace(self, name, methods))

    def call(self, action: str, args: dict[str, Any]) -> Any:
        index = self.call_index
        self.call_index += 1
        request_id = str(uuid.uuid4())
        emit({
            "type": "host_call",
            "requestId": request_id,
            "executionId": self.execution_id,
            "runId": self.run_id,
            "cellId": self.cell_id,
            "callIndex": index,
            "action": action,
            "args": args,
        })
        while True:
            response = read_message()
            if response.get("type") != "host_result" or response.get("requestId") != request_id:
                raise RuntimeError("unexpected host bridge response")
            if response.get("approval"):
                raise ApprovalPending(str(response["approval"]["id"]))
            if not response.get("ok"):
                raise RuntimeError(str(response.get("error") or "host action failed"))
            if isinstance(response.get("directive"), dict):
                self.directives.append(response["directive"])
            return response.get("value")


def safe_result(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool, list, dict)):
        encoded = json.dumps(value, ensure_ascii=False, default=str)
        return value if len(encoded) <= MAX_STREAM_CHARS else {
            "truncated": True,
            "preview": encoded[:MAX_STREAM_CHARS - 80],
        }
    if hasattr(value, "_repr_mimebundle_"):
        bundle = value._repr_mimebundle_()
        if isinstance(bundle, tuple):
            bundle = bundle[0]
        if isinstance(bundle, dict):
            encoded = json.dumps(bundle, ensure_ascii=False, default=str)
            if len(encoded) <= MAX_STREAM_CHARS:
                return {"mimeBundle": bundle}
    rich: dict[str, Any] = {}
    for method, mime in (("_repr_png_", "image/png"), ("_repr_svg_", "image/svg+xml"), ("_repr_html_", "text/html")):
        renderer = getattr(value, method, None)
        if not callable(renderer):
            continue
        rendered = renderer()
        if rendered is None:
            continue
        if isinstance(rendered, bytes):
            import base64
            rendered = base64.b64encode(rendered).decode("ascii")
        rich[mime] = str(rendered)[:MAX_STREAM_CHARS]
    if rich:
        return {"mimeBundle": rich}
    return repr(value)


def file_snapshot() -> dict[str, tuple[int, int]]:
    found: dict[str, tuple[int, int]] = {}
    for path in ROOT.rglob("*"):
        try:
            if path.is_file() and not path.is_symlink():
                stat = path.stat()
                found[path.relative_to(ROOT).as_posix()] = (stat.st_size, stat.st_mtime_ns)
        except OSError:
            continue
    return found


def changed_artifacts(before: dict[str, tuple[int, int]]) -> list[dict[str, Any]]:
    artifacts: list[dict[str, Any]] = []
    for relative, state in file_snapshot().items():
        if before.get(relative) == state:
            continue
        path = ROOT / relative
        try:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
        except OSError:
            continue
        artifacts.append({
            "path": relative,
            "size": state[0],
            "mime": mimetypes.guess_type(relative)[0] or "application/octet-stream",
            "sha256": digest,
        })
        if len(artifacts) >= 32:
            break
    return artifacts


bridge = LoopBridge()
loop = types.ModuleType("loop")
loop.__path__ = []
for namespace_name in bridge.NAMESPACES:
    namespace_module = types.ModuleType(f"loop.{namespace_name}")

    def namespace_getattr(method: str, namespace: str = namespace_name) -> Any:
        if method.startswith("_"):
            raise AttributeError(method)
        return getattr(getattr(bridge, namespace), method)

    namespace_module.__getattr__ = namespace_getattr
    setattr(loop, namespace_name, namespace_module)
    sys.modules[namespace_module.__name__] = namespace_module
sys.modules["loop"] = loop
shell = InteractiveShell.instance()
shell.user_ns["loop"] = loop
shell.user_ns["ApprovalPending"] = ApprovalPending


def execute(message: dict[str, Any]) -> None:
    execution_id = str(message["id"])
    code = str(message["code"])
    bridge.begin(execution_id, message.get("context") or {})
    stdout = io.StringIO()
    stderr = io.StringIO()
    started = time.monotonic()
    files_before = file_snapshot()
    result_value: Any = None
    error: str | None = None
    approval_id: str | None = None
    try:
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = shell.run_cell(code, store_history=True)
            if result.error_before_exec:
                raise result.error_before_exec
            if result.error_in_exec:
                raise result.error_in_exec
            result_value = safe_result(result.result)
    except ApprovalPending as pending:
        approval_id = pending.approval_id
    except BaseException as exc:  # IPython cells may raise non-Exception exits.
        error = "".join(traceback.format_exception_only(type(exc), exc)).strip()

    out = stdout.getvalue()
    err = stderr.getvalue()
    truncated = len(out) + len(err) > MAX_STREAM_CHARS
    if truncated:
        remaining = MAX_STREAM_CHARS
        out = out[:remaining]
        remaining -= len(out)
        err = err[:max(0, remaining)]
    emit({
        "type": "execution_result",
        "id": execution_id,
        "ok": error is None and approval_id is None,
        "stdout": out,
        "stderr": err,
        "result": result_value,
        "error": error,
        "approvalId": approval_id,
        "truncated": truncated,
        "durationMs": round((time.monotonic() - started) * 1000),
        "artifacts": changed_artifacts(files_before),
        "directives": bridge.directives,
    })


emit({"type": "ready", "protocol": 1, "python": sys.version.split()[0], "home": str(ROOT)})
while True:
    try:
        message = read_message()
    except EOFError:
        break
    except Exception as exc:
        emit({"type": "protocol_error", "error": str(exc)})
        continue
    if message.get("type") == "shutdown":
        break
    if message.get("type") != "execute":
        emit({"type": "protocol_error", "error": "expected execute"})
        continue
    execute(message)
