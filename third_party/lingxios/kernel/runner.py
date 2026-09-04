"""Persistent sandboxed Python worker for the LingxiOS Agent OS (protocol 2).

One runner process serves one agent session. The transport is newline-delimited
JSON over stdio; every non-ASCII character is escaped so the protocol is
locale-independent under ``python -I``.

Design invariants:

* Product operations are never implemented here. ``host.<namespace>.<method>``
  emits a ``host_call`` and blocks until the matching ``host_result``. The
  parent process owns authorization, approvals, idempotency, and durable state.
* The capability set is supplied per execution by the manager. Nothing is
  hardcoded; an ungranted namespace or method is not even addressable.
* The in-process sandbox (audit hooks, socket patching) is defense in depth
  for *accidental* misuse. Authoritative capability enforcement happens in the
  control plane, which validates every action against the durable grant.
"""

from __future__ import annotations

import ast
import base64
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

KERNEL_PROTOCOL_VERSION = 2
SDK_MODULE_NAME = "host"

MAX_STREAM_CHARS = int(os.environ.get("AGENT_OS_KERNEL_MAX_OUTPUT_CHARS", "8000"))
MAX_ARTIFACTS = int(os.environ.get("AGENT_OS_KERNEL_MAX_ARTIFACTS", "32"))
ROOT = pathlib.Path(os.environ["AGENT_OS_KERNEL_HOME"]).resolve()
HOMES_ROOT = pathlib.Path(os.environ.get("AGENT_OS_HOMES_ROOT", str(ROOT.parent))).resolve()
ALLOW_NETWORK = os.environ.get("AGENT_OS_KERNEL_ALLOW_NETWORK") == "1"
ROOT.mkdir(parents=True, exist_ok=True)
os.chdir(ROOT)


# ---------------------------------------------------------------------------
# Wire helpers
# ---------------------------------------------------------------------------

def emit(payload: dict[str, Any]) -> None:
    sys.__stdout__.write(json.dumps(payload, ensure_ascii=True, default=str) + "\n")
    sys.__stdout__.flush()


def read_message() -> dict[str, Any]:
    line = sys.__stdin__.readline()
    if not line:
        raise EOFError()
    value = json.loads(line)
    if not isinstance(value, dict):
        raise ValueError("protocol message must be a JSON object")
    return value


# ---------------------------------------------------------------------------
# Sandbox: network, filesystem, and child-process fences
# ---------------------------------------------------------------------------

def deny_network(*_args: Any, **_kwargs: Any) -> Any:
    raise PermissionError(
        "direct network access is disabled; use a granted host.<namespace> capability"
    )


if not ALLOW_NETWORK:
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
        path = pathlib.Path(os.fsdecode(args[0])).resolve()
        mode = str(args[1]) if len(args) > 1 else "r"
        if is_within(path, HOMES_ROOT) and not is_within(path, ROOT):
            raise PermissionError("cross-session file access is disabled")
        if any(flag in mode for flag in ("w", "a", "x", "+")) and not is_within(path, ROOT):
            raise PermissionError("files may only be written inside this agent home")
    if event in {"os.system", "subprocess.Popen"}:
        # A child process would escape the in-process audit fences, so shell
        # effects must go through a typed host capability instead.
        raise PermissionError("direct child processes are disabled in this kernel sandbox")
    if event.startswith("socket.") and not ALLOW_NETWORK:
        raise PermissionError("direct network access is disabled")


sys.addaudithook(kernel_audit)


# ---------------------------------------------------------------------------
# Host bridge
# ---------------------------------------------------------------------------

class ApprovalPending(RuntimeError):
    """Raised when a host action suspended into a human approval."""

    def __init__(self, approval_id: str):
        super().__init__(f"approval pending: {approval_id}")
        self.approval_id = approval_id


