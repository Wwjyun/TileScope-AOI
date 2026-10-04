"""Method implementations for the sidecar service (no Qt)."""

from __future__ import annotations

import json
import os
from pathlib import Path

from core.access_control import MODE_LABELS, PermissionManager
from core.backend_comparison import BackendComparison, actual_gpu_backend
from core.batch_processor import BatchInspectionProcessor
from core.csv_summary import CsvSummaryExporter
from core.gpu_runtime import GpuRuntime, GpuRuntimeError
from core.gpu_session import GpuExecutionSessionCache
from core.monitor_processor import FolderMonitorProcessor
from core.pipeline import AOIPipeline
from core.recipe_manager import RecipeError, RecipeManager
from gui.performance_summary import performance_summary

from aoi_sidecar import devices_probe, previews, recipes as recipe_api, settings_store
from aoi_sidecar.jobs import Job, JobFailure, JobRunner, make_progress_emitter, new_job_id
from aoi_sidecar.protocol import (
    CAMERA_NOT_AVAILABLE,
    CUDA_UNAVAILABLE,
    INTERNAL,
    INVALID_PARAMS,
    METHOD_NOT_FOUND,
    NOT_FOUND,
    PERMISSION_DENIED,
    RECIPE_INVALID,
    JsonRpcError,
    make_json_safe,
)
from aoi_sidecar.version import CORE_VERSION, PROTOCOL_VERSION


def _require(params: dict, *names: str) -> None:
    for name in names:
        if params.get(name) in (None, ""):
            raise JsonRpcError(INVALID_PARAMS, f"缺少必要參數：{name}")


def _load_passwords() -> dict[str, str] | None:
    path = os.environ.get("AOI_SIDECAR_PASSWORDS_FILE")
    if not path:
        return None
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    return {str(key): str(value) for key, value in data.items()}


def _existing_outputs(outputs: dict) -> dict:
    existing = {}
    for key in ("overlay", "csv", "json", "matrix_csv", "ng_tiles_dir"):
        value = (outputs or {}).get(key)
        if value and Path(str(value)).exists():
            existing[key] = str(value)
    return existing


