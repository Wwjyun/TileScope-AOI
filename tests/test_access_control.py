"""Configurable mode-passwords loader and its use by the sidecar."""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from core.access_control import (
    DEFAULT_MODE_PASSWORDS,
    PermissionManager,
    load_mode_passwords,
)


def _write_passwords(tmp: str, payload) -> Path:
    path = Path(tmp) / "passwords.json"
    path.write_text(json.dumps(payload) if not isinstance(payload, str) else payload, encoding="utf-8")
    return path


class LoadModePasswordsTests(unittest.TestCase):
    def test_defaults_without_env(self):
        self.assertEqual(load_mode_passwords({}), dict(DEFAULT_MODE_PASSWORDS))
        self.assertEqual(DEFAULT_MODE_PASSWORDS, {"eng": "1234", "admin": "5678"})

    def test_tilescope_file_override(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_passwords(tmp, {"eng": "9999", "admin": "8888"})
            self.assertEqual(
                load_mode_passwords({"TILESCOPE_MODE_PASSWORDS_FILE": str(path)}),
                {"eng": "9999", "admin": "8888"},
            )

    def test_sidecar_file_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_passwords(tmp, {"eng": "7777", "admin": "6666"})
            self.assertEqual(
                load_mode_passwords({"AOI_SIDECAR_PASSWORDS_FILE": str(path)}),
                {"eng": "7777", "admin": "6666"},
            )

    def test_tilescope_precedes_sidecar(self):
        with tempfile.TemporaryDirectory() as tmp:
            new_path = _write_passwords(tmp, {"eng": "new", "admin": "new2"})
            old_path = Path(tmp) / "old.json"
            old_path.write_text(json.dumps({"eng": "old", "admin": "old2"}), encoding="utf-8")
            self.assertEqual(
                load_mode_passwords({
                    "TILESCOPE_MODE_PASSWORDS_FILE": str(new_path),
                    "AOI_SIDECAR_PASSWORDS_FILE": str(old_path),
                }),
                {"eng": "new", "admin": "new2"},
            )

    def test_invalid_json_falls_back_and_warns(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_passwords(tmp, "{not json")
            with self.assertLogs("core.access_control", level="WARNING") as cm:
                self.assertEqual(load_mode_passwords({"TILESCOPE_MODE_PASSWORDS_FILE": str(path)}),
                                 dict(DEFAULT_MODE_PASSWORDS))
            self.assertTrue(any("TILESCOPE_MODE_PASSWORDS_FILE" in line for line in cm.output))

    def test_missing_file_falls_back_and_warns(self):
        missing = r"C:\nonexistent\passwords.json"
        with self.assertLogs("core.access_control", level="WARNING"):
            self.assertEqual(load_mode_passwords({"TILESCOPE_MODE_PASSWORDS_FILE": missing}),
                             dict(DEFAULT_MODE_PASSWORDS))

    def test_wrong_keys_falls_back_and_warns(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_passwords(tmp, {"eng": "9999"})
            with self.assertLogs("core.access_control", level="WARNING"):
                self.assertEqual(load_mode_passwords({"TILESCOPE_MODE_PASSWORDS_FILE": str(path)}),
                                 dict(DEFAULT_MODE_PASSWORDS))

    def test_non_dict_falls_back_and_warns(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_passwords(tmp, ["eng", "admin"])
            with self.assertLogs("core.access_control", level="WARNING"):
                self.assertEqual(load_mode_passwords({"TILESCOPE_MODE_PASSWORDS_FILE": str(path)}),
                                 dict(DEFAULT_MODE_PASSWORDS))

    def test_empty_value_falls_back_and_warns(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_passwords(tmp, {"eng": "", "admin": "5678"})
            with self.assertLogs("core.access_control", level="WARNING"):
                self.assertEqual(load_mode_passwords({"TILESCOPE_MODE_PASSWORDS_FILE": str(path)}),
                                 dict(DEFAULT_MODE_PASSWORDS))

    def test_directory_path_never_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(load_mode_passwords({"TILESCOPE_MODE_PASSWORDS_FILE": tmp}),
                             dict(DEFAULT_MODE_PASSWORDS))

    def test_permission_manager_uses_loaded_passwords(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_passwords(tmp, {"eng": "abcd", "admin": "wxyz"})
            permissions = PermissionManager(load_mode_passwords({"TILESCOPE_MODE_PASSWORDS_FILE": str(path)}))
            self.assertFalse(permissions.switch_mode("eng", "1234"))
            self.assertTrue(permissions.switch_mode("eng", "abcd"))


class SidecarPasswordFileTests(unittest.TestCase):
    def test_sidecar_uses_tilescope_password_file(self):
        from aoi_sidecar.protocol import JsonRpcError

        with tempfile.TemporaryDirectory() as tmp:
            path = _write_passwords(tmp, {"eng": "7777", "admin": "8888"})
            env = {
                "AOI_SIDECAR_SETTINGS_PATH": str(Path(tmp) / "settings.json"),
                "AOI_SIDECAR_CACHE_DIR": str(Path(tmp) / "cache"),
                "TILESCOPE_MODE_PASSWORDS_FILE": str(path),
            }
            with patch.dict(os.environ, env):
                from aoi_sidecar.service import SidecarService

                service = SidecarService(emit=lambda topic, payload: None)
            try:
                with self.assertRaises(JsonRpcError):
                    service.dispatch("switch_mode", {"mode": "eng", "password": "1234"})
                self.assertEqual(
                    service.dispatch("switch_mode", {"mode": "eng", "password": "7777"}),
                    {"mode": "eng"},
                )
            finally:
                service.shutdown()

    def test_sidecar_falls_back_to_defaults_on_invalid_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_passwords(tmp, "{broken")
            env = {
                "AOI_SIDECAR_SETTINGS_PATH": str(Path(tmp) / "settings.json"),
                "AOI_SIDECAR_CACHE_DIR": str(Path(tmp) / "cache"),
                "TILESCOPE_MODE_PASSWORDS_FILE": str(path),
            }
            with patch.dict(os.environ, env):
                from aoi_sidecar.service import SidecarService

                service = SidecarService(emit=lambda topic, payload: None)
            try:
                self.assertEqual(
                    service.dispatch("switch_mode", {"mode": "eng", "password": "1234"}),
                    {"mode": "eng"},
                )
            finally:
                service.shutdown()


if __name__ == "__main__":
    unittest.main()
