"""Qt-free GUI mode authorization policy shared by the PySide6 GUI and the Tauri sidecar."""

from __future__ import annotations

import hmac
import json
import logging
import os
from collections.abc import Mapping
from pathlib import Path

_logger = logging.getLogger("core.access_control")

MODE_LABELS = {
    "op": "OP 模式",
    "eng": "工程模式",
    "admin": "管理模式",
}

# Demo-only default passwords for the synthetic demonstration. They are not a security
# boundary: a real deployment must override them through ``TILESCOPE_MODE_PASSWORDS_FILE``
# (see ``load_mode_passwords``).
DEFAULT_MODE_PASSWORDS = {
    "eng": "1234",
    "admin": "5678",
}

# Password-file environment variables, in precedence order.
_PASSWORD_FILE_VARS = ("TILESCOPE_MODE_PASSWORDS_FILE", "AOI_SIDECAR_PASSWORDS_FILE")


def load_mode_passwords(environ: Mapping[str, str] | None = None) -> dict[str, str]:
    """Return the effective eng/admin passwords, or the demo defaults.

    Precedence:

    1. ``TILESCOPE_MODE_PASSWORDS_FILE`` — a JSON object ``{"eng": "...", "admin": "..."}``;
       the shared override honored by both the Classic GUI and the sidecar.
    2. ``AOI_SIDECAR_PASSWORDS_FILE`` — the sidecar's historical override, kept so existing
       sidecar deployments keep working.
    3. ``DEFAULT_MODE_PASSWORDS`` — the demo-only fallback.

    A configured path whose file is missing, unreadable, not a JSON object, or does not
    define exactly the ``eng`` and ``admin`` keys with non-empty values logs a warning and
    falls back to the demo defaults. This function never raises.
    """
    mapping = os.environ if environ is None else environ
    for var in _PASSWORD_FILE_VARS:
        path = mapping.get(var)
        if not path:
            continue
        loaded = _read_password_file(path)
        if loaded is not None:
            return loaded
        _logger.warning(
            'ignoring %s=%r: not a usable {"eng", "admin"} password file; using demo defaults',
            var,
            path,
        )
        return dict(DEFAULT_MODE_PASSWORDS)
    return dict(DEFAULT_MODE_PASSWORDS)


def _read_password_file(path: str) -> dict[str, str] | None:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    coerced = {str(key): str(value) for key, value in data.items() if value is not None}
    if set(coerced) != {"eng", "admin"} or any(not value.strip() for value in coerced.values()):
        return None
    return coerced


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