class HostBridge:
    def __init__(self) -> None:
        self.execution_id = ""
        self.run_id = ""
        self.cell_id = ""
        self.call_index = 0
        self.directives: list[dict[str, Any]] = []
        self.capabilities: dict[str, frozenset[str] | None] = {}

    def begin(self, execution_id: str, context: dict[str, Any]) -> None:
        self.execution_id = execution_id
        self.run_id = str(context.get("runId", ""))
        self.cell_id = str(context.get("cellId", execution_id))
        self.call_index = 0
        self.directives = []
        self.capabilities = {}
        for grant in context.get("capabilities") or []:
            if not isinstance(grant, dict):
                continue
            name = grant.get("name")
            if not isinstance(name, str) or not name.isidentifier() or name.startswith("_"):
                continue
            methods = grant.get("methods")
            allowed: frozenset[str] | None = None
            if isinstance(methods, list):
                allowed = frozenset(m for m in methods if isinstance(m, str) and m.isidentifier())
            self.capabilities[name] = allowed

    def allows(self, namespace: str, method: str) -> bool:
        if namespace not in self.capabilities or method.startswith("_"):
            return False
        allowed = self.capabilities[namespace]
        return allowed is None or method in allowed

    def call(self, action: str, args: dict[str, Any]) -> Any:
        index = self.call_index
        self.call_index += 1
        request_id = str(uuid.uuid4())
        emit({
            "type": "host_call",
            "id": self.execution_id,
            "requestId": request_id,
            "callIndex": index,
            "action": action,
            "args": args,
        })
        response = read_message()
        if response.get("type") != "host_result" or response.get("requestId") != request_id:
            raise RuntimeError("unexpected host bridge response")
        approval = response.get("approval")
        if isinstance(approval, dict) and approval.get("id"):
            raise ApprovalPending(str(approval["id"]))
        if not response.get("ok"):
            raise RuntimeError(str(response.get("error") or "host action failed"))
        if isinstance(response.get("directive"), dict):
            self.directives.append(response["directive"])
        return response.get("value")


bridge = HostBridge()


class _NamespaceModule(types.ModuleType):
    """`host.<namespace>` — methods resolve lazily against the current grant."""

    def __init__(self, namespace: str):
        super().__init__(f"{SDK_MODULE_NAME}.{namespace}")
        self._namespace = namespace

    def __getattr__(self, method: str) -> Any:
        if not bridge.allows(self._namespace, method):
            raise AttributeError(
                f"capability '{self._namespace}.{method}' is not granted to this execution"
            )
        namespace = self._namespace

        def invoke(**kwargs: Any) -> Any:
            return bridge.call(f"{namespace}.{method}", kwargs)

        invoke.__name__ = method
        return invoke


class _SdkModule(types.ModuleType):
    """`host` — namespaces resolve lazily against the current grant."""

    def __getattr__(self, namespace: str) -> Any:
        if namespace.startswith("_") or namespace not in bridge.capabilities:
            raise AttributeError(
                f"capability namespace '{namespace}' is not granted to this execution"
            )
        module = _NamespaceModule(namespace)
        sys.modules[module.__name__] = module
        return module


sdk = _SdkModule(SDK_MODULE_NAME)
sdk.__path__ = []  # mark as a package so `import host.files` resolves
sys.modules[SDK_MODULE_NAME] = sdk


# ---------------------------------------------------------------------------
# Cell execution engines
# ---------------------------------------------------------------------------

class CellOutcome:
    def __init__(self, result: Any = None, error: BaseException | None = None):
        self.result = result
        self.error = error


class BasicEngine:
    """Fallback engine when IPython is unavailable: exec with expression-result
    semantics (the value of a trailing expression becomes the cell result)."""

    name = "basic"

    def __init__(self) -> None:
        self.user_ns: dict[str, Any] = {"__name__": "__main__"}

    def run_cell(self, code: str) -> CellOutcome:
        try:
            tree = ast.parse(code, mode="exec")
        except SyntaxError as exc:
            return CellOutcome(error=exc)
        trailing_expr: ast.Expression | None = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            trailing_expr = ast.Expression(tree.body.pop(-1).value)
        try:
            if tree.body:
                exec(compile(tree, "<cell>", "exec"), self.user_ns)  # noqa: S102
            if trailing_expr is not None:
                return CellOutcome(result=eval(compile(trailing_expr, "<cell>", "eval"), self.user_ns))  # noqa: S307
            return CellOutcome()
        except BaseException as exc:  # cells may raise non-Exception exits
            return CellOutcome(error=exc)


