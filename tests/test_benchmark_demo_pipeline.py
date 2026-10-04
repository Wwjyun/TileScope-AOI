import tempfile
import unittest
from pathlib import Path

from tools.benchmark_demo_pipeline import (
    DEMO_ANCHOR,
    DEMO_BASE,
    DEMO_CANVAS,
    DEMO_GAP_X,
    DEMO_ROI,
    DEMO_ROI_ORIGINS,
    _profiler_coverage,
    _recipe,
    _timing_summary,
)


class ProductionBenchmarkContractTests(unittest.TestCase):
    def test_synthetic_canvas_contains_six_rois(self):
        self.assertEqual(DEMO_CANVAS, (1024, 256))
        self.assertEqual(DEMO_ROI, (128, 128))
        self.assertEqual(len(DEMO_ROI_ORIGINS), 6)
        for y, x in DEMO_ROI_ORIGINS:
            self.assertGreaterEqual(x, 0)
            self.assertGreaterEqual(y, 0)
            self.assertLessEqual(x + DEMO_ROI[1], DEMO_CANVAS[0])
            self.assertLessEqual(y + DEMO_ROI[0], DEMO_CANVAS[1])

    def test_production_recipe_uses_one_anchored_row_of_six_rois(self):
        with tempfile.TemporaryDirectory() as temporary:
            template = Path(temporary) / "anchor.png"
            recipe = _recipe(
                {"detectors": {}},
                "gpu/visionflow_cuda.dll",
                use_gpu=True,
                roi=DEMO_ROI,
                template_path=template,
            )
        tile = recipe["tile"]
        self.assertEqual((tile["rows"], tile["cols"]), (1, 6))
        self.assertEqual((tile["roi_h"], tile["roi_w"]), DEMO_ROI)
        self.assertEqual(tile["gap_x"], DEMO_GAP_X)
        self.assertEqual(
            (tile["offset_x"], tile["offset_y"]),
            (
                DEMO_BASE[0] - DEMO_ANCHOR[0],
                DEMO_BASE[1] - DEMO_ANCHOR[1],
            ),
        )

    def test_comparison_rejects_a_shifted_anchor_and_reports_score_as_drift(self):
        from tools.benchmark_demo_pipeline import _compare

        def result(x, score):
            return {"tiles": [{
                "tile": {"tile_id": "r0000_c0000", "x": x, "y": 30, "width": 20, "height": 10,
                         "metadata": {"match_bbox": [x - 5, 25, 8, 8], "score": score,
                                      "grid_anchor_backend": "cpu"}},
                "detectors": [],
            }]}

        same_place = _compare(result(40, 0.9999), result(40, 0.99989))
        self.assertTrue(same_place["decision_equal"])
        self.assertEqual(same_place["drift_counts"], {"anchor_score": 1})
        self.assertFalse(_compare(result(40, 0.9999), result(41, 0.9999))["decision_equal"])

    def test_timing_summary_uses_median_and_nearest_rank_p95(self):
        summary = _timing_summary([5.0, 1.0, 4.0, 2.0, 3.0])
        self.assertEqual(summary["median_ms"], 3.0)
        self.assertEqual(summary["p95_ms"], 5.0)
        self.assertEqual(summary["count"], 5)

    def test_profiler_coverage_does_not_double_count_nested_stages(self):
        result = {
            "execution": {
                "performance": {
                    "end_to_end_sec": 0.100,
                    "stages_sec": {
                        "image_load": 0.030,
                        "tiling": 0.020,
                        "template_match": 0.019,
                        "roi_generation": 0.001,
                        "detectors_total": 0.040,
                        "python_tile_detector_loop": 0.005,
                    },
                }
            }
        }

        coverage = _profiler_coverage(result, 112.0)

        self.assertAlmostEqual(coverage["named_stage_ms"], 90.0)
        self.assertAlmostEqual(coverage["internal_unprofiled_ms"], 10.0)
        self.assertAlmostEqual(coverage["return_overhead_ms"], 12.0)


if __name__ == "__main__":
    unittest.main()
