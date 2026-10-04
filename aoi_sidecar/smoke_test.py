"""In-process sidecar self-test (``python -m aoi_sidecar --smoke-test``).

Runs without the stdio protocol. Each check prints one Traditional-Chinese/English line to stderr
and a single JSON summary line to stdout; the process exits 0 only when every check passes. The
same function is the body of the future frozen ``aoi-sidecar.exe --smoke-test``.
"""

from __future__ import annotations

import json
import logging
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
import yaml

from core.gpu_runtime import GpuRuntime
from core.pipeline import AOIPipeline

from aoi_sidecar import paths
from aoi_sidecar.service import SidecarService

DEMO_RECIPE = paths.app_root() / "recipes" / "DEMO.yaml"

_TERMINALS = {"job://completed", "job://failed", "job://cancelled"}

# No report files: the smoke test only compares decisions and must stay fast and path-safe.
NO_OUTPUTS = {
    "save_overlay": False,
    "save_ng_tiles": False,
    "save_csv": False,
    "save_matrix_csv": False,
    "save_json": False,
    "save_debug_images": False,
}


def _write_png(path: Path, image) -> None:
    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise OSError("OpenCV 無法編碼 PNG")
    path.write_bytes(encoded.tobytes())


def _synthetic_image(path: Path) -> None:
    image = np.full((600, 600, 3), 200, np.uint8)
    cv2.rectangle(image, (200, 200), (240, 240), (20, 20, 20), -1)
    _write_png(path, image)


def _defect_boxes(result: dict) -> list:
    boxes = []
    for tile in result.get("tiles", []):
        for detector in tile.get("detectors", []):
            for defect in detector.get("defects", []):
                box = defect.get("bbox_local")
                boxes.append(None if box is None else tuple(int(value) for value in box))
    return boxes


