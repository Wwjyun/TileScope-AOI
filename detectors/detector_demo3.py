from __future__ import annotations

from detectors.demo_defaults import demo_defaults

import cv2
import numpy as np
import time

from core.preprocess_plan import AdaptiveMean, Gaussian, Gray, Morphology, PreprocessPlan
from core.parameter_schema import (
    PARAMETER_GROUP_INNER,
    PARAMETER_GROUP_OUTER,
    specs_from_defaults,
)
from detectors.base_detector import BaseDetector
from detectors.contour_helpers import execute_cached_preprocess_plan, inset_roi_image


class Demo3Detector(BaseDetector):
    """demo3 negative detector with fixed confidence formula `min(1, area / image_area)`."""

    detector_id = 'demo3'
    detector_name = 'demo3'
    display_name = 'demo3'
    CONFIDENCE_AREA_SCALE = 1.0
    CONFIDENCE_CAP = 1.0
    default_params = demo_defaults("demo3")
    PARAM_SPEC = specs_from_defaults(default_params, {
        "roi_inset_px": {"minimum": 0, "parameter_group": PARAMETER_GROUP_OUTER},
        "blur_size": {"minimum": 3, "odd": True, "parameter_group": PARAMETER_GROUP_INNER},
        "morph_operation": {"choices": ("none", "open", "close", "erode", "dilate"), "parameter_group": PARAMETER_GROUP_INNER},
        "morph_kernel": {"minimum": 1, "odd": True, "parameter_group": PARAMETER_GROUP_INNER},
        "morph_iterations": {"minimum": 0, "parameter_group": PARAMETER_GROUP_INNER},
        "adaptive_block_size": {"minimum": 3, "odd": True, "parameter_group": PARAMETER_GROUP_INNER},
        "adaptive_c": {"parameter_group": PARAMETER_GROUP_INNER},
        "binary_inv": {"parameter_group": PARAMETER_GROUP_INNER},
        "max_value": {"minimum": 1, "maximum": 255, "parameter_group": PARAMETER_GROUP_INNER},
        "contour_mode": {"choices": ("external", "list", "tree", "ccomp"), "parameter_group": PARAMETER_GROUP_INNER},
        "min_area": {"minimum": 0, "parameter_group": PARAMETER_GROUP_OUTER},
        "max_area": {"minimum": 0, "parameter_group": PARAMETER_GROUP_OUTER},
    })

    def preprocess(self, image):
        return image

    def detect(self, image) -> list[dict]:
        roi, offset_x, offset_y = self._roi_image(image)
        with self.measure_detection_stage("preprocess"):
            binary = self._make_binary(roi, offset_x, offset_y)
        with self.measure_detection_stage("find_contours"):
            contours, _ = cv2.findContours(binary, self._contour_mode(), cv2.CHAIN_APPROX_SIMPLE)
        geometry_started = time.perf_counter()
        image_area = max(float(image.shape[0] * image.shape[1]), 1.0)
        defects = []

        for contour in contours:
            if len(contour) < 3:
                continue

            rect = cv2.minAreaRect(contour)
            (center_x, center_y), (width, height), angle = rect
            rect_area = float(width * height)
            if not self._passes_area_filter(rect_area):
                continue

            box = cv2.boxPoints(rect)
            box = np.round(box).astype(int)
            x, y, w, h = cv2.boundingRect(box.reshape(-1, 1, 2))
            x += offset_x
            y += offset_y
            box[:, 0] += offset_x
            box[:, 1] += offset_y
            confidence = min(
                self.CONFIDENCE_CAP,
                rect_area / image_area * self.CONFIDENCE_AREA_SCALE,
            )

            defects.append(
                {
                    "type": "demo3_negative_rect_detected_ng",
                    "bbox_local": [int(x), int(y), int(w), int(h)],
                    "area": float(np.round(rect_area, 3)),
                    "confidence": float(np.round(confidence, 4)),
                    "metadata": {
                        "shape": "rotated_rectangle",
                        "center_local": [
                            float(np.round(center_x + offset_x, 3)),
                            float(np.round(center_y + offset_y, 3)),
                        ],
                        "size": [float(np.round(width, 3)), float(np.round(height, 3))],
                        "angle": float(np.round(angle, 3)),
                        "box_points_local": box.tolist(),
                        "roi_inset_px": int(self.params.get("roi_inset_px", 0)),
                        "roi_offset_local": [int(offset_x), int(offset_y)],
                        "blur_size": int(self.params.get("blur_size", 3)),
                        "morph_operation": str(self.params.get("morph_operation", 'none')),
                        "morph_kernel": int(self.params.get("morph_kernel", 3)),
                        "morph_iterations": int(self.params.get("morph_iterations", 1)),
                        "adaptive_block_size": int(self.params.get("adaptive_block_size", 15)),
                        "adaptive_c": float(self.params.get("adaptive_c", 2.0)),
                        "binary_inv": bool(self.params.get("binary_inv", True)),
                        "threshold_type": "adaptive_mean_inv"
                        if self.params.get("binary_inv", True)
                        else "adaptive_mean",
                        "contour_mode": str(self.params.get("contour_mode", 'external')),
                    },
                }
            )

        self._detection_stage_durations["geometry_analysis"] = time.perf_counter() - geometry_started
        defects.sort(key=lambda item: item["area"], reverse=True)
        return defects

    def _roi_image(self, image):
        return inset_roi_image(image, self.params.get("roi_inset_px", 0))

    def _make_binary(self, image, offset_x: int = 0, offset_y: int = 0):
        blur_size = self._odd_at_least(int(self.params.get("blur_size", 3)), 3)
        block_size = self._odd_at_least(int(self.params.get("adaptive_block_size", 15)), 3)
        operation = str(self.params.get("morph_operation", 'none')).lower()
        iterations = max(0, int(self.params.get("morph_iterations", 1)))
        raw_kernel_size = int(self.params.get("morph_kernel", 3))
        kernel_size = 1 if raw_kernel_size <= 1 else self._odd_at_least(raw_kernel_size, 3)
        adaptive_c = float(self.params.get("adaptive_c", 2.0))
        max_value = int(self.params.get("max_value", 255))
        invert = bool(self.params.get("binary_inv", True))
        signature = (
            "demo3_preprocess",
            blur_size,
            operation,
            kernel_size,
            iterations,
            block_size,
            adaptive_c,
            max_value,
            invert,
        )
        return execute_cached_preprocess_plan(
            self,
            image,
            signature,
            lambda: PreprocessPlan(
                name="demo3_gaussian_morphology_gray_adaptive_mean",
                operations=(
                    Gaussian(blur_size),
                    Morphology(operation, kernel_size, iterations),
                    Gray(),
                    AdaptiveMean(block_size, adaptive_c, max_value, invert),
                ),
            ),
            (offset_x, offset_y),
        )

    def _passes_area_filter(self, area: float) -> bool:
        min_area = float(self.params.get("min_area", 16.0))
        max_area = float(self.params.get("max_area", 4096.0))
        if min_area and area < min_area:
            return False
        if max_area and area > max_area:
            return False
        return True

    def _contour_mode(self) -> int:
        mode = str(self.params.get("contour_mode", 'external')).lower()
        if mode in {"all", "list"}:
            return cv2.RETR_LIST
        if mode == "tree":
            return cv2.RETR_TREE
        return cv2.RETR_EXTERNAL

    @staticmethod
    def _odd_at_least(value: int, minimum: int) -> int:
        value = max(int(value), minimum)
        return value if value % 2 == 1 else value + 1
