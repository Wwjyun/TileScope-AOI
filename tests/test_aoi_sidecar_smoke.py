from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from aoi_sidecar import paths

ROOT = Path(__file__).resolve().parents[1]


class PathsTests(unittest.TestCase):
    def test_app_root_defaults_to_repo_root(self):
        self.assertEqual(paths.app_root(), ROOT)

    def test_app_root_uses_patched_frozen_root(self):
        fake = Path("C:/frozen_bundle")
        with patch.object(sys, "_MEIPASS", str(fake), create=True):
            self.assertEqual(paths.app_root(), fake)

    def test_resolve_host_path_against_frozen_root(self):
        fake = Path("C:/frozen_bundle")
        absolute = Path("C:/abs/DEMO.yaml")
        with patch.object(sys, "_MEIPASS", str(fake), create=True):
            self.assertEqual(paths.resolve_host_path("recipes/DEMO.yaml"), fake / "recipes" / "DEMO.yaml")
            self.assertEqual(paths.resolve_host_path(str(absolute)), absolute)

    def test_default_recipes_dir_is_under_app_root(self):
        from aoi_sidecar import recipes as recipe_api

        self.assertEqual(recipe_api.RECIPES_DIR, ROOT / "recipes")


class SmokeSubprocessTests(unittest.TestCase):
    def test_smoke_test_exits_zero_and_prints_json_summary(self):
        proc = subprocess.run(
            [sys.executable, "-m", "aoi_sidecar", "--smoke-test"],
            cwd=str(ROOT),
            capture_output=True,
            timeout=600,
        )
        stdout = proc.stdout.decode("utf-8", "replace")
        stderr = proc.stderr.decode("utf-8", "replace")
        self.assertEqual(proc.returncode, 0, f"stderr:\n{stderr}")
        lines = [line.strip() for line in stdout.splitlines() if line.strip()]
        self.assertTrue(lines, "smoke test printed no stdout summary")
        summary = json.loads(lines[-1])
        self.assertIs(summary["all_passed"], True)
        self.assertEqual(summary["failed"], 0)
        self.assertGreaterEqual(summary["passed"], 4)


if __name__ == "__main__":
    unittest.main()
