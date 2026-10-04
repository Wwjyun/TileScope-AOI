from __future__ import annotations

import json
import os
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
import yaml

from core.detector_manager import DetectorManager
from core.recipe_manager import RecipeManager

from aoi_sidecar import previews, recipes as recipe_api, settings_store

ROOT = Path(__file__).resolve().parents[1]
BASE_RECIPE = ROOT / "recipes" / "DEMO.yaml"

CAMERA_SECTION = {
    "exposure_time": 1234.56,
    "gain": 2.345,
    "length_lines": 16384,
    "internal_line_rate_hz": 5000,
    "trigger": {
        "mode": "external_trigger",
        "external_frame_one_frame": True,
        "compare_follows_encoder": True,
        "set_encoder_on_trigger": False,
    },
    "auto_save": {"external_one_frame": True, "software_trigger": False},
}


def _write_png(path: Path, image) -> None:
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    path.write_bytes(encoded.tobytes())


class ListRecipesTests(unittest.TestCase):
    def test_lists_demo_recipes_with_enabled_detectors_and_gpu_mode(self):
        recipes = recipe_api.list_recipes()
        by_name = {r["name"]: r for r in recipes}
        self.assertIn("DEMO", by_name)
        demo = by_name["DEMO"]
        self.assertEqual(demo["detectors"], ["demo4"])
        self.assertEqual(demo["gpu_mode"], "cpu")
        self.assertTrue(all(Path(r["path"]).exists() for r in recipes))

    def test_directory_parameter(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            recipe = RecipeManager().load(BASE_RECIPE)
            (root / "custom.yaml").write_text(
                yaml.safe_dump(recipe, allow_unicode=True, sort_keys=False), encoding="utf-8"
            )
            recipes = recipe_api.list_recipes(str(root))
            self.assertEqual([r["name"] for r in recipes], ["DEMO"])


class DetectorCatalogTests(unittest.TestCase):
    def test_admin_sees_every_parameter_with_default(self):
        catalog = recipe_api.detector_catalog(admin=True)
        demo4 = next(d for d in catalog if d["id"] == "demo4")
        self.assertTrue(demo4["supports_cuda"])
        specs = DetectorManager().parameter_specs("demo4")
        self.assertEqual({p["name"] for p in demo4["params"]}, set(specs))
        for param in demo4["params"]:
            self.assertNotIn("hidden", param)
            self.assertIn("default", param)

    def test_eng_hides_inner_parameters_and_omits_their_defaults(self):
        catalog = recipe_api.detector_catalog(admin=False)
        demo4 = next(d for d in catalog if d["id"] == "demo4")
        specs = DetectorManager().parameter_specs("demo4")
        for param in demo4["params"]:
            if param["group"] == "inner":
                self.assertTrue(param["hidden"])
                self.assertNotIn("default", param)
            else:
                self.assertNotIn("hidden", param)
                self.assertIn("default", param)

    def test_demo12_does_not_support_native_cuda(self):
        catalog = recipe_api.detector_catalog(admin=True)
        demo12 = next(d for d in catalog if d["id"] == "demo12")
        self.assertFalse(demo12["supports_cuda"])


class LoadSaveRecipeTests(unittest.TestCase):
    def test_eng_load_strips_inner_values_and_keeps_camera_readonly(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base = RecipeManager().load(BASE_RECIPE)
            base["camera"] = deepcopy(CAMERA_SECTION)
            base_path = root / "base.yaml"
            base_path.write_text(yaml.safe_dump(base, allow_unicode=True, sort_keys=False), encoding="utf-8")

            result = recipe_api.load_recipe(base_path, admin=False)
            self.assertFalse(result["camera_editable"])
            # The camera section is returned unchanged (the host renders it read-only) so save can
            # restore it from base; only inner/unknown param values are stripped.
            self.assertEqual(result["recipe"]["camera"], CAMERA_SECTION)
            self.assertGreater(result["hidden_inner_count"], 0)
            specs = DetectorManager().parameter_specs("demo4")
            outer = {n for n, s in specs.items() if s.parameter_group == "outer"}
            params = result["recipe"]["detectors"]["demo4"]["params"]
            self.assertEqual(set(params.keys()), outer)

    def test_admin_load_returns_everything(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base = RecipeManager().load(BASE_RECIPE)
            base["camera"] = deepcopy(CAMERA_SECTION)
            base_path = root / "base.yaml"
            base_path.write_text(yaml.safe_dump(base, allow_unicode=True, sort_keys=False), encoding="utf-8")

            result = recipe_api.load_recipe(base_path, admin=True)
            self.assertTrue(result["camera_editable"])
            self.assertEqual(result["recipe"]["camera"], CAMERA_SECTION)
            specs = DetectorManager().parameter_specs("demo4")
            params = result["recipe"]["detectors"]["demo4"]["params"]
            self.assertEqual(set(params.keys()), set(specs))

    def test_eng_save_restores_hidden_inner_and_camera_exactly(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manager = RecipeManager()
            base = manager.load(BASE_RECIPE)
            base["camera"] = deepcopy(CAMERA_SECTION)
            base_path = root / "base.yaml"
            base_path.write_text(yaml.safe_dump(base, allow_unicode=True, sort_keys=False), encoding="utf-8")

            eng_view = recipe_api.load_recipe(base_path, admin=False)
            # Simulate a frontend that sent back a bogus inner value and a bogus camera section.
            eng_view["recipe"]["detectors"]["demo4"]["params"]["blur_size"] = 999
            eng_view["recipe"]["camera"] = {"exposure_time": 0.01}
            target = root / "saved.yaml"
            saved = recipe_api.save_recipe(target, eng_view["recipe"], admin=False, base_path=str(base_path))

            loaded = manager.load(Path(saved["path"]))
            specs = DetectorManager().parameter_specs("demo4")
            base_params = base["detectors"]["demo4"]["params"]
            loaded_params = loaded["detectors"]["demo4"]["params"]
            for name, spec in specs.items():
                if spec.parameter_group != "outer":
                    self.assertEqual(loaded_params[name], base_params[name], name)
            self.assertEqual(loaded["camera"], CAMERA_SECTION)

    def test_admin_save_can_edit_inner_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manager = RecipeManager()
            base = manager.load(BASE_RECIPE)
            base_path = root / "base.yaml"
            base_path.write_text(yaml.safe_dump(base, allow_unicode=True, sort_keys=False), encoding="utf-8")

            admin_view = recipe_api.load_recipe(base_path, admin=True)
            admin_view["recipe"]["detectors"]["demo4"]["params"]["invert"] = True
            target = root / "admin_saved.yaml"
            saved = recipe_api.save_recipe(target, admin_view["recipe"], admin=True)

            loaded = manager.load(Path(saved["path"]))
            self.assertTrue(loaded["detectors"]["demo4"]["params"]["invert"])

    def test_load_treats_unknown_param_as_hidden_inner(self):
        specs = DetectorManager().parameter_specs("demo4")
        base = RecipeManager().load(BASE_RECIPE)
        base["detectors"]["demo4"]["params"]["mystery_param"] = 123
        base_params = base["detectors"]["demo4"]["params"]
        expected_inner = sum(
            1 for name in base_params
            if name not in specs or specs[name].parameter_group != "outer"
        )

        with patch.object(RecipeManager, "load", return_value=deepcopy(base)):
            eng = recipe_api.load_recipe("recipes/DEMO.yaml", admin=False)
        self.assertNotIn("mystery_param", eng["recipe"]["detectors"]["demo4"]["params"])
        self.assertEqual(eng["hidden_inner_count"], expected_inner)

        with patch.object(RecipeManager, "load", return_value=deepcopy(base)):
            admin = recipe_api.load_recipe("recipes/DEMO.yaml", admin=True)
        self.assertIn("mystery_param", admin["recipe"]["detectors"]["demo4"]["params"])
        self.assertEqual(admin["hidden_inner_count"], expected_inner)

    def test_restore_hidden_treats_unknown_params_like_inner(self):
        base = RecipeManager().load(BASE_RECIPE)
        base["detectors"]["demo4"]["params"]["mystery_param"] = 42

        # Eng removes the unknown param; it is restored from base.
        removed = deepcopy(base)
        removed["detectors"]["demo4"]["params"].pop("mystery_param")
        restored = recipe_api._restore_hidden(base, removed, DetectorManager())
        self.assertEqual(restored["detectors"]["demo4"]["params"]["mystery_param"], 42)

        # Eng changes the unknown param; it is restored to the base value.
        changed = deepcopy(base)
        changed["detectors"]["demo4"]["params"]["mystery_param"] = 999
        restored = recipe_api._restore_hidden(base, changed, DetectorManager())
        self.assertEqual(restored["detectors"]["demo4"]["params"]["mystery_param"], 42)

        # Eng adds an unknown param; it is dropped (eng cannot add unknown params).
        added = deepcopy(base)
        added["detectors"]["demo4"]["params"]["extra_mystery"] = 7
        restored = recipe_api._restore_hidden(base, added, DetectorManager())
        self.assertNotIn("extra_mystery", restored["detectors"]["demo4"]["params"])

    def test_save_recipe_invalid_fails(self):
        from core.recipe_manager import RecipeError

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaises(RecipeError):
                recipe_api.save_recipe(root / "bad.yaml", {"recipe_name": "X"}, admin=True)


class SettingsStoreTests(unittest.TestCase):
    def test_read_defaults_when_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "nope.json"
            settings = settings_store.read_settings(path)
            self.assertEqual(settings["output_dir"], "outputs")
            self.assertTrue(settings["save_monitor_originals"])
            self.assertEqual(settings["output_options"]["save_csv"], True)

    def test_write_is_atomic_and_reads_back_merged(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "settings.json"
            settings_store.write_settings({"output_dir": "C:\\tmp\\out"}, path=path)
            settings_store.write_settings({"output_options": {"save_csv": False}}, path=path)
            loaded = settings_store.read_settings(path)
            self.assertEqual(loaded["output_dir"], "C:\\tmp\\out")
            self.assertEqual(loaded["output_options"]["save_csv"], False)
            self.assertEqual(loaded["output_options"]["save_overlay"], True)
            leftovers = list(Path(tmp).glob("*.tmp"))
            self.assertEqual(leftovers, [])

    def test_stale_paths_are_ignored_safely_on_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "settings.json"
            path.write_text(json.dumps({"batch_dir": "Z:\\gone\\folder", "output_options": "not-a-dict"}))
            loaded = settings_store.read_settings(path)
            self.assertEqual(loaded["batch_dir"], "Z:\\gone\\folder")
            self.assertEqual(loaded["output_options"], {
                "save_overlay": True,
                "save_ng_tiles": True,
                "group_ng_tiles_by_defect": False,
                "save_csv": True,
                "save_matrix_csv": True,
                "save_json": True,
            })

    def test_legacy_import_maps_known_keys_with_injected_reader(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "settings.json"
            reader = lambda: {
                "output/directory": "C:\\outputs",
                "output/options": '{"save_csv": false}',
                "ui/last_screen": "designer",
                "paths/image": "C:\\img.bmp",
                "monitor/save_original": 0,
                "unknown/key": "ignored",
            }
            result = settings_store.import_legacy_settings(reader=reader, path=path)
            self.assertEqual(
                sorted(result["imported"]),
                ["last_image", "last_screen", "output_dir", "output_options", "save_monitor_originals"],
            )
            loaded = settings_store.read_settings(path)
            self.assertEqual(loaded["output_dir"], "C:\\outputs")
            self.assertEqual(loaded["output_options"]["save_csv"], False)
            self.assertEqual(loaded["last_screen"], "designer")
            self.assertEqual(loaded["last_image"], "C:\\img.bmp")
            self.assertFalse(loaded["save_monitor_originals"])

    def test_legacy_import_absent_reader_returns_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "settings.json"
            result = settings_store.import_legacy_settings(reader=lambda: {}, path=path)
            self.assertEqual(result, {"imported": []})

    def test_settings_file_migrates_legacy_dir_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            legacy = root / "legacy" / "desktop_settings.json"
            legacy.parent.mkdir()
            legacy.write_text(json.dumps({"output_dir": "C:/legacy_out"}), encoding="utf-8")
            new = root / "new" / "desktop_settings.json"
            self.assertTrue(settings_store.migrate_legacy_settings_file(path=new, legacy=legacy))
            self.assertEqual(settings_store.read_settings(new)["output_dir"], "C:/legacy_out")
            # A second run is a no-op once the new file exists.
            self.assertFalse(settings_store.migrate_legacy_settings_file(path=new, legacy=legacy))

    def test_settings_file_migration_skips_when_legacy_absent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            new = root / "new" / "desktop_settings.json"
            self.assertFalse(settings_store.migrate_legacy_settings_file(
                path=new, legacy=root / "missing" / "desktop_settings.json",
            ))
            self.assertFalse(new.exists())

    def test_import_legacy_settings_reads_new_registry_key_first(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "settings.json"

            def fake_read(key):
                if key == settings_store.NEW_REGISTRY_KEY:
                    return {"output/directory": "C:/new_out"}
                if key == settings_store.LEGACY_REGISTRY_KEY:
                    return {"output/directory": "C:/old_out", "paths/image": "C:/img.bmp"}
                return {}

            with patch.object(settings_store, "read_registry_values", side_effect=fake_read):
                result = settings_store.import_legacy_settings(path=path)
            self.assertEqual(sorted(result["imported"]), ["last_image", "output_dir"])
            loaded = settings_store.read_settings(path)
            self.assertEqual(loaded["output_dir"], "C:/new_out")
            self.assertEqual(loaded["last_image"], "C:/img.bmp")


class ImagePreviewTests(unittest.TestCase):
    def test_preview_cache_reuse(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image_path = root / "img.png"
            _write_png(image_path, np.full((200, 300, 3), 180, np.uint8))
            with patch.object(previews, "cache_dir", return_value=root / "cache"):
                first = previews.image_preview(image_path)
                before = Path(first["path"]).stat().st_mtime_ns
                second = previews.image_preview(image_path)
                self.assertEqual(first["path"], second["path"])
                self.assertEqual(Path(second["path"]).stat().st_mtime_ns, before)
                self.assertEqual((first["width"], first["height"]), (300, 200))
                self.assertEqual(first["scale"], 1.0)

    def test_preview_downscales_with_inter_area(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image_path = root / "wide.png"
            _write_png(image_path, np.zeros((100, 5000, 3), np.uint8))
            with patch.object(previews, "cache_dir", return_value=root / "cache"):
                result = previews.image_preview(image_path, max_side=2048)
            self.assertLessEqual(result["width"], 2048)
            self.assertLess(result["scale"], 1.0)
            self.assertTrue(Path(result["path"]).is_file())


class PreviewTilesTests(unittest.TestCase):
    def test_tiles_and_preview_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image_path = root / "img.png"
            _write_png(image_path, np.full((256, 256, 3), 200, np.uint8))
            tile_config = {"mode": "grid", "width": 64, "height": 64, "overlap_x": 0, "overlap_y": 0}
            with patch.object(previews, "cache_dir", return_value=root / "cache"):
                result = previews.preview_tiles(image_path, tile_config)
            self.assertEqual(result["count"], 16)
            self.assertTrue(Path(result["preview_path"]).is_file())
            self.assertEqual(len(result["tiles"]), 16)
            self.assertEqual(set(result["tiles"][0]), {"id", "x", "y", "w", "h"})


if __name__ == "__main__":
    unittest.main()