class SidecarService:
    def __init__(self, emit):
        self._emit = emit
        self.permission_manager = PermissionManager(_load_passwords())
        self.recipe_manager = RecipeManager()
        self.jobs = JobRunner(emit)
        self.gpu_session_cache = GpuExecutionSessionCache(workload="throughput")

    # ---- dispatch ---------------------------------------------------------

    def dispatch(self, method: str, params: dict):
        handler = getattr(self, f"_m_{method}", None)
        if handler is None:
            raise JsonRpcError(METHOD_NOT_FOUND, f"找不到方法：{method}")
        return handler(params)

    # ---- runtime ----------------------------------------------------------

    def runtime_status_payload(self) -> dict:
        dll_path = GpuRuntime._resolve_path(GpuRuntime.DEFAULT_DLL)
        present = dll_path.exists()
        return {
            "sidecar": "ready",
            "pid": os.getpid(),
            "core_version": CORE_VERSION,
            "mode": self.permission_manager.current_mode,
            "busy": self.jobs.current_job_id(),
            "cuda": {
                "dll_path": str(dll_path),
                "dll": "present" if present else "missing",
                "note": "" if present else "找不到 CUDA DLL（gpu/visionflow_cuda.dll），GPU 功能不可用。",
            },
            "devices": devices_probe.probe_devices(),
        }

    def shutdown_response(self) -> dict:
        return {"ok": True}

    def shutdown(self) -> None:
        self.jobs.shutdown()
        self.gpu_session_cache.close()

    def _m_hello(self, params) -> dict:
        return {
            "protocol_version": PROTOCOL_VERSION,
            "core_version": CORE_VERSION,
            "pid": os.getpid(),
        }

    def _m_runtime_status(self, params) -> dict:
        return self.runtime_status_payload()

    def _m_switch_mode(self, params) -> dict:
        mode = params.get("mode")
        password = str(params.get("password", ""))
        if mode not in MODE_LABELS:
            raise JsonRpcError(INVALID_PARAMS, f"未知模式：{mode}")
        if not self.permission_manager.switch_mode(mode, password):
            raise JsonRpcError(PERMISSION_DENIED, f"{MODE_LABELS[mode]}密碼錯誤，權限未變更。")
        return {"mode": self.permission_manager.current_mode}

    # ---- recipes ----------------------------------------------------------

    def _m_list_recipes(self, params) -> list:
        return recipe_api.list_recipes(params.get("dir"))

    def _m_detector_catalog(self, params) -> list:
        return recipe_api.detector_catalog(self.permission_manager.current_mode == "admin")

    def _m_load_recipe(self, params) -> dict:
        path = params.get("path")
        _require(params, "path")
        if not Path(path).exists():
            raise JsonRpcError(NOT_FOUND, f"找不到 Recipe 檔案：{path}")
        try:
            return recipe_api.load_recipe(path, self.permission_manager.current_mode == "admin")
        except RecipeError as exc:
            raise JsonRpcError(RECIPE_INVALID, str(exc)) from exc

    def _m_save_recipe(self, params) -> dict:
        if self.permission_manager.current_mode == "op":
            raise JsonRpcError(PERMISSION_DENIED, "OP 模式無法儲存 Recipe。")
        _require(params, "path", "recipe")
        recipe = params.get("recipe")
        if not isinstance(recipe, dict):
            raise JsonRpcError(INVALID_PARAMS, "save_recipe 的 recipe 必須是物件。")
        try:
            return recipe_api.save_recipe(
                params["path"], recipe,
                admin=self.permission_manager.current_mode == "admin",
                base_path=params.get("base_path"),
            )
        except RecipeError as exc:
            raise JsonRpcError(RECIPE_INVALID, str(exc)) from exc
        except (ValueError, TypeError) as exc:
            raise JsonRpcError(RECIPE_INVALID, str(exc)) from exc

    # ---- jobs -------------------------------------------------------------

    def _m_start_job(self, params) -> dict:
        _require(params, "image_path", "recipe_path", "output_dir")
        job = Job(new_job_id(), "single", self._single_runner(
            params["image_path"], params["recipe_path"], params["output_dir"], params.get("output_overrides"),
        ))
        self.jobs.start(job)
        return {"job_id": job.job_id}

    def _m_start_batch(self, params) -> dict:
        _require(params, "input_dir", "recipe_path", "output_dir")
        job = Job(new_job_id(), "batch", self._batch_runner(
            params["input_dir"], params["recipe_path"], params["output_dir"],
            bool(params.get("recursive", False)), params.get("output_overrides"),
        ))
        self.jobs.start(job)
        return {"job_id": job.job_id}

    def _m_monitor_start(self, params) -> dict:
        source = params.get("source", "folder")
        if source != "folder":
            raise JsonRpcError(CAMERA_NOT_AVAILABLE, "相機直連監控將於設備整合階段提供")
        _require(params, "input_dir", "recipe_path", "output_dir")
        job = Job(new_job_id(), "monitor", self._monitor_runner(
            params["input_dir"], params["recipe_path"], params["output_dir"],
            params.get("move_to"), params.get("output_overrides"),
        ))
        self.jobs.start(job)
        return {"job_id": job.job_id}

    def _m_monitor_stop(self, params) -> dict:
        _require(params, "job_id")
        job = self.jobs.get_job(params["job_id"])
        if job is None or job.done.is_set():
            raise JsonRpcError(NOT_FOUND, f"找不到進行中的工作：{params['job_id']}")
        job.request_cancel()
        return {"ok": True}

    def _m_cancel_job(self, params) -> dict:
        _require(params, "job_id")
        job = self.jobs.get_job(params["job_id"])
        if job is None or job.done.is_set():
            raise JsonRpcError(NOT_FOUND, f"找不到進行中的工作：{params['job_id']}")
        job.request_cancel()
        return {"ok": True}

    def _m_gpu_warmup(self, params) -> dict:
        _require(params, "recipe_path")
        job = Job(new_job_id(), "warmup", self._warmup_runner(
            params["recipe_path"], params.get("image_path"),
        ))
        self.jobs.start(job)
        return {"job_id": job.job_id}

    def _m_backend_compare(self, params) -> dict:
        _require(params, "image_path", "recipe_path", "output_dir")
        job = Job(new_job_id(), "compare", self._compare_runner(
            params["image_path"], params["recipe_path"], params["output_dir"],
        ))
        self.jobs.start(job)
        return {"job_id": job.job_id}

    # ---- previews ---------------------------------------------------------

    def _m_image_preview(self, params) -> dict:
        _require(params, "image_path")
        if not Path(params["image_path"]).exists():
            raise JsonRpcError(NOT_FOUND, f"找不到影像：{params['image_path']}")
        try:
            max_side = int(params.get("max_side", 2048))
        except (TypeError, ValueError):
            raise JsonRpcError(INVALID_PARAMS, "max_side 必須是整數。") from None
        return previews.image_preview(params["image_path"], max_side=max_side)

    def _m_preview_tiles(self, params) -> dict:
        _require(params, "image_path")
        if not Path(params["image_path"]).exists():
            raise JsonRpcError(NOT_FOUND, f"找不到影像：{params['image_path']}")
        if "tile" in params:
            tile_config = params["tile"]
        elif params.get("recipe_path"):
            try:
                recipe = self.recipe_manager.load(Path(params["recipe_path"]))
            except RecipeError as exc:
                raise JsonRpcError(NOT_FOUND, f"找不到或無法載入 Recipe：{exc}") from exc
            tile_config = recipe.get("tile", {})
        else:
            raise JsonRpcError(INVALID_PARAMS, "preview_tiles 需要 recipe_path 或 tile。")
        if not isinstance(tile_config, dict):
            raise JsonRpcError(INVALID_PARAMS, "tile 必須是物件。")
        return previews.preview_tiles(params["image_path"], tile_config)

    # ---- settings ---------------------------------------------------------

    def _m_get_settings(self, params) -> dict:
        return settings_store.read_settings()

    def _m_set_settings(self, params) -> dict:
        patch = params.get("patch")
        if not isinstance(patch, dict):
            raise JsonRpcError(INVALID_PARAMS, "set_settings 需要 patch 物件。")
        return settings_store.write_settings(patch)

    def _m_import_legacy_settings(self, params) -> dict:
        return settings_store.import_legacy_settings()

    # ---- job bodies -------------------------------------------------------

    def _single_runner(self, image_path, recipe_path, output_dir, output_overrides):
        def run(job: Job) -> dict:
            progress = make_progress_emitter(job, self._emit)
            try:
                recipe = self.recipe_manager.load(Path(recipe_path))
            except RecipeError as exc:
                raise JobFailure(RECIPE_INVALID, str(exc), stage=job.last_stage) from exc
            gpu_mode = self.recipe_manager.gpu_mode(recipe.get("gpu"))
            try:
                with self.gpu_session_cache.use(Path(recipe_path)) as session:
                    with AOIPipeline(
                        recipe_path=Path(recipe_path),
                        output_dir=Path(output_dir),
                        progress_callback=progress,
                        output_overrides=output_overrides,
                        gpu_session=session,
                    ) as pipeline:
                        result = pipeline.run(Path(image_path))
                CsvSummaryExporter.finalize_result(Path(output_dir), result)
            except GpuRuntimeError as exc:
                code = CUDA_UNAVAILABLE if gpu_mode == "cuda" else INTERNAL
                raise JobFailure(code, str(exc), stage=job.last_stage) from exc
            return self._single_result(result)

        return run

    def _single_result(self, result: dict) -> dict:
        active, reason = actual_gpu_backend(result)
        payload = make_json_safe(result)
        payload["backend"] = "cuda" if active else "cpu"
        payload["backend_reason"] = reason
        payload["outputs"] = _existing_outputs(result.get("outputs", {}))
        payload["performance"] = make_json_safe(performance_summary(result))
        payload["dur_ms"] = round(float(result.get("duration_sec", 0) or 0) * 1000)
        return payload

    def _batch_runner(self, input_dir, recipe_path, output_dir, recursive, output_overrides):
        def run(job: Job) -> dict:
            progress = make_progress_emitter(job, self._emit)

            def item_callback(item: dict, index: int, total: int) -> None:
                self._emit("batch://item", {
                    "job_id": job.job_id, "index": index, "total": total, "item": make_json_safe(item),
                })

            with self.gpu_session_cache.use(Path(recipe_path)) as session:
                processor = BatchInspectionProcessor(
                    input_dir=Path(input_dir),
                    recipe_path=Path(recipe_path),
                    output_dir=Path(output_dir),
                    output_overrides=output_overrides,
                    recursive=recursive,
                    progress_callback=progress,
                    item_callback=item_callback,
                    gpu_session=session,
                    cancel_event=job.cancel_event,
                )
                result = processor.run()
            return make_json_safe(result)

        return run

    def _monitor_runner(self, input_dir, recipe_path, output_dir, move_to, output_overrides):
        def run(job: Job) -> dict:
            progress = make_progress_emitter(job, self._emit)

            def item_callback(item: dict) -> None:
                self._emit("monitor://item", {"job_id": job.job_id, "item": make_json_safe(item)})

            with self.gpu_session_cache.use(Path(recipe_path)) as session:
                processor = FolderMonitorProcessor(
                    input_dir=Path(input_dir),
                    recipe_path=Path(recipe_path),
                    output_dir=Path(output_dir),
                    output_overrides=output_overrides,
                    processed_move_dir=Path(move_to) if move_to else None,
                    progress_callback=progress,
                    item_callback=item_callback,
                    stop_callback=job.stop_requested,
                    gpu_session=session,
                )
                result = processor.run()
            return make_json_safe(result)

        return run

    def _warmup_runner(self, recipe_path, image_path):
        def run(job: Job) -> dict:
            progress = make_progress_emitter(job, self._emit)
            summary = self.gpu_session_cache.warm_up(
                Path(recipe_path),
                Path(image_path) if image_path else None,
                progress_callback=progress,
            )
            return make_json_safe(summary)

        return run

    def _compare_runner(self, image_path, recipe_path, output_dir):
        def run(job: Job) -> dict:
            progress = make_progress_emitter(job, self._emit)
            with self.gpu_session_cache.use(Path(recipe_path)) as session:
                summary = BackendComparison().run(
                    Path(recipe_path), Path(image_path), Path(output_dir),
                    gpu_session=session, progress_callback=progress,
                )
            return make_json_safe(summary)

        return run
