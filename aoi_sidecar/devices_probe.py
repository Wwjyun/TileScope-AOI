"""Device availability probe for ``runtime_status``.

Presence of the vendor import/DLL/SDK is checked only: nothing here connects to, loads (beyond
file existence) or writes any hardware. Reasons carry ``[E-xxxx]`` codes when a registered code
fits (see ``devices/error_codes.py``).
"""

from __future__ import annotations

import importlib.util
import os
from collections.abc import Mapping
from pathlib import Path


def probe_devices(environ: Mapping[str, str] | None = None) -> dict:
    env = os.environ if environ is None else environ
    return {
        "camera": _probe_camera(env),
        "meter_wheel": _probe_meter_wheel(env),
        "sensor_relay": _probe_sensor_relay(env),
        "light": _probe_light(),
    }


def _probe_camera(env: Mapping[str, str]) -> dict:
    from devices.factory import UnavailableLineScanCamera, create_line_scan_camera

    camera = create_line_scan_camera(env)
    if isinstance(camera, UnavailableLineScanCamera):
        return {"available": False, "reason": getattr(camera, "_reason", "找不到 Sapera LT 相機")}
    return {"available": True, "reason": ""}


def _probe_meter_wheel(env: Mapping[str, str]) -> dict:
    from devices.error_codes import ensure_tag
    from devices.lsi8181 import DLL_NAME, dll_candidates

    found = next((candidate for candidate in dll_candidates(environ=env) if Path(candidate).is_file()), None)
    if found:
        return {"available": True, "reason": ""}
    return {
        "available": False,
        "reason": ensure_tag("E-3101", f"找不到米輪 DLL（{DLL_NAME}）；請在 CCD 頁以「瀏覽」指定位置。"),
    }


def _probe_sensor_relay(env: Mapping[str, str]) -> dict:
    from devices.advantech_dio import explain_missing, locate_assembly
    from devices.error_codes import ensure_tag

    found = locate_assembly(environ=env)
    if found is not None:
        return {"available": True, "reason": ""}
    return {
        "available": False,
        "reason": ensure_tag("E-4101", f"找不到研華 DAQNavi（Automation.BDaq4.dll）：{explain_missing(environ=env)}"),
    }


def _probe_light() -> dict:
    if importlib.util.find_spec("pythonnet") is not None:
        return {"available": True, "reason": ""}
    return {
        "available": False,
        "reason": "[E-2101] 找不到 pythonnet（.NET 串列埠未就緒）；光源控制停用。",
    }
