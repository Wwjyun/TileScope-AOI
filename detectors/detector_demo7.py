from __future__ import annotations

from detectors.demo_defaults import demo_defaults

from detectors.detector_demo9 import Demo9Detector


class Demo7Detector(Demo9Detector):
    """demo7 identity for the shared fixed-threshold polygon detector contract."""

    detector_id = 'demo7'
    detector_name = 'demo7'
    display_name = 'demo7'
    defect_type = "demo7_polygon_ng"
    preprocess_plan_name = "demo7_preprocess"
    # demo7 shares the polygon schema with demo9, but owns an independent declaration so
    # future recipe changes for either registered Detector cannot alias class state.
    default_params = demo_defaults("demo7")
    PARAM_SPEC = {**Demo9Detector.PARAM_SPEC}
