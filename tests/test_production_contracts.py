from __future__ import annotations

import csv
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import re
import unittest

import cv2
import numpy as np
import yaml

from core.detector_manager import DetectorManager
from core.parameter_schema import ParameterSpec
from core.pipeline import AOIPipeline
from core.provenance import (
    _cached_build_provenance,
    build_provenance,
    canonical_sha256,
    inspection_provenance,
    sha256_bytes,
)
from core.recipe_manager import RecipeError, RecipeManager
from core.report_artifacts import (
    CsvExporter,
    MatrixCsvExporter,
    NgTileExporter,
    ReportImageEncoder,
)
from gpu.benchmark_gate import compare_p95


ROOT = Path(__file__).resolve().parents[1]


def write_png(path: Path, image: np.ndarray) -> None:
    encoded, payload = cv2.imencode(".png", image)
    if not encoded:
        raise AssertionError(f"Failed to encode test image: {path}")
    path.write_bytes(payload.tobytes())


class StrictRecipeContractTests(unittest.TestCase):
    def setUp(self):
        self.recipe = yaml.safe_load((ROOT / "recipes/DEMO3.yaml").read_text(encoding="utf-8"))

    def test_rejects_unknown_detector_parameter(self):
        self.recipe["detectors"]["demo3"]["params"]["morph_kernal"] = 5
        with self.assertRaisesRegex(RecipeError, "unknown keys: morph_kernal"):
            RecipeManager().validate(self.recipe)

    def test_ng_tile_defect_grouping_requires_boolean(self):
        valid = deepcopy(self.recipe)
        valid["output"]["group_ng_tiles_by_defect"] = True
        RecipeManager().validate(valid)

        invalid = deepcopy(self.recipe)
        invalid["output"]["group_ng_tiles_by_defect"] = "true"
        with self.assertRaisesRegex(
            RecipeError, "output.group_ng_tiles_by_defect must be true or false"
        ):
            RecipeManager().validate(invalid)

    def test_rejects_wrong_type_range_enum_and_unknown_detector(self):
        invalid = deepcopy(self.recipe)
        invalid["detectors"]["demo3"]["params"]["morph_kernel"] = 4
        with self.assertRaisesRegex(RecipeError, "must be odd"):
            RecipeManager().validate(invalid)
        invalid = deepcopy(self.recipe)
        invalid["detectors"]["demo3"]["params"]["binary_inv"] = 1
        with self.assertRaisesRegex(RecipeError, "must be bool"):
            RecipeManager().validate(invalid)
        invalid = deepcopy(self.recipe)
        invalid["detectors"]["demo3"]["params"]["contour_mode"] = "typo"
        with self.assertRaisesRegex(RecipeError, "must be one of"):
            RecipeManager().validate(invalid)
        invalid = deepcopy(self.recipe)
        invalid["detectors"] = {"missing": {"enabled": True, "params": {}}}
        with self.assertRaisesRegex(RecipeError, "not registered"):
            RecipeManager().validate(invalid)

    def test_gui_definitions_expose_the_runtime_parameter_schema(self):
        definition = DetectorManager().definitions()["demo3"]
        self.assertEqual(set(definition["param_spec"]), set(definition["default_params"]))
        self.assertTrue(definition["param_spec"]["morph_kernel"]["odd"])
        self.assertFalse(definition["param_spec"]["morph_kernel"]["engineer_visible"])

    def test_unclassified_parameter_defaults_to_admin_only_inner_group(self):
        spec = ParameterSpec(int, 1)

        self.assertEqual(spec.parameter_group, "inner")
        self.assertFalse(spec.engineer_visible)
        with self.assertRaisesRegex(ValueError, "parameter_group must be one of"):
            ParameterSpec(int, 1, parameter_group="unknown")
        with self.assertRaisesRegex(TypeError, "unexpected keyword argument"):
            ParameterSpec(int, 1, engineer_visible=True)

    def test_all_detector_parameters_have_explicit_outer_or_inner_access(self):
        expected_outer = {
            "demo1": {
                "center_mask_width", "center_mask_height", "edge_inset_all",
                "edge_inset_left", "edge_inset_right", "edge_inset_top",
                "edge_inset_bottom", "min_component_area_px",
                "min_component_area_ratio", "max_component_area_px",
                "max_component_area_ratio", "component_border_margin_px",
                "background_padding_min_px", "background_padding_max_px",
                "background_padding_scale",
            },
            "demo2": {
                "edge_inset_all", "edge_inset_left", "edge_inset_right",
                "edge_inset_top", "edge_inset_bottom", "min_area", "max_area",
            },
            "demo3": {"roi_inset_px", "min_area", "max_area"},
            "demo4": {"roi_inset_px", "min_area", "max_area"},
            "demo5": {"roi_inset_px", "min_area", "max_area"},
            "demo6": {
                "edge_inset_all", "edge_inset_left", "edge_inset_right",
                "edge_inset_top", "edge_inset_bottom", "min_area", "max_area",
            },
            "demo7": {
                "center_mask_width", "center_mask_height",
                "edge_inset_all", "edge_inset_left", "edge_inset_right",
                "edge_inset_top", "edge_inset_bottom", "min_area", "max_area",
            },
            "demo9": {
                "center_mask_width", "center_mask_height",
                "edge_inset_all", "edge_inset_left", "edge_inset_right",
                "edge_inset_top", "edge_inset_bottom", "min_area", "max_area",
            },
            "demo8": {
                "edge_inset_all", "edge_inset_left", "edge_inset_right",
                "edge_inset_top", "edge_inset_bottom", "min_area", "max_area",
            },
            "demo10": {
                "outer_target_width", "outer_width_tolerance",
                "outer_target_height", "outer_height_tolerance",
                "inner_target_width", "inner_width_tolerance",
                "inner_target_height", "inner_height_tolerance",
                "max_edge_gap", "roi_inset_px",
            },
            "demo11": {"defect_width", "defect_height"},
            "demo12": {"min_box_area_px"},
        }
        expected_inner = {
            "demo1": {
                "center_mask_enabled", "center_mask_use_image_center",
                "center_mask_x", "center_mask_y", "edge_mask_enabled",
                "background_kernel_size", "background_kernel_divisor",
                "background_kernel_min", "background_kernel_max",
                "gaussian_sigma", "mad_scale", "noise_sigma_floor",
                "residual_threshold_floor", "residual_sigma_multiplier",
                "candidate_max_value", "morph_operation", "morph_kernel",
                "morph_iterations", "connectivity", "min_background_pixels",
                "cnr_noise_floor",
            },
            "demo2": {
                "edge_mask_enabled",
                "blur_size", "adaptive_block_size", "adaptive_c", "max_value",
                "binary_inv", "morph_operation", "morph_kernel",
                "morph_iterations", "contour_mode",
            },
            "demo3": {
                "blur_size", "morph_operation", "morph_kernel",
                "morph_iterations", "adaptive_block_size", "adaptive_c",
                "binary_inv", "max_value", "contour_mode",
            },
            "demo4": {
                "threshold_method", "max_value", "invert", "blur_size",
                "adaptive_block_size", "adaptive_c", "contour_mode",
                "morph_operation", "morph_kernel", "morph_iterations",
                "process_scale", "min_circularity", "min_fill_ratio",
                "max_fill_ratio",
            },
            "demo5": {
                "max_value", "blur_size", "adaptive_block_size", "adaptive_c",
                "contour_mode", "white_pixel_ratio_threshold",
            },
            "demo6": {
                "edge_mask_enabled", "adaptive_block_size", "adaptive_c",
                "max_value", "binary_inv", "contour_mode",
            },
            "demo7": {
                "center_mask_enabled", "center_mask_use_image_center",
                "center_mask_x", "center_mask_y",
                "edge_mask_enabled", "threshold_value", "max_value",
                "binary_inv", "contour_mode", "approx_epsilon_ratio",
                "min_vertices",
            },
            "demo9": {
                "center_mask_enabled", "center_mask_use_image_center",
                "center_mask_x", "center_mask_y",
                "edge_mask_enabled", "threshold_value", "max_value",
                "binary_inv", "contour_mode", "approx_epsilon_ratio",
                "min_vertices",
            },
            "demo8": {
                "edge_mask_enabled", "threshold_value", "max_value",
                "binary_inv", "contour_mode", "approx_epsilon_ratio",
                "min_vertices",
            },
            "demo10": {
                "max_value", "outer_threshold", "outer_invert",
                "outer_contour_mode", "inner_adaptive_block_size",
                "inner_adaptive_c", "inner_invert", "inner_contour_mode",
            },
            "demo11": {"mode", "defect_x", "defect_y"},
            "demo12": {
                "model_id", "confidence_threshold", "nms_iou_threshold",
                "target_class_ids", "max_detections", "inference_backend",
                "precision", "class_agnostic_nms",
            },
        }
        definitions = DetectorManager().definitions()

        self.assertEqual(set(definitions), set(expected_outer))
        for detector_id, definition in definitions.items():
            specs = definition["param_spec"]
            self.assertEqual(
                set(specs), set(definition["default_params"]), detector_id
            )
            self.assertEqual(
                {key for key, spec in specs.items() if spec["parameter_group"] == "outer"},
                expected_outer[detector_id],
            )
            self.assertTrue(
                all(spec["parameter_group"] in {"outer", "inner"} for spec in specs.values())
            )
            self.assertTrue(
                all(
                    spec["engineer_visible"] == (spec["parameter_group"] == "outer")
                    for spec in specs.values()
                )
            )
            self.assertEqual(
                {
                    key
                    for key, spec in specs.items()
                    if spec["parameter_group"] == "inner"
                },
                expected_inner[detector_id],
                detector_id,
            )

        for source_path in sorted((ROOT / "detectors").glob("detector_*.py")):
            self.assertNotIn(
                "engineer_visible",
                source_path.read_text(encoding="utf-8"),
                source_path.name,
            )

    def test_demo_registry_has_no_production_aliases(self):
        self.assertEqual(RecipeManager.LEGACY_DETECTOR_ID_ALIASES, {})
        self.assertEqual(RecipeManager.LEGACY_DEFAULT_DISPLAY_NAMES, {})
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "demo.yaml"
            path.write_text(yaml.safe_dump(self.recipe), encoding="utf-8")
            loaded = RecipeManager().load(path)
        self.assertEqual(set(loaded["detectors"]), set(self.recipe["detectors"]))


    def test_unknown_and_unregistered_demo_base_are_rejected(self):
        for unknown in ("legacy-product", "demo13"):
            recipe = deepcopy(self.recipe)
            recipe["detectors"] = {unknown: next(iter(recipe["detectors"].values()))}
            recipe["decision"]["important_detectors"] = [unknown]
            with self.assertRaisesRegex(RecipeError, "not registered"):
                RecipeManager().validate(recipe)


    def test_pixel_size_is_optional_positive_and_backward_compatible(self):
        self.recipe["output"].pop("pixel_size_um_per_px", None)
        RecipeManager().validate(self.recipe)

        self.recipe["output"]["pixel_size_um_per_px"] = None
        RecipeManager().validate(self.recipe)

        self.recipe["output"]["pixel_size_um_per_px"] = 4.5
        RecipeManager().validate(self.recipe)

        for invalid in (0, -1, "4.5", True, float("nan")):
            with self.subTest(invalid=invalid):
                self.recipe["output"]["pixel_size_um_per_px"] = invalid
                with self.assertRaises(RecipeError):
                    RecipeManager().validate(self.recipe)


