from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from core.detector_manager import DetectorManager
from core.recipe_manager import RecipeManager
from tools.distribution_policy import require_public_distribution
from tools.prepare_demo_snapshot import export_snapshot

ROOT = Path(__file__).resolve().parents[1]


class DemoDistributionTests(unittest.TestCase):
    def test_missing_incomplete_and_unreviewed_policies_refuse_publication(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(OSError):
                require_public_distribution(root)
            for policy in ({}, {"public_distribution_allowed": True}, {
                "schema_version": 1, "public_distribution_allowed": True,
                "pending_reviews": ["ownership"], "review_record": "record",
            }):
                (root / "distribution-policy.json").write_text(json.dumps(policy), encoding="utf-8")
                with self.assertRaises(RuntimeError):
                    require_public_distribution(root)
            policy = {"schema_version": 1, "public_distribution_allowed": True,
                      "pending_reviews": [], "review_record": "reviewed record"}
            (root / "distribution-policy.json").write_text(json.dumps(policy), encoding="utf-8")
            self.assertEqual(require_public_distribution(root), policy)

    def test_current_snapshot_cannot_be_exported_as_public(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "export"
            with self.assertRaises(RuntimeError):
                export_snapshot(ROOT, destination)
            self.assertFalse(destination.exists())

    def test_shipped_recipes_contain_only_demo_identity_and_no_device_calibration(self):
        manager = DetectorManager()
        self.assertEqual(set(manager.definitions()), {f"demo{n}" for n in range(1, 13)})
        for path in (ROOT / "recipes").rglob("*.yaml"):
            with self.subTest(recipe=path.name):
                recipe = RecipeManager().load(path)
                self.assertEqual(recipe["product_id"], "DEMO_PRODUCT")
                self.assertEqual(recipe["machine_id"], "DEMO_MACHINE")
                self.assertNotIn("camera", recipe)
                self.assertEqual(recipe["gpu"]["mode"], "cpu")
                for detector_id, config in recipe["detectors"].items():
                    self.assertEqual(config["display_name"], detector_id)
                    for key, value in config["params"].items():
                        if key.endswith("_mask_enabled"):
                            self.assertFalse(value)
                        if key.startswith("edge_inset_") or key == "roi_inset_px":
                            self.assertEqual(value, 0)
