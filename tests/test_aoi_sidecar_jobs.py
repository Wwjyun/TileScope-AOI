from __future__ import annotations

import os
import tempfile
import time
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
import yaml

from core.batch_processor import BatchImageResult, BatchInspectionProcessor
from core.recipe_manager import RecipeManager

from aoi_sidecar.jobs import Job, JobFailure, JobRunner
from aoi_sidecar.protocol import BUSY, CAMERA_NOT_AVAILABLE, JsonRpcError
from aoi_sidecar.service import SidecarService

ROOT = Path(__file__).resolve().parents[1]
BASE_RECIPE = ROOT / "recipes" / "DEMO.yaml"

TERMINALS = {"job://completed", "job://failed", "job://cancelled", "monitor://stopped"}


def _write_png(path: Path, image) -> None:
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    path.write_bytes(encoded.tobytes())


def _wait_for(events, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        for topic, payload in list(events):
            if topic in TERMINALS:
                return topic, payload
        time.sleep(0.05)
    raise AssertionError(f"timed out waiting for terminal event; events={events}")


@contextmanager
def _service(tmp_dir: Path):
    events = []
    env = {
        "AOI_SIDECAR_SETTINGS_PATH": str(tmp_dir / "settings.json"),
        "AOI_SIDECAR_CACHE_DIR": str(tmp_dir / "cache"),
    }
    with patch.dict(os.environ, env):
        yield SidecarService(emit=lambda topic, payload: events.append((topic, payload))), events


def _write_recipe(root: Path, gpu: dict) -> Path:
    recipe = RecipeManager().load(BASE_RECIPE)
    recipe["gpu"] = gpu
    recipe["detectors"]["demo4"]["use_gpu"] = True
    path = root / f"recipe_{gpu['mode']}.yaml"
    path.write_text(yaml.safe_dump(recipe, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return path


class MissingDllRoutingTests(unittest.TestCase):
    def _setup(self, mode: str):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        gpu = {
            "mode": mode,
            "dll_path": "missing/visionflow_cuda.dll",
            "fallback_to_cpu": mode != "cuda",
        }
        recipe = _write_recipe(root, gpu)
        image = root / "img.png"
        _write_png(image, np.full((200, 200, 3), 200, np.uint8))
        return root, recipe, image

    def test_strict_cuda_missing_dll_fails_with_cuda_unavailable(self):
        root, recipe, image = self._setup("cuda")
        with _service(root) as (service, events):
            job = service.dispatch("start_job", {
                "image_path": str(image), "recipe_path": str(recipe), "output_dir": str(root / "out"),
            })
            topic, payload = _wait_for(events)
        self.assertEqual(topic, "job://failed")
        self.assertEqual(payload["job_id"], job["job_id"])
        self.assertEqual(payload["code"], "CUDA_UNAVAILABLE")

    def test_auto_missing_dll_completes_on_cpu(self):
        root, recipe, image = self._setup("auto")
        with _service(root) as (service, events):
            service.dispatch("start_job", {
                "image_path": str(image), "recipe_path": str(recipe), "output_dir": str(root / "out"),
            })
            topic, payload = _wait_for(events)
        self.assertEqual(topic, "job://completed")
        self.assertEqual(payload["kind"], "single")
        self.assertEqual(payload["result"]["backend"], "cpu")
        self.assertIn("backend_reason", payload["result"])


class BusyAndCancelTests(unittest.TestCase):
    def test_second_start_while_busy_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            watch = root / "watch"
            watch.mkdir()
            with _service(root) as (service, events):
                monitor = service.dispatch("monitor_start", {
                    "source": "folder", "input_dir": str(watch),
                    "recipe_path": str(BASE_RECIPE), "output_dir": str(root / "out"),
                })
                with self.assertRaises(JsonRpcError) as raised:
                    service.dispatch("start_job", {
                        "image_path": str(root / "img.png"), "recipe_path": str(BASE_RECIPE),
                        "output_dir": str(root / "out"),
                    })
                self.assertEqual(raised.exception.code, BUSY)
                service.dispatch("monitor_stop", {"job_id": monitor["job_id"]})
                _wait_for(events)

    def test_camera_monitor_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with _service(root) as (service, events):
                with self.assertRaises(JsonRpcError) as raised:
                    service.dispatch("monitor_start", {
                        "source": "camera", "input_dir": str(root), "recipe_path": str(BASE_RECIPE),
                        "output_dir": str(root / "out"),
                    })
                self.assertEqual(raised.exception.code, CAMERA_NOT_AVAILABLE)

    def test_single_cancel_discards_result_and_emits_cancelled(self):
        events = []
        runner = JobRunner(lambda topic, payload: events.append((topic, payload)))

        def run(job: Job):
            job.cancel_event.wait(10)
            return {"final_result": "PASS"}

        job = Job("j1", "single", run)
        runner.start(job)
        job.request_cancel()
        topic, payload = _wait_for(events)
        self.assertEqual(topic, "job://cancelled")
        self.assertEqual(payload["job_id"], "j1")
        job.thread.join(5)
        self.assertFalse(job.thread.is_alive())

    def test_batch_cancel_emits_cancelled_after_the_thread_ends(self):
        events = []
        runner = JobRunner(lambda topic, payload: events.append((topic, payload)))
        thread_ended = []

        def run(job: Job):
            job.cancel_event.wait(10)
            thread_ended.append(True)
            return {"summary": {"total": 1, "cancelled": 1}}

        job = Job("j2", "batch", run)
        runner.start(job)
        time.sleep(0.2)
        job.request_cancel()
        topic, payload = _wait_for(events)
        self.assertEqual(topic, "job://cancelled")
        self.assertEqual(thread_ended, [True])
        job.thread.join(5)
        self.assertFalse(job.thread.is_alive())


class MonitorTests(unittest.TestCase):
    def test_monitor_start_stop_emits_stopped_with_processed_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            watch = root / "watch"
            watch.mkdir()
            with _service(root) as (service, events):
                job = service.dispatch("monitor_start", {
                    "source": "folder", "input_dir": str(watch),
                    "recipe_path": str(BASE_RECIPE), "output_dir": str(root / "out"),
                })
                stop = service.dispatch("monitor_stop", {"job_id": job["job_id"]})
                self.assertEqual(stop, {"ok": True})
                topic, payload = _wait_for(events)
        self.assertEqual(topic, "monitor://stopped")
        self.assertEqual(payload["job_id"], job["job_id"])
        self.assertEqual(payload["dropped"], 0)
        self.assertGreaterEqual(payload["processed"], 0)

    def test_monitor_error_emits_failed_then_stopped(self):
        events = []
        runner = JobRunner(lambda topic, payload: events.append((topic, payload)))

        def run(job: Job):
            raise JobFailure("INTERNAL", "監控失敗", stage="detect")

        job = Job("jm", "monitor", run)
        runner.start(job)
        topic, payload = _wait_for(events)
        self.assertEqual(topic, "job://failed")
        self.assertEqual(payload["job_id"], "jm")
        self.assertEqual(payload["code"], "INTERNAL")
        self.assertEqual(payload["stage"], "detect")
        self.assertEqual(payload["message"], "監控失敗")

        deadline = time.time() + 10
        stopped = False
        while time.time() < deadline:
            if any(t == "monitor://stopped" and p.get("job_id") == "jm" for t, p in events):
                stopped = True
                break
            time.sleep(0.05)
        self.assertTrue(stopped, "monitor://stopped not emitted after failure")
        job.thread.join(5)
        self.assertFalse(job.thread.is_alive())


class BatchItemCallbackTests(unittest.TestCase):
    class _FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def prepare_processor_run(self, recipe_path, session_started_at, image_path=None, progress_callback=None):
            return {"session_ms": 0.0, "status": "context_only", "image_used": False}

    def test_processor_item_callback_receives_item_index_and_total(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            images = [root / "a.png", root / "b.png"]
            processor = BatchInspectionProcessor(root, root / "r.yaml", root / "out", max_workers=1)
            processor.discover_images = lambda: images
            items = []
            processor.item_callback = lambda item, index, total: items.append((index, total, item["image_name"]))

            def process_image(image_path, _out, _session):
                return BatchImageResult(image_path, "PASS", 0, 0, 1, 0.01, {}, {})

            with patch("core.batch_processor.GpuExecutionSession.from_recipe_path",
                       return_value=self._FakeSession()), \
                 patch.object(processor, "_process_image", side_effect=process_image), \
                 patch("core.batch_processor.CsvSummaryExporter.write_summary", return_value=None):
                processor.run()

        self.assertEqual([(index, total) for index, total, _ in items], [(0, 2), (1, 2)])
        self.assertEqual([name for _, _, name in items], ["a.png", "b.png"])


if __name__ == "__main__":
    unittest.main()