def _wait_terminal(events: list, job_id: str, timeout: float = 120.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        for topic, payload in list(events):
            if topic in _TERMINALS and payload.get("job_id") == job_id:
                return topic, payload
        time.sleep(0.05)
    raise AssertionError(f"sidecar job {job_id} did not finish")


def _run_job(root: Path, image_path: Path, recipe_path: Path, output_overrides=None):
    events = []
    service = SidecarService(emit=lambda topic, payload: events.append((topic, payload)))
    try:
        job = service.dispatch("start_job", {
            "image_path": str(image_path),
            "recipe_path": str(recipe_path),
            "output_dir": str(root / "out"),
            "output_overrides": output_overrides,
        })
        return _wait_terminal(events, job["job_id"])
    finally:
        service.shutdown()


def _fallback_smoke_recipe() -> dict:
    return {
        "recipe_name": "SIDECAR_GPU_FALLBACK_SMOKE",
        "product_id": "SMOKE",
        "machine_id": "SMOKE",
        "version": "1.0.0",
        "gpu": {
            "mode": "cpu",
            "tiling": False,
            "display": False,
            "dll_path": "missing.dll",
            "fallback_to_cpu": True,
        },
        "tile": {"mode": "grid", "width": 64, "height": 64, "overlap_x": 0, "overlap_y": 0},
        "decision": {
            "mode": "all_detectors_must_pass",
            "important_detectors": ["demo4"],
            "max_ng_count": 0,
        },
        "detectors": {
            "demo4": {
                "enabled": True,
                "use_gpu": False,
                "display_name": "sidecar fallback smoke",
                "params": {
                    "blur_size": 3,
                    "adaptive_block_size": 3,
                    "adaptive_c": -2.0,
                    "roi_inset_px": 0,
                    "contour_mode": "external",
                    "morph_operation": "none",
                    "process_scale": 1.0,
                    "min_area": 0,
                    "max_area": 0,
                    "min_circularity": 0,
                    "min_fill_ratio": 0,
                    "max_fill_ratio": 0,
                },
            }
        },
        "output": {
            "save_overlay": False,
            "save_ng_tiles": False,
            "save_csv": False,
            "save_matrix_csv": False,
            "save_json": False,
        },
    }


def _gpu_recipe(root: Path, mode: str, fallback: bool) -> Path:
    recipe = _fallback_smoke_recipe()
    recipe["gpu"].update(mode=mode, dll_path=str(root / "definitely_missing.dll"), fallback_to_cpu=fallback)
    recipe["detectors"]["demo4"]["use_gpu"] = True
    path = root / f"recipe_{mode}.yaml"
    path.write_text(yaml.safe_dump(recipe, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return path


def run_smoke_test() -> int:
    """Run every smoke check and return 0 only when all pass."""
    logging.disable(logging.CRITICAL)
    checks: list[tuple[str, bool, str]] = []

    # 1. hello/runtime_status work without loading the CUDA DLL.
    load_calls = []
    original_load = GpuRuntime._load

    def spy_load(self):
        load_calls.append(1)
        return original_load(self)

    with patch.object(GpuRuntime, "_load", spy_load):
        service = SidecarService(emit=lambda *args: None)
        try:
            hello = service._m_hello({})
            status = service._m_runtime_status({})
        finally:
            service.shutdown()
    hello_ok = (
        isinstance(hello, dict)
        and hello.get("protocol_version") == 1
        and bool(hello.get("core_version"))
        and bool(hello.get("pid"))
        and status.get("sidecar") == "ready"
        and not load_calls
    )
    checks.append((
        "hello/runtime_status 正常且不載入 CUDA DLL",
        hello_ok,
        "" if hello_ok else f"load_calls={len(load_calls)}",
    ))

    with tempfile.TemporaryDirectory(prefix="aoi_sidecar_smoke_") as temporary:
        root = Path(temporary)
        image_path = root / "input.png"
        _synthetic_image(image_path)

        # 2. CPU job equivalence with the bundled recipe (resolved via app_root()).
        with AOIPipeline(recipe_path=DEMO_RECIPE, output_dir=root / "direct", output_overrides=dict(NO_OUTPUTS)) as pipeline:
            direct = pipeline.run(image_path)
        direct_boxes = _defect_boxes(direct)
        topic, payload = _run_job(root, image_path, DEMO_RECIPE, output_overrides=dict(NO_OUTPUTS))
        if topic == "job://completed":
            result = payload.get("result") or {}
            equiv_ok = (
                result.get("final_result") == direct.get("final_result")
                and result.get("summary", {}).get("defect_count") == direct.get("summary", {}).get("defect_count")
                and _defect_boxes(result) == direct_boxes
            )
        else:
            equiv_ok = False
        checks.append((
            "CPU 工作結果與直接 AOIPipeline 一致（final_result／缺陷數／bbox）",
            equiv_ok,
            "" if equiv_ok else topic,
        ))

        # 3. gpu.mode=auto + missing DLL completes on CPU with zero GPU runtime calls.
        auto_recipe = _gpu_recipe(root, "auto", fallback=True)
        topic, payload = _run_job(root, image_path, auto_recipe)
        if topic == "job://completed":
            result = payload.get("result") or {}
            metrics = ((result.get("execution") or {}).get("gpu") or {}).get("metrics") or {}
            auto_ok = result.get("backend") == "cpu" and int(metrics.get("call_count", -1)) == 0
        else:
            auto_ok = False
        checks.append((
            "gpu.mode=auto 缺 DLL 以 CPU 完成且零 GPU 呼叫",
            auto_ok,
            "" if auto_ok else topic,
        ))

        # 4. gpu.mode=cuda + missing DLL reports CUDA_UNAVAILABLE with no result.
        cuda_recipe = _gpu_recipe(root, "cuda", fallback=False)
        topic, payload = _run_job(root, image_path, cuda_recipe)
        cuda_ok = (
            topic == "job://failed"
            and payload.get("code") == "CUDA_UNAVAILABLE"
            and "result" not in payload
        )
        checks.append((
            "gpu.mode=cuda 缺 DLL 回報 CUDA_UNAVAILABLE 且無結果",
            cuda_ok,
            "" if cuda_ok else f"{topic} {payload.get('code', '')}",
        ))

    all_passed = all(ok for _, ok, _ in checks)
    for name, ok, detail in checks:
        line = f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"：{detail}" if detail else "")
        print(line, file=sys.stderr)
        sys.stderr.flush()
    summary = {
        "all_passed": all_passed,
        "passed": sum(1 for _, ok, _ in checks if ok),
        "failed": sum(1 for _, ok, _ in checks if not ok),
        "checks": [{"name": name, "ok": ok} for name, ok, _ in checks],
    }
    print(json.dumps(summary, ensure_ascii=False))
    sys.stdout.flush()
    return 0 if all_passed else 1
