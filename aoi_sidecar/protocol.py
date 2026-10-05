"""JSON-RPC 2.0 framing and dispatch over stdio (NDJSON, UTF-8).

stdout is reserved for protocol frames. The real stream is captured at startup (a duplicated
file descriptor, so a later reassignment of ``sys.stdout`` can never close it), then
``sys.stdout`` is repointed at ``sys.stderr`` so a stray ``print`` inside any handler can never
corrupt the protocol. Frame writes are serialized with a lock and flushed per line; logging and
prints go to stderr only.
"""

from __future__ import annotations

import json
import os
import sys
import threading
from typing import Any

import numpy as np

# Stable error codes (JSON-RPC ``error.data.code`` values).
INVALID_PARAMS = "INVALID_PARAMS"
METHOD_NOT_FOUND = "METHOD_NOT_FOUND"
BUSY = "BUSY"
NOT_FOUND = "NOT_FOUND"
PERMISSION_DENIED = "PERMISSION_DENIED"
RECIPE_INVALID = "RECIPE_INVALID"
CUDA_UNAVAILABLE = "CUDA_UNAVAILABLE"
CAMERA_NOT_AVAILABLE = "CAMERA_NOT_AVAILABLE"
INTERNAL = "INTERNAL"

# JSON-RPC numeric ``error.code`` values.
_NUMERIC = {
    INVALID_PARAMS: -32602,
    METHOD_NOT_FOUND: -32601,
    INTERNAL: -32603,
    BUSY: -32000,
    NOT_FOUND: -32001,
    PERMISSION_DENIED: -32002,
    RECIPE_INVALID: -32003,
    CUDA_UNAVAILABLE: -32004,
    CAMERA_NOT_AVAILABLE: -32005,
}

_DEFAULT_MESSAGES = {
    INVALID_PARAMS: "參數無效。",
    METHOD_NOT_FOUND: "找不到此方法。",
    BUSY: "已有工作執行中。",
    NOT_FOUND: "找不到指定的項目。",
    PERMISSION_DENIED: "權限不足。",
    RECIPE_INVALID: "Recipe 無效。",
    CUDA_UNAVAILABLE: "CUDA 不可用。",
    CAMERA_NOT_AVAILABLE: "相機不可用。",
    INTERNAL: "內部錯誤。",
}


class JsonRpcError(Exception):
    """An application error mapped to a stable JSON-RPC error response."""

    def __init__(self, code: str, message: str | None = None, data: dict[str, Any] | None = None):
        super().__init__(message or _DEFAULT_MESSAGES[code])
        self.code = code
        self.message = message or _DEFAULT_MESSAGES[code]
        self.extra = dict(data or {})

    def to_dict(self) -> dict:
        data = {"code": self.code}
        data.update(self.extra)
        return {
            "code": _NUMERIC[self.code],
            "message": self.message,
            "data": data,
        }


def make_json_safe(value: Any) -> Any:
    """Recursively convert numpy scalars/arrays, Paths and tuples into plain JSON types."""
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, dict):
        return {str(key): make_json_safe(val) for key, val in value.items()}
    if isinstance(value, (list, tuple)):
        return [make_json_safe(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, os.PathLike):
        return str(value)
    return str(value)


class ProtocolWriter:
    """Serialize JSON frames to the captured stdout as one UTF-8 line per frame."""

    def __init__(self, fd: int):
        self._fd = fd
        self._lock = threading.Lock()

    @property
    def fd(self) -> int:
        return self._fd

    def write(self, obj: dict) -> None:
        data = (json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        with self._lock:
            self._write_all(data)

    def _write_all(self, data: bytes) -> None:
        view = memoryview(data)
        while view:
            written = os.write(self._fd, view)
            if written is None or written <= 0:
                break
            view = view[written:]


class Protocol:
    """Own the captured stdout writer and the request dispatch loop."""

    def __init__(self, writer: ProtocolWriter, stdin_buffer=None):
        self.writer = writer
        self._stdin = stdin_buffer

    @staticmethod
    def capture_stdout() -> ProtocolWriter:
        """Capture the real stdout (as a duplicated fd), then repoint ``sys.stdout`` at stderr."""
        try:
            fd = os.dup(sys.stdout.fileno())
        except (OSError, AttributeError, ValueError):
            fd = 1
        sys.stdout = sys.stderr
        return ProtocolWriter(fd)

    def emit_event(self, topic: str, payload: dict) -> None:
        self.writer.write({
            "jsonrpc": "2.0",
            "method": "event",
            "params": {"topic": topic, "payload": make_json_safe(payload)},
        })

    def run(self, service) -> int:
        """Read requests from stdin until EOF or ``shutdown``; dispatch each to ``service``."""
        self.emit_event("runtime://status", service.runtime_status_payload())
        stdin = self._stdin if self._stdin is not None else sys.stdin.buffer
        while True:
            line = stdin.readline()
            if not line:
                break
            # A host whose stdin encoder emits a UTF-8 BOM (Windows PowerShell 5.1 consoles do) must not
            # lose its first request, so tolerate a leading BOM on any line.
            text = line.decode("utf-8", errors="replace").lstrip("﻿").strip()
            if not text:
                continue
            try:
                request = json.loads(text)
            except json.JSONDecodeError as exc:
                self.writer.write({
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": JsonRpcError(INVALID_PARAMS, f"無法解析的 JSON：{exc}").to_dict(),
                })
                continue
            if self.handle_request(service, request):
                break
        service.shutdown()
        return 0

    def handle_request(self, service, request) -> bool:
        """Dispatch one parsed request; return True when the loop must stop (shutdown)."""
        if not isinstance(request, dict):
            self._write_error(None, JsonRpcError(INVALID_PARAMS, "請求必須是 JSON 物件。"))
            return False
        method = request.get("method")
        request_id = request.get("id")
        params = request.get("params") or {}
        if not isinstance(params, dict):
            self._write_error(request_id, JsonRpcError(INVALID_PARAMS, "params 必須是物件。"))
            return False

        if method == "shutdown":
            self._write_result(request_id, service.shutdown_response())
            return True
        if not isinstance(method, str) or not method:
            self._write_error(request_id, JsonRpcError(METHOD_NOT_FOUND))
            return False

        try:
            result = service.dispatch(method, params)
            self._write_result(request_id, result)
        except JsonRpcError as exc:
            self._write_error(request_id, exc)
        except Exception as exc:  # noqa: BLE001 - a method must never kill the loop
            import logging

            logging.getLogger("aoi.sidecar").exception("Unhandled method error: %s", method)
            self._write_error(request_id, JsonRpcError(INTERNAL, f"內部錯誤：{exc}"))
        return False

    def _write_result(self, request_id, result) -> None:
        self.writer.write({"jsonrpc": "2.0", "id": request_id, "result": make_json_safe(result)})

    def _write_error(self, request_id, error: JsonRpcError) -> None:
        self.writer.write({"jsonrpc": "2.0", "id": request_id, "error": error.to_dict()})
