from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path

import cv2
import numpy as np

from core.csv_summary import CsvSummaryExporter
from core.pipeline import AOIPipeline

ROOT = Path(__file__).resolve().parents[1]
BASE_RECIPE = ROOT / "recipes" / "DEMO.yaml"


def _write_png(path: Path, image) -> None:
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    path.write_bytes(encoded.tobytes())


def _send(proc, obj) -> None:
    proc.stdin.write((json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8"))
    proc.stdin.flush()


class _LineStream:
    def __init__(self, stream):
        self._queue = queue.Queue()
        self._thread = threading.Thread(target=self._pump, args=(stream,), daemon=True)
        self._thread.start()

    def _pump(self, stream):
        try:
            for line in iter(stream.readline, b""):
                self._queue.put(line)
        finally:
            self._queue.put(None)

    def readline(self, timeout=120):
        line = self._queue.get(timeout=timeout)
        return line


def _read_frame(stream: _LineStream, timeout=120):
    while True:
        line = stream.readline(timeout)
        if line is None:
            raise AssertionError("sidecar stdout closed unexpectedly")
        text = line.decode("utf-8", errors="replace").strip()
        if text:
            return json.loads(text)


def _read_response(stream: _LineStream, request_id, timeout=120):
    while True:
        frame = _read_frame(stream, timeout)
        if frame.get("id") == request_id:
            return frame


class SidecarEndToEndTests(unittest.TestCase):
    def test_startup_hello_job_and_shutdown(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image_path = root / "input.png"
            image = np.full((600, 600, 3), 200, np.uint8)
            cv2.rectangle(image, (200, 200), (240, 240), (20, 20, 20), -1)
            _write_png(image_path, image)

            direct_out = root / "direct"
            with AOIPipeline(recipe_path=BASE_RECIPE, output_dir=direct_out) as pipeline:
                direct = pipeline.run(image_path)
            CsvSummaryExporter.finalize_result(direct_out, direct)

            env = os.environ.copy()
            env["AOI_SIDECAR_CACHE_DIR"] = str(root / "cache")
            env["AOI_SIDECAR_SETTINGS_PATH"] = str(root / "settings.json")
            env["AOI_LOG_DIR"] = str(root / "logs")
            stderr_log = root / "stderr.log"
            with open(stderr_log, "wb") as stderr:
                proc = subprocess.Popen(
                    [sys.executable, "-m", "aoi_sidecar"],
                    cwd=str(ROOT),
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=stderr,
                    env=env,
                )
            try:
                stream = _LineStream(proc.stdout)

                frame = _read_frame(stream)
                self.assertEqual(frame.get("method"), "event")
                self.assertEqual(frame["params"]["topic"], "runtime://status")
                self.assertEqual(frame["params"]["payload"]["sidecar"], "ready")

                _send(proc, {"jsonrpc": "2.0", "id": 1, "method": "hello", "params": {}})
                hello = _read_response(stream, 1)
                self.assertEqual(hello["result"]["protocol_version"], 1)
                self.assertIn("core_version", hello["result"])
                self.assertIn("pid", hello["result"])

                _send(proc, {
                    "jsonrpc": "2.0", "id": 2, "method": "start_job",
                    "params": {
                        "image_path": str(image_path),
                        "recipe_path": str(BASE_RECIPE),
                        "output_dir": str(root / "out"),
                    },
                })
                start = _read_response(stream, 2)
                job_id = start["result"]["job_id"]
                self.assertTrue(job_id)

                payload = None
                while payload is None:
                    frame = _read_frame(stream)
                    if frame.get("method") != "event":
                        continue
                    topic = frame["params"]["topic"]
                    if topic == "job://completed":
                        payload = frame["params"]["payload"]
                    elif topic == "job://failed":
                        self.fail(f"job failed: {frame['params']['payload']}")

                self.assertEqual(payload["job_id"], job_id)
                self.assertEqual(payload["kind"], "single")
                result = payload["result"]
                self.assertEqual(result["final_result"], direct["final_result"])
                self.assertEqual(result["summary"]["defect_count"], direct["summary"]["defect_count"])
                self.assertEqual(result["backend"], "cpu")
                self.assertIn("outputs", result)
                self.assertIn("performance", result)
                self.assertIn("dur_ms", result)

                _send(proc, {"jsonrpc": "2.0", "id": 3, "method": "shutdown", "params": {}})
                shutdown = _read_response(stream, 3)
                self.assertEqual(shutdown["result"], {"ok": True})
                proc.stdin.close()
                proc.wait(timeout=30)
                self.assertEqual(proc.returncode, 0)
            finally:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait()
                for stream in (proc.stdin, proc.stdout):
                    if stream is not None:
                        try:
                            stream.close()
                        except OSError:
                            pass


if __name__ == "__main__":
    unittest.main()