class IPythonEngine:
    name = "ipython"

    def __init__(self, shell: Any):
        self.shell = shell
        self.user_ns = shell.user_ns

    def run_cell(self, code: str) -> CellOutcome:
        result = self.shell.run_cell(code, store_history=True)
        if result.error_before_exec is not None:
            return CellOutcome(error=result.error_before_exec)
        if result.error_in_exec is not None:
            return CellOutcome(error=result.error_in_exec)
        return CellOutcome(result=result.result)


def create_engine() -> BasicEngine | IPythonEngine:
    try:
        from IPython.core.interactiveshell import InteractiveShell  # noqa: PLC0415
    except ImportError:
        return BasicEngine()
    return IPythonEngine(InteractiveShell.instance())


engine = create_engine()
engine.user_ns[SDK_MODULE_NAME] = sdk
engine.user_ns["ApprovalPending"] = ApprovalPending


# ---------------------------------------------------------------------------
# Result shaping and artifact tracking
# ---------------------------------------------------------------------------

def safe_result(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool, list, dict)):
        encoded = json.dumps(value, ensure_ascii=False, default=str)
        if len(encoded) <= MAX_STREAM_CHARS:
            return value
        return {"truncated": True, "preview": encoded[: MAX_STREAM_CHARS - 80]}
    if hasattr(value, "_repr_mimebundle_"):
        bundle = value._repr_mimebundle_()
        if isinstance(bundle, tuple):
            bundle = bundle[0]
        if isinstance(bundle, dict):
            encoded = json.dumps(bundle, ensure_ascii=False, default=str)
            if len(encoded) <= MAX_STREAM_CHARS:
                return {"mimeBundle": bundle}
    rich: dict[str, str] = {}
    for method, mime in (
        ("_repr_png_", "image/png"),
        ("_repr_svg_", "image/svg+xml"),
        ("_repr_html_", "text/html"),
    ):
        renderer = getattr(value, method, None)
        if not callable(renderer):
            continue
        try:
            rendered = renderer()
        except Exception:
            continue
        if rendered is None:
            continue
        if isinstance(rendered, bytes):
            rendered = base64.b64encode(rendered).decode("ascii")
        rich[mime] = str(rendered)[:MAX_STREAM_CHARS]
    if rich:
        return {"mimeBundle": rich}
    return repr(value)[:MAX_STREAM_CHARS]


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
        if len(artifacts) >= MAX_ARTIFACTS:
            break
    return artifacts


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

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
            outcome = engine.run_cell(code)
            if outcome.error is not None:
                raise outcome.error
            result_value = safe_result(outcome.result)
    except ApprovalPending as pending:
        approval_id = pending.approval_id
    except BaseException as exc:
        error = "".join(traceback.format_exception_only(type(exc), exc)).strip()

    out = stdout.getvalue()
    err = stderr.getvalue()
    truncated = len(out) + len(err) > MAX_STREAM_CHARS
    if truncated:
        remaining = MAX_STREAM_CHARS
        out = out[:remaining]
        remaining -= len(out)
        err = err[: max(0, remaining)]
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


def main() -> None:
    emit({
        "type": "ready",
        "protocol": KERNEL_PROTOCOL_VERSION,
        "python": sys.version.split()[0],
        "engine": engine.name,
        "home": str(ROOT),
    })
    while True:
        try:
            message = read_message()
        except EOFError:
            return
        except Exception as exc:
            emit({"type": "protocol_error", "error": str(exc)})
            continue
        message_type = message.get("type")
        if message_type == "shutdown":
            return
        if message_type != "execute":
            emit({"type": "protocol_error", "error": "expected execute"})
            continue
        execute(message)


if __name__ == "__main__":
    main()
