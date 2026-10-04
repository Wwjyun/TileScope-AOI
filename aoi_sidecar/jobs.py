"""Background job runner: one job at a time, cooperative cancellation, terminal events.

Cancellation is cooperative: batch sets the processor ``cancel_event`` (stops after the current
image), monitor flips its stop callback, and a single-image run is only marked cancelled so its
result is discarded when the thread returns. ``job://cancelled`` is emitted only after the worker
thread has finished, matching the resource-release ordering the host relies on.
"""

from __future__ import annotations

import threading
import uuid
from typing import Callable


class JobFailure(Exception):
    """A job failure that maps to a stable ``job://failed`` code."""

    def __init__(self, code: str, message: str, stage: str = "running"):
        super().__init__(message)
        self.code = code
        self.message = message
        self.stage = stage


_STAGE_MARKERS = (
    ("done", ("檢測完成", "預熱完成", "對照完成", "已就緒", "已停止")),
    ("write_outputs", ("寫出", "報表", "輸出 CSV", "輸出 JSON")),
    ("aggregate", ("彙總", "PASS／NG")),
    ("tiling", ("切圖", "ROI 產生")),
    ("load_image", ("影像已載入", "載入影像", "讀圖", "正在載入影像")),
    ("init_backend", ("Recipe 已載入", "初始化", "GPU", "建立 session", "建立 CUDA")),
    ("detect", ("Detector", "檢測 Tile", "批量", "已處理")),
)


def derive_stage(pct, message) -> str:
    """A short stage name from the progress message/percent, else ``"running"``."""
    if message:
        for stage, markers in _STAGE_MARKERS:
            if any(marker in message for marker in markers):
                return stage
    if pct is None:
        return "running"
    try:
        pct = int(pct)
    except (TypeError, ValueError):
        return "running"
    if pct >= 100:
        return "done"
    if pct >= 90:
        return "write_outputs"
    if pct >= 80:
        return "aggregate"
    if pct >= 20:
        return "detect"
    if pct >= 10:
        return "tiling"
    if pct >= 5:
        return "load_image"
    return "init_backend"


class Job:
    def __init__(self, job_id: str, kind: str, run_fn: Callable[["Job"], dict]):
        self.job_id = job_id
        self.kind = kind
        self.run_fn = run_fn
        self.cancel_event = threading.Event()
        self._stop_requested = False
        self.cancel_requested = False
        self.last_stage = "running"
        self.result: dict | None = None
        self.error: JobFailure | None = None
        self.thread: threading.Thread | None = None
        self.done = threading.Event()

    def stop_requested(self) -> bool:
        return self._stop_requested

    def request_cancel(self) -> None:
        self.cancel_requested = True
        self.cancel_event.set()
        self._stop_requested = True


def make_progress_emitter(job: Job, emit: Callable[[str, dict], None]):
    """Return a ``(pct, message)`` callback that emits ``job://progress``."""

    def progress(pct, message: str) -> None:
        stage = derive_stage(pct, message)
        job.last_stage = stage
        emit("job://progress", {
            "job_id": job.job_id,
            "pct": int(pct or 0),
            "message": message,
            "stage": stage,
        })

    return progress


def new_job_id() -> str:
    return uuid.uuid4().hex[:12]


class JobRunner:
    def __init__(self, emit: Callable[[str, dict], None]):
        self._emit = emit
        self._lock = threading.Lock()
        self._current: Job | None = None

    @property
    def busy(self) -> bool:
        with self._lock:
            return self._current is not None and not self._current.done.is_set()

    def current_job_id(self) -> str | None:
        with self._lock:
            if self._current is not None and not self._current.done.is_set():
                return self._current.job_id
            return None

    def get_job(self, job_id: str) -> Job | None:
        with self._lock:
            if self._current is not None and self._current.job_id == job_id:
                return self._current
            return None

    def start(self, job: Job) -> None:
        with self._lock:
            if self._current is not None and not self._current.done.is_set():
                from aoi_sidecar.protocol import BUSY, JsonRpcError

                raise JsonRpcError(BUSY, "已有工作執行中，請先等待或取消目前工作。")
            self._current = job
        job.thread = threading.Thread(
            target=self._thread_main, args=(job,), name=f"aoi-job-{job.job_id}", daemon=True
        )
        job.thread.start()

    def _thread_main(self, job: Job) -> None:
        try:
            job.result = job.run_fn(job)
        except JobFailure as exc:
            job.error = exc
        except Exception as exc:  # noqa: BLE001 - report the failure, keep the runner alive
            import logging

            logging.getLogger("aoi.sidecar.jobs").exception("Job failed: %s", job.job_id)
            job.error = JobFailure("INTERNAL", f"內部錯誤：{exc}", stage=job.last_stage)
        finally:
            job.done.set()
            self._emit_terminal(job)

    def _emit_terminal(self, job: Job) -> None:
        if job.kind == "monitor":
            if job.error is not None:
                self._emit("job://failed", {
                    "job_id": job.job_id,
                    "code": job.error.code,
                    "stage": job.error.stage,
                    "message": job.error.message,
                })
            processed = int((job.result or {}).get("processed", 0) or 0)
            self._emit("monitor://stopped", {"job_id": job.job_id, "processed": processed, "dropped": 0})
            return
        if job.cancel_requested:
            self._emit("job://cancelled", {"job_id": job.job_id})
            return
        if job.error is not None:
            self._emit("job://failed", {
                "job_id": job.job_id,
                "code": job.error.code,
                "stage": job.error.stage,
                "message": job.error.message,
            })
            return
        self._emit("job://completed", {"job_id": job.job_id, "kind": job.kind, "result": job.result})

    def shutdown(self) -> None:
        with self._lock:
            job = self._current
        if job is not None and not job.done.is_set():
            job.request_cancel()
        if job is not None and job.thread is not None and job.thread.is_alive():
            job.thread.join()
