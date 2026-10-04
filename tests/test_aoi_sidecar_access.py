from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from aoi_sidecar.protocol import PERMISSION_DENIED, JsonRpcError
from aoi_sidecar.service import SidecarService

ROOT = Path(__file__).resolve().parents[1]


class AccessControlReexportTests(unittest.TestCase):
    def test_gui_permission_manager_reexports_core_access_control(self):
        import core.access_control as core_access
        import gui.permission_manager as gui_perms

        self.assertIs(gui_perms.PermissionManager, core_access.PermissionManager)
        self.assertIs(gui_perms.MODE_LABELS, core_access.MODE_LABELS)
        self.assertIs(gui_perms.DEFAULT_MODE_PASSWORDS, core_access.DEFAULT_MODE_PASSWORDS)
        self.assertEqual(core_access.DEFAULT_MODE_PASSWORDS, {"eng": "1234", "admin": "5678"})

    def test_core_permission_manager_is_qt_free(self):
        code = "import sys; import core.access_control; sys.exit(1 if 'PySide6' in sys.modules else 0)"
        result = subprocess.run(
            [sys.executable, "-c", code], cwd=str(ROOT), capture_output=True, timeout=60
        )
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", "replace"))

    def test_permission_manager_behavior(self):
        from core.access_control import PermissionManager

        permissions = PermissionManager()
        self.assertEqual(permissions.current_mode, "op")
        self.assertFalse(permissions.switch_mode("eng", "wrong"))
        self.assertEqual(permissions.current_mode, "op")
        self.assertTrue(permissions.switch_mode("eng", "1234"))
        self.assertTrue(permissions.switch_mode("op"))
        self.assertEqual(permissions.current_mode, "op")


def _make_service():
    events = []
    with tempfile.TemporaryDirectory() as tmp:
        env = {
            "AOI_SIDECAR_SETTINGS_PATH": str(Path(tmp) / "settings.json"),
            "AOI_SIDECAR_CACHE_DIR": str(Path(tmp) / "cache"),
        }
        with patch.dict(os.environ, env):
            service = SidecarService(emit=lambda topic, payload: events.append((topic, payload)))
            return service, events


class SwitchModeServiceTests(unittest.TestCase):
    def test_wrong_password_keeps_mode_and_raises_permission_denied(self):
        service, _ = _make_service()
        self.assertEqual(service.dispatch("switch_mode", {"mode": "op"}), {"mode": "op"})
        with self.assertRaises(JsonRpcError) as raised:
            service.dispatch("switch_mode", {"mode": "eng", "password": "wrong"})
        self.assertEqual(raised.exception.code, PERMISSION_DENIED)
        self.assertEqual(service.permission_manager.current_mode, "op")

    def test_correct_password_switches_mode(self):
        service, _ = _make_service()
        self.assertEqual(
            service.dispatch("switch_mode", {"mode": "eng", "password": "1234"}), {"mode": "eng"}
        )
        self.assertEqual(service.permission_manager.current_mode, "eng")

    def test_password_override_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            passwords_file = Path(tmp) / "passwords.json"
            passwords_file.write_text(json.dumps({"eng": "9999", "admin": "8888"}), encoding="utf-8")
            with patch.dict(os.environ, {"AOI_SIDECAR_PASSWORDS_FILE": str(passwords_file)}):
                service, _ = _make_service()
                with self.assertRaises(JsonRpcError):
                    service.dispatch("switch_mode", {"mode": "eng", "password": "1234"})
                self.assertEqual(
                    service.dispatch("switch_mode", {"mode": "eng", "password": "9999"}), {"mode": "eng"}
                )

    def test_op_cannot_save_recipe(self):
        service, _ = _make_service()
        with self.assertRaises(JsonRpcError) as raised:
            service.dispatch("save_recipe", {"path": "x.yaml", "recipe": {}})
        self.assertEqual(raised.exception.code, PERMISSION_DENIED)


if __name__ == "__main__":
    unittest.main()
