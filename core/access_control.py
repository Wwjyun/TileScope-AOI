"""Qt-free GUI mode authorization policy shared by the PySide6 GUI and the Tauri sidecar."""

from __future__ import annotations

import hmac
from collections.abc import Mapping


MODE_LABELS = {
    "op": "OP 模式",
    "eng": "工程模式",
    "admin": "管理模式",
}

DEFAULT_MODE_PASSWORDS = {
    "eng": "1234",
    "admin": "5678",
}


class PermissionManager:
    """Owns mode authorization independently from any UI widgets."""

    def __init__(self, passwords: Mapping[str, str] | None = None):
        configured = dict(DEFAULT_MODE_PASSWORDS if passwords is None else passwords)
        if set(configured) != {"eng", "admin"}:
            raise ValueError("passwords must define exactly the eng and admin modes")
        self._passwords = {
            mode: str(password).encode("utf-8") for mode, password in configured.items()
        }
        self._current_mode = "op"

    @property
    def current_mode(self) -> str:
        return self._current_mode

    def switch_mode(self, mode: str, password: str = "") -> bool:
        if mode not in MODE_LABELS:
            raise ValueError(f"unknown GUI mode: {mode}")
        if mode == "op":
            self._current_mode = mode
            return True
        if not hmac.compare_digest(str(password).encode("utf-8"), self._passwords[mode]):
            return False
        self._current_mode = mode
        return True