class ReporterAreaCalibrationTests(unittest.TestCase):
    RESULT = {
        "image_name": "input.png",
        "recipe_name": "recipe",
        "machine_id": "DEMO_MACHINE",
        "product_id": "DEMO_PRODUCT",
        "final_result": "NG",
        "tiles": [{
            "tile": {"tile_id": "T1"},
            "detectors": [{
                "detector_id": "demo3",
                "score": 0.9,
                "defects": [{
                    "type": "dark_region",
                    "bbox_global": [1, 2, 3, 4],
                    "bbox_local": [1, 2, 3, 4],
                    "tile_id": "T1",
                    "area": 250.0,
                }],
            }],
        }],
    }

    def test_csv_converts_pixel_area_to_square_micrometers(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "converted.csv"
            CsvExporter({"pixel_size_um_per_px": 4.0}).write_csv(path, self.RESULT)
            with path.open(encoding="utf-8-sig", newline="") as handle:
                row = next(csv.DictReader(handle))

        self.assertEqual(float(row["area"]), 4000.0)
        self.assertEqual(row["area_unit"], "um^2")

    def test_csv_keeps_pixel_area_when_precision_is_missing(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "pixels.csv"
            CsvExporter({}).write_csv(path, self.RESULT)
            with path.open(encoding="utf-8-sig", newline="") as handle:
                row = next(csv.DictReader(handle))

        self.assertEqual(float(row["area"]), 250.0)
        self.assertEqual(row["area_unit"], "px^2")


class NgTileDefectGroupingTests(unittest.TestCase):
    @staticmethod
    def _result() -> dict:
        return {
            "image_name": "input.png",
            "recipe_name": "recipe",
            "recipe_version": "1",
            "provenance": {},
            "tiles": [{
                "result": "NG",
                "tile": {"tile_id": "T1"},
                "_tile_image": np.zeros((16, 16, 3), dtype=np.uint8),
                "detectors": [{
                    "detector_id": "401",
                    "pass": False,
                    "defects": [
                        {"type": "scratch", "bbox_local": [1, 1, 2, 2]},
                        {"type": "dent/burr", "bbox_local": [4, 4, 2, 2]},
                    ],
                }],
            }],
        }

    def test_grouping_disabled_keeps_flat_ng_tile_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            exporter = NgTileExporter({}, ReportImageEncoder({}))
            sidecars = exporter.write_ng_tiles(self._result(), "run", root)

            self.assertEqual(sidecars, [str(root / "run_T1.json")])
            self.assertTrue((root / "run_T1.png").is_file())

    def test_grouping_enabled_copies_multi_defect_tile_to_safe_subfolders(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            exporter = NgTileExporter(
                {"group_ng_tiles_by_defect": True}, ReportImageEncoder({})
            )
            sidecars = exporter.write_ng_tiles(self._result(), "run", root)

            expected = [
                root / "scratch" / "run_T1.json",
                root / "dent_burr" / "run_T1.json",
            ]
            self.assertEqual(sidecars, [str(path) for path in expected])
            for sidecar in expected:
                self.assertTrue(sidecar.is_file())
                self.assertTrue(sidecar.with_suffix(".png").is_file())

    def test_grouping_uses_ng_folder_when_detector_has_no_defect_rows(self):
        result = self._result()
        result["tiles"][0]["detectors"][0]["defects"] = []
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            exporter = NgTileExporter(
                {"group_ng_tiles_by_defect": True}, ReportImageEncoder({})
            )
            sidecars = exporter.write_ng_tiles(result, "run", root)

            self.assertEqual(sidecars, [str(root / "NG" / "run_T1.json")])
            self.assertTrue((root / "NG" / "run_T1.png").is_file())



class MatrixCsvDefectTypeTests(unittest.TestCase):
    @staticmethod
    def _tile(row, col, result, detectors):
        return {"tile": {"tile_id": f"r{row}c{col}", "row": row, "col": col}, "result": result, "detectors": detectors}

    def test_ng_cells_list_distinct_defect_types_and_pass_cells_stay_empty(self):
        cnr = {"type": "demo1_auto_cnr_ng"}
        circle = {"type": "demo4_circle_detected_ng"}
        result = {
            "image_name": "IMG.bmp",
            "tiles": [
                self._tile(0, 0, "PASS", [{"detector_id": "demo1", "pass": True, "defects": []}]),
                self._tile(0, 1, "NG", [
                    {"detector_id": "demo1", "pass": False, "defects": [cnr, dict(cnr), dict(cnr)]},
                    {"detector_id": "demo4", "pass": False, "defects": [circle]},
                ]),
                self._tile(1, 0, "NG", [{"detector_id": "demo4", "pass": False, "defects": [circle]}]),
                # Detector NG without defect entries still marks the cell with the NG detector.
                self._tile(1, 1, "NG", [
                    {"detector_id": "demo1", "pass": True, "defects": []},
                    {"detector_id": "900-DOMAIN", "pass": False, "defects": []},
                ]),
            ],
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "IMG_matrix.csv"
            MatrixCsvExporter.write_matrix_csv(path, result)
            with path.open(encoding="utf-8-sig", newline="") as handle:
                rows = list(csv.DictReader(handle))

        self.assertEqual(
            rows,
            [
                {"id": "IMG-2", "c1": "", "c2": "demo1_auto_cnr_ng; demo4_circle_detected_ng"},
                {"id": "IMG-1", "c1": "demo4_circle_detected_ng", "c2": "900-DOMAIN"},
            ],
        )


class ContinuousValidationContractTests(unittest.TestCase):
    def test_benchmark_gate_rejects_p95_regression_above_fifteen_percent(self):
        baseline = {"benchmark": {"measurements": [{
            "operation": "gaussian", "gpu_including_transfer": {"p95_ms": 10.0}
        }]}}
        current = {"benchmark": {"measurements": [{
            "operation": "gaussian", "gpu_including_transfer": {"p95_ms": 11.6}
        }]}}
        failures = compare_p95(current, baseline, 0.15)
        self.assertEqual(failures[0]["operation"], "gaussian")
        current["benchmark"]["measurements"][0]["gpu_including_transfer"]["p95_ms"] = 11.5
        self.assertEqual(compare_p95(current, baseline, 0.15), [])

    def test_workflows_have_heartbeat_locked_packaging_and_baseline_gate(self):
        heartbeat = (ROOT / ".github/workflows/rtx-heartbeat.yml").read_text(encoding="utf-8")
        packaging = (ROOT / ".github/workflows/weekly-packaging.yml").read_text(encoding="utf-8")
        rtx = (ROOT / ".github/workflows/rtx3090-validation.yml").read_text(encoding="utf-8")
        self.assertIn("ageHours > 48", heartbeat)
        self.assertIn("requirements.lock.txt", packaging)
        self.assertIn("--smoke-test", packaging)
        self.assertIn("benchmark_gate.py", rtx)
        self.assertIn("--max-regression 0.15", rtx)


class ProvenanceAndDatasetTests(unittest.TestCase):
    def test_build_provenance_is_cached_but_callers_receive_independent_dicts(self):
        from unittest.mock import patch

        _cached_build_provenance.cache_clear()
        try:
            with patch("core.provenance._read_packaged_provenance", return_value=None), patch(
                "core.provenance._git",
                return_value="# branch.oid abc123\n# branch.head main\n1 .M N... core/pipeline.py",
            ) as git:
                first = build_provenance()
                first["commit"] = "mutated"
                second = build_provenance()

            git.assert_called_once_with(
                "status", "--porcelain=v2", "--branch", "--untracked-files=no"
            )
            self.assertEqual(second, {"commit": "abc123", "dirty": True, "source": "git"})
        finally:
            _cached_build_provenance.cache_clear()

    def test_source_and_effective_recipe_hashes_are_distinct_and_deterministic(self):
        path = ROOT / "recipes/DEMO3.yaml"
        recipe = RecipeManager().load(path)
        provenance = inspection_provenance(path, recipe)
        self.assertEqual(provenance["recipe_source_sha256"], sha256_bytes(path.read_bytes()))
        self.assertEqual(provenance["effective_recipe_sha256"], canonical_sha256(recipe))
        self.assertEqual(len(provenance["effective_recipe_sha256"]), 64)
        self.assertIn("commit", provenance["app"])
        self.assertEqual(
            provenance["detector_params"]["demo3"],
            recipe["detectors"]["demo3"]["params"],
        )

    def test_pipeline_writes_ng_tile_image_and_review_sidecar(self):
        with tempfile.TemporaryDirectory(prefix="visionflow_sidecar_") as temporary:
            root = Path(temporary)
            image = np.full((512, 512, 3), 255, np.uint8)
            cv2.rectangle(image, (220, 220), (260, 250), (0, 0, 0), -1)
            image_path = root / "input.png"
            write_png(image_path, image)
            result = AOIPipeline(
                ROOT / "recipes/DEMO3.yaml", root / "output"
            ).run(image_path)
            self.assertEqual(result["final_result"], "NG")
            sidecars = result["outputs"]["ng_tile_sidecars"]
            self.assertGreaterEqual(len(sidecars), 1)
            sidecar = json.loads(Path(sidecars[0]).read_text(encoding="utf-8"))
            self.assertEqual(sidecar["human_review"]["status"], "pending")
            self.assertEqual(sidecar["source_image"], "input.png")
            self.assertEqual(sidecar["detectors"][0]["params"]["morph_kernel"], 3)
            self.assertTrue(sidecar["detectors"][0]["defects"][0]["bbox_global"])
            self.assertTrue(Path(sidecars[0]).with_suffix(".png").exists())


class DemoGoldenDefectTests(unittest.TestCase):
    def test_synthetic_examples_have_deterministic_pass_and_ng(self):
        from tools.demo_dataset import images
        dataset = images()
        manager = DetectorManager()
        for number in range(1, 11):
            detector_id = f"demo{number}"
            pass_image = dataset["frame" if number == 10 else "blank"]
            ng_image = dataset["blank" if number == 10 else "dark_rectangle" if number == 8 else "shapes"]
            with self.subTest(detector=detector_id):
                detector = manager.create(detector_id)
                self.assertTrue(detector.run(pass_image)["pass"])
                first = detector.run(ng_image)
                second = detector.run(ng_image)
                self.assertFalse(first["pass"])
                self.assertEqual(first["defects"], second["defects"])
                for defect in first["defects"]:
                    self.assertEqual(len(defect["bbox_local"]), 4)
                    self.assertGreaterEqual(defect["area"], 0)

    def test_every_shipped_recipe_runs_on_synthetic_inputs(self):
        from tools.demo_dataset import images
        from tools.demo_dataset import write_images
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_images(root)
            for recipe_path in sorted((ROOT / "recipes").rglob("*.yaml")):
                with self.subTest(recipe=recipe_path.name):
                    result = AOIPipeline(recipe_path, root / "output",
                        output_overrides={"save_overlay": False, "save_ng_tiles": False,
                            "save_csv": False, "save_matrix_csv": False, "save_json": False}
                    ).run(root / "shapes.png")
                    self.assertIn(result["final_result"], ("PASS", "NG"))
                    self.assertEqual(result["recipe_name"], recipe_path.stem)
                    self.assertTrue(all(re.fullmatch(r"demo\d+", d["detector_id"])
                        for tile in result["tiles"] for d in tile["detectors"]))


if __name__ == "__main__":
    unittest.main()
