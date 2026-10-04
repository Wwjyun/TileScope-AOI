from __future__ import annotations

from detectors.demo_defaults import demo_defaults

from core.parameter_schema import (
    PARAMETER_GROUP_INNER,
    PARAMETER_GROUP_OUTER,
    specs_from_defaults,
)
from detectors.detector_demo8 import Demo8Detector
from detectors.contour_helpers import center_mask_bbox, edge_mask_parameter_overrides


class Demo9Detector(Demo8Detector):
    """Fixed-threshold polygon detector with configurable edge exclusion masks."""

    detector_id = 'demo9'
    detector_name = 'demo9'
    display_name = 'demo9'
    defect_type = "demo9_polygon_ng"
    preprocess_plan_name = "demo9_preprocess"

    default_params = demo_defaults("demo9")
    PARAM_SPEC = specs_from_defaults(
        default_params,
        {
            **edge_mask_parameter_overrides(),
            "center_mask_enabled": {
                "parameter_group": PARAMETER_GROUP_INNER,
                "label": "啟用中心屏蔽",
            },
            "center_mask_use_image_center": {
                "parameter_group": PARAMETER_GROUP_INNER,
                "label": "使用影像中心",
            },
            "center_mask_x": {
                "minimum": 0,
                "parameter_group": PARAMETER_GROUP_INNER,
                "label": "自訂中心 X",
            },
            "center_mask_y": {
                "minimum": 0,
                "parameter_group": PARAMETER_GROUP_INNER,
                "label": "自訂中心 Y",
            },
            "center_mask_width": {
                "minimum": 0,
                "parameter_group": PARAMETER_GROUP_OUTER,
                "label": "中心屏蔽半寬 X",
            },
            "center_mask_height": {
                "minimum": 0,
                "parameter_group": PARAMETER_GROUP_OUTER,
                "label": "中心屏蔽半高 Y",
            },
            "threshold_value": {
                "minimum": 0,
                "maximum": 255,
                "parameter_group": PARAMETER_GROUP_INNER,
                "label": "固定二值化門檻",
            },
            "max_value": {
                "minimum": 1,
                "maximum": 255,
                "parameter_group": PARAMETER_GROUP_INNER,
                "label": "二值化最大值",
            },
            "binary_inv": {
                "parameter_group": PARAMETER_GROUP_INNER,
                "label": "反相二值化",
            },
            "contour_mode": {
                "choices": ("external", "list", "tree", "ccomp"),
                "parameter_group": PARAMETER_GROUP_INNER,
                "label": "輪廓擷取模式",
            },
            "approx_epsilon_ratio": {
                "minimum": 0.0,
                "maximum": 1.0,
                "parameter_group": PARAMETER_GROUP_INNER,
                "label": "多邊形近似比例",
            },
            "min_vertices": {
                "minimum": 3,
                "parameter_group": PARAMETER_GROUP_INNER,
                "label": "多邊形最少頂點",
            },
            "min_area": {
                "minimum": 0,
                "parameter_group": PARAMETER_GROUP_OUTER,
                "label": "最小面積",
            },
            "max_area": {
                "minimum": 0,
                "parameter_group": PARAMETER_GROUP_OUTER,
                "label": "最大面積",
            },
        },
    )

    def detect(self, image) -> list[dict]:
        defects = super().detect(image)
        height, width = image.shape[:2]
        center_mask = self._effective_center_mask(width, height)
        for defect in defects:
            metadata = defect["metadata"]
            metadata.update(
                {
                    "center_mask_enabled": bool(
                        self.params.get("center_mask_enabled", False)
                    ),
                    "center_mask_use_image_center": bool(
                        self.params.get("center_mask_use_image_center", True)
                    ),
                    "center_mask_center": center_mask["center"],
                    "center_mask_half_extents": center_mask["half_extents"],
                    "effective_center_mask_bbox": center_mask["bbox"],
                    "mask_order": (
                        "gray_global_binary_inv_center_edge_mask_polygon"
                        if bool(self.params.get("binary_inv", False))
                        else "gray_global_binary_center_edge_mask_polygon"
                    ),
                }
            )
        return defects

    def _apply_edge_mask(self, binary):
        height, width = binary.shape[:2]
        masked = binary.copy()
        center_mask = self._effective_center_mask(width, height)
        if bool(self.params.get("center_mask_enabled", False)):
            x, y, mask_width, mask_height = center_mask["bbox"]
            if mask_width > 0 and mask_height > 0:
                masked[y : y + mask_height, x : x + mask_width] = 0
        return super()._apply_edge_mask(masked)

    def _effective_center_mask(self, width: int, height: int) -> dict:
        if bool(self.params.get("center_mask_use_image_center", True)):
            center_x = width // 2
            center_y = height // 2
        else:
            center_x = int(self.params.get("center_mask_x", width // 2))
            center_y = int(self.params.get("center_mask_y", height // 2))

        half_width = max(0, int(self.params.get("center_mask_width", 0)))
        half_height = max(0, int(self.params.get("center_mask_height", 0)))
        bbox = center_mask_bbox(
            width, height, center_x, center_y, half_width, half_height
        )
        return {
            "center": [center_x, center_y],
            "half_extents": [half_width, half_height],
            "bbox": bbox,
        }
