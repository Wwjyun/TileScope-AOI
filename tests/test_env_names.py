"""The shared environment-variable helper prefers ``TILESCOPE_*`` and falls back to ``VISIONFLOW_*``."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from core.env_names import env_value


class EnvValueTests(unittest.TestCase):
    def test_new_name_is_preferred_over_legacy(self):
        environ = {"TILESCOPE_SAPERA_DLL": "C:/new.dll", "VISIONFLOW_SAPERA_DLL": "C:/old.dll"}
        self.assertEqual(env_value("SAPERA_DLL", environ), "C:/new.dll")

    def test_legacy_name_is_used_when_new_name_is_absent(self):
        environ = {"VISIONFLOW_SAPERA_DLL": "C:/old.dll"}
        self.assertEqual(env_value("SAPERA_DLL", environ), "C:/old.dll")

    def test_blank_new_value_does_not_mask_legacy(self):
        environ = {"TILESCOPE_SAPERA_DLL": "", "VISIONFLOW_SAPERA_DLL": "C:/old.dll"}
        self.assertEqual(env_value("SAPERA_DLL", environ), "C:/old.dll")

    def test_missing_both_returns_none(self):
        self.assertIsNone(env_value("SAPERA_DLL", {}))

    def test_uses_os_environ_when_no_mapping_is_given(self):
        with patch.dict(os.environ, {"TILESCOPE_CCD_SIMULATOR": "1"}, clear=False):
            self.assertEqual(env_value("CCD_SIMULATOR"), "1")


if __name__ == "__main__":
    unittest.main()
