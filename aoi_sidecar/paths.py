"""Bundled-resource and host-path resolution for the sidecar (no Qt).

``app_root()`` returns the directory that holds bundled data (recipes, models): ``sys._MEIPASS``
when frozen (PyInstaller one-dir) and the repository root (parent of the ``aoi_sidecar`` package)
from a source checkout. Relative ``path`` params from the host are resolved against ``app_root()``;
absolute paths are returned unchanged.
"""

from __future__ import annotations

import sys
from pathlib import Path


def app_root() -> Path:
    """The directory that holds bundled data: ``sys._MEIPASS`` when frozen, else the repo root."""
    bundle = getattr(sys, "_MEIPASS", None)
    if bundle:
        return Path(bundle)
    return Path(__file__).resolve().parent.parent


def resolve_host_path(path: str | Path) -> Path:
    """Resolve a host-supplied ``path`` against ``app_root()``; absolute paths are unchanged."""
    candidate = Path(path)
    if candidate.is_absolute():
        return candidate
    return app_root() / candidate
