"""JSON settings file for the desktop GUI, default ``%APPDATA%\\TileScopeAOI\\desktop_settings.json``.

Reads are safe against missing files and stale/partial JSON; writes are atomic (temp + replace).
The first read migrates a legacy ``%APPDATA%\\VisionFlowAOI\\desktop_settings.json`` into the new
location once, so existing desktop users keep their settings across the rename.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Callable, Mapping

DEFAULT_SETTINGS: dict[str, Any] = {
    "output_dir": "outputs",
    "output_options": {
        "save_overlay": True,
        "save_ng_tiles": True,
        "group_ng_tiles_by_defect": False,
        "save_csv": True,
        "save_matrix_csv": True,
        "save_json": True,
    },
    "save_monitor_originals": True,
    "last_image": None,
    "last_recipe": None,
    "batch_dir": None,
    "monitor_dir": None,
    "monitor_move_dir": None,
    "last_screen": "run",
}

# The renamed PySide6 GUI writes its QSettings to ``Software\\TileScope\\AOI``; the historical
# ``Software\\VisionFlow\\AOI`` store remains readable so one-shot migration keeps working.
NEW_REGISTRY_KEY = r"Software\TileScope\AOI"
LEGACY_REGISTRY_KEY = r"Software\VisionFlow\AOI"

# Registry value name -> (settings key, coercion kind).
_LEGACY_KEY_MAP = (
    ("output/directory", "output_dir", "str"),
    ("output/options", "output_options", "json"),
    ("ui/last_screen", "last_screen", "str"),
    ("paths/image", "last_image", "str"),
    ("paths/recipe", "last_recipe", "str"),
    ("paths/batch", "batch_dir", "str"),
    ("paths/monitor", "monitor_dir", "str"),
    ("paths/monitor_move", "monitor_move_dir", "str"),
    ("monitor/save_original", "save_monitor_originals", "bool"),
)


def settings_path() -> Path:
    env = os.environ.get("AOI_SIDECAR_SETTINGS_PATH")
    if env:
        return Path(env)
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    return Path(base) / "TileScopeAOI" / "desktop_settings.json"


def legacy_settings_path() -> Path:
    """The pre-rename settings file location, read once for migration."""
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    return Path(base) / "VisionFlowAOI" / "desktop_settings.json"


def _deep_merge(base: dict, patch: Mapping) -> dict:
    merged = dict(base)
    for key, value in patch.items():
        existing = merged.get(key)
        if isinstance(existing, dict) and isinstance(value, dict):
            merged[key] = _deep_merge(existing, value)
        elif isinstance(existing, dict):
            # A corrupt value for a dict-shaped key (e.g. a stale output_options) is ignored.
            continue
        else:
            merged[key] = value
    return merged


def _load(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def read_settings(path: Path | None = None) -> dict:
    """Defaults deep-merged with the on-disk file; missing/stale values are read safely.

    When ``path`` is omitted, a legacy ``VisionFlowAOI`` settings file is migrated into the new
    location once before reading, so the rename does not drop an existing user's settings.
    """
    if path is None:
        path = settings_path()
        migrate_legacy_settings_file(path)
    return _deep_merge(DEFAULT_SETTINGS, _load(path))


def migrate_legacy_settings_file(path: Path | None = None, legacy: Path | None = None) -> bool:
    """Copy the legacy ``VisionFlowAOI`` settings file into ``path`` once (new file absent)."""
    path = path or settings_path()
    if path.exists():
        return False
    legacy = legacy or legacy_settings_path()
    if not legacy.exists():
        return False
    data = _load(legacy)
    if not data:
        return False
    write_settings(data, path=path)
    return True


def write_settings(patch: Mapping, path: Path | None = None) -> dict:
    """Merge ``patch`` into the settings file atomically and return the merged settings."""
    path = path or settings_path()
    merged = _deep_merge(read_settings(path), patch)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(dir=str(path.parent), prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(merged, handle, ensure_ascii=False, indent=2)
        os.replace(temp_name, str(path))
    except BaseException:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise
    return merged


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    return str(value).strip().lower() in {"true", "1", "yes", "on"}


def read_registry_values(key: str = LEGACY_REGISTRY_KEY) -> dict[str, Any]:
    """Read every value under ``key`` (``HKCU\\Software\\...``) with winreg; {} when absent."""
    import winreg  # noqa: PLC0415 - winreg is Windows-only

    result: dict[str, Any] = {}
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as handle:
            index = 0
            while True:
                try:
                    name, value, _type = winreg.EnumValue(handle, index)
                except OSError:
                    break
                result[str(name)] = value
                index += 1
    except OSError:
        return {}
    return result


def _merged_registry_values() -> dict[str, Any]:
    """Read the new registry key first, then fill gaps from the legacy ``VisionFlow\\AOI`` key."""
    values = dict(read_registry_values(NEW_REGISTRY_KEY))
    for name, value in read_registry_values(LEGACY_REGISTRY_KEY).items():
        values.setdefault(name, value)
    return values


def import_legacy_settings(reader: Callable[[], Mapping[str, Any]] | None = None, path: Path | None = None) -> dict:
    """Map known PySide6 QSettings keys into the settings file; return ``{imported: [keys]}``."""
    reader = reader or _merged_registry_values
    values = dict(reader() or {})
    patch: dict[str, Any] = {}
    imported: list[str] = []
    for registry_key, settings_key, kind in _LEGACY_KEY_MAP:
        if registry_key not in values:
            continue
        value = values[registry_key]
        if kind == "json":
            try:
                parsed = json.loads(str(value))
            except (TypeError, ValueError):
                continue
            if not isinstance(parsed, dict):
                continue
            patch[settings_key] = {k: bool(v) for k, v in parsed.items()}
        elif kind == "bool":
            patch[settings_key] = _coerce_bool(value)
        else:
            if value not in (None, ""):
                patch[settings_key] = str(value)
        imported.append(settings_key)
    if patch:
        write_settings(patch, path=path)
    return {"imported": imported}
