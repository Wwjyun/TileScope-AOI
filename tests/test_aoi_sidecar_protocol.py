from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

from aoi_sidecar.protocol import (
    INTERNAL,
    INVALID_PARAMS,
    METHOD_NOT_FOUND,
    JsonRpcError,
    Protocol,
    ProtocolWriter,
    make_json_safe,
)


class _FakeService:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def dispatch(self, method, params):
        self.calls.append((method, params))
        if method == "boom":
            raise JsonRpcError(INTERNAL, "炸掉了")
        if method == "needs_params":
            raise JsonRpcError(INVALID_PARAMS, "缺少必要參數：x")
        if method == "printy":
            print("stray-print-marker")
            return {"ok": True}
        if method == "hello":
            return {"method": method}
        raise JsonRpcError(METHOD_NOT_FOUND, f"找不到方法：{method}")

    def shutdown_response(self):
        return {"ok": True}


class ProtocolDispatchTests(unittest.TestCase):
    def _dispatch(self, request, service=None):
        fd, name = tempfile.mkstemp()
        try:
            writer = ProtocolWriter(fd)
            protocol = Protocol(writer=writer)
            protocol.handle_request(service or _FakeService(), request)
            os.lseek(fd, 0, os.SEEK_SET)
            raw = os.read(fd, 4096).decode("utf-8")
            return [json.loads(line) for line in raw.splitlines() if line.strip()]
        finally:
            os.close(fd)
            os.unlink(name)

    def test_result_frame(self):
        frames = self._dispatch({"jsonrpc": "2.0", "id": 1, "method": "hello", "params": {}})
        self.assertEqual(frames[0], {"jsonrpc": "2.0", "id": 1, "result": {"method": "hello"}})

    def test_unknown_method_error_shape(self):
        frames = self._dispatch({"jsonrpc": "2.0", "id": 3, "method": "nope", "params": {}})
        error = frames[0]["error"]
        self.assertEqual(frames[0]["id"], 3)
        self.assertNotIn("result", frames[0])
        self.assertIsInstance(error["code"], int)
        self.assertEqual(error["data"]["code"], METHOD_NOT_FOUND)
        self.assertIn("message", error)

    def test_invalid_params_error_shape(self):
        frames = self._dispatch({"jsonrpc": "2.0", "id": 4, "method": "needs_params", "params": {}})
        error = frames[0]["error"]
        self.assertEqual(error["data"]["code"], INVALID_PARAMS)
        self.assertEqual(error["code"], -32602)

    def test_application_error_keeps_stable_code_in_data(self):
        frames = self._dispatch({"jsonrpc": "2.0", "id": 5, "method": "boom", "params": {}})
        self.assertEqual(frames[0]["error"]["data"]["code"], INTERNAL)
        self.assertEqual(frames[0]["error"]["message"], "炸掉了")

    def test_shutdown_returns_ok_and_stops_the_loop(self):
        service = _FakeService()
        fd, name = tempfile.mkstemp()
        try:
            protocol = Protocol(writer=ProtocolWriter(fd))
            stop = protocol.handle_request(service, {"jsonrpc": "2.0", "id": 9, "method": "shutdown", "params": {}})
            self.assertTrue(stop)
        finally:
            os.close(fd)
            os.unlink(name)


class StrayPrintTests(unittest.TestCase):
    def test_capture_stdout_points_sys_stdout_at_stderr(self):
        old_stdout, old_stderr = sys.stdout, sys.stderr
        captured = io.StringIO()
        try:
            sys.stderr = captured
            writer = Protocol.capture_stdout()
            try:
                self.assertIs(sys.stdout, sys.stderr)
                print("stray-print-marker")
                self.assertIn("stray-print-marker", captured.getvalue())
            finally:
                os.close(writer.fd)
        finally:
            sys.stdout, sys.stderr = old_stdout, old_stderr

    def test_print_inside_handler_never_reaches_the_protocol_stream(self):
        old_stdout, old_stderr = sys.stdout, sys.stderr
        captured = io.StringIO()
        fd, name = tempfile.mkstemp()
        try:
            sys.stderr = captured
            captured_writer = Protocol.capture_stdout()  # sys.stdout -> stderr (StringIO)
            try:
                writer = ProtocolWriter(fd)
                protocol = Protocol(writer=writer)
                protocol.handle_request(
                    _FakeService(), {"jsonrpc": "2.0", "id": 9, "method": "printy", "params": {}}
                )
                os.lseek(fd, 0, os.SEEK_SET)
                raw = os.read(fd, 4096).decode("utf-8")
                self.assertNotIn("stray-print-marker", raw)
                frames = [json.loads(line) for line in raw.splitlines() if line.strip()]
                self.assertEqual(frames[0]["result"], {"ok": True})
            finally:
                os.close(captured_writer.fd)
            self.assertIn("stray-print-marker", captured.getvalue())
        finally:
            os.close(fd)
            os.unlink(name)
            sys.stdout, sys.stderr = old_stdout, old_stderr


class JsonSafeTests(unittest.TestCase):
    def test_make_json_safe_converts_numpy_and_paths(self):
        value = {
            "int": np.int64(3),
            "float": np.float32(0.5),
            "bool": np.bool_(True),
            "array": np.array([1, 2, 3]),
            "tuple": (1, 2),
            "path": Path("x"),
            "nested": [np.uint8(9)],
        }
        safe = make_json_safe(value)
        self.assertEqual(safe["int"], 3)
        self.assertEqual(safe["float"], 0.5)
        self.assertIs(safe["bool"], True)
        self.assertEqual(safe["array"], [1, 2, 3])
        self.assertEqual(safe["tuple"], [1, 2])
        self.assertEqual(safe["path"], "x")
        self.assertEqual(safe["nested"], [9])
        json.dumps(safe)  # must not raise


class ProtocolWriterTests(unittest.TestCase):
    def test_writer_emits_ndjson_utf8(self):
        fd, name = tempfile.mkstemp()
        try:
            writer = ProtocolWriter(fd)
            writer.write({"jsonrpc": "2.0", "id": 1, "result": {"msg": "繁體中文"}})
            os.lseek(fd, 0, os.SEEK_SET)
            raw = os.read(fd, 4096).decode("utf-8")
            self.assertTrue(raw.endswith("\n"))
            frame = json.loads(raw.strip())
            self.assertEqual(frame["result"]["msg"], "繁體中文")
        finally:
            os.close(fd)
            os.unlink(name)


if __name__ == "__main__":
    unittest.main()
