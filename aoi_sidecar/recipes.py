"""Recipe load/save/filter and detector catalog for the sidecar (no Qt).

Parameter grouping follows ``core.parameter_schema.ParameterSpec.parameter_group`` only; a value
that is not classified as ``outer`` is ``inner`` and hidden from op/eng (an omitted or unknown
classification defaults to admin-only ``inner``). Loading or saving in a non-admin mode preserves
every hidden ``inner`` value and the ``camera`` section exactly, so the parameter grouping is
UI/access metadata and never renames Recipe fields or changes defaults.
"""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import yaml

from core.detector_manager import DetectorManager
from core.recipe_manager import RecipeManager

from aoi_sidecar import paths

RECIPES_DIR = paths.app_root() / "recipes"

_OUTER = "outer"
_INNER = "inner"


def list_recipes(directory: str | None = None) -> list[dict]:
    """Recipes directly under ``recipes/`` (or ``directory``), each with name/detectors/gpu_mode."""
    root = paths.resolve_host_path(directory) if directory else RECIPES_DIR
    manager = RecipeManager()
    results: list[dict] = []
    if not root.is_dir():
        return results
    paths_found = sorted(root.glob("*.yaml")) + sorted(root.glob("*.yml"))
    for path in paths_found:
        try:
            recipe = manager.load(path)
        except Exception:
            continue
        detectors = sorted(
            detector_id
            for detector_id, config in recipe.get("detectors", {}).items()
            if isinstance(config, dict) and config.get("enabled", False)
        )
        results.append({
            "path": str(path),
            "name": str(recipe.get("recipe_name", path.stem)),
            "detectors": detectors,
            "gpu_mode": manager.gpu_mode(recipe.get("gpu")),
        })
    return results


def detector_catalog(admin: bool) -> list[dict]:
    """Every registered detector with its parameter list (inner hidden from op/eng)."""
    manager = DetectorManager()
    catalog: list[dict] = []
    for detector_id, definition in manager.definitions().items():
        params: list[dict] = []
        for name, spec in definition.get("param_spec", {}).items():
            group = spec.get("parameter_group", _INNER)
            is_inner = group != _OUTER
            param: dict = {
                "name": name,
                "type": spec.get("value_type", "str"),
                "group": group,
            }
            if spec.get("label"):
                param["label"] = spec["label"]
            if spec.get("minimum") is not None:
                param["min"] = spec["minimum"]
            if spec.get("maximum") is not None:
                param["max"] = spec["maximum"]
            if spec.get("choices"):
                param["choices"] = list(spec["choices"])
            if is_inner and not admin:
                param["hidden"] = True
            else:
                param["default"] = spec.get("default")
            params.append(param)
        catalog.append({
            "id": detector_id,
            "label": definition.get("display_name") or definition.get("detector_name") or detector_id,
            "supports_cuda": DetectorManager.uses_native_cuda_runtime(detector_id),
            "params": params,
        })
    return catalog


def load_recipe(path: str | Path, admin: bool) -> dict:
    """Load a recipe; in non-admin mode inner/unknown param values are stripped, camera stays."""
    manager = RecipeManager()
    resolved = paths.resolve_host_path(path)
    recipe = manager.load(resolved)
    detector_manager = DetectorManager()
    result = deepcopy(recipe)
    hidden_inner_count = 0
    for detector_id, config in result.get("detectors", {}).items():
        if not isinstance(config, dict):
            continue
        specs = detector_manager.parameter_specs(str(detector_id))
        params = config.get("params")
        if not isinstance(params, dict):
            continue
        for name in list(params.keys()):
            spec = specs.get(name)
            # Fail-closed: only an explicit ``outer`` classification is visible to op/eng.
            if spec is not None and spec.parameter_group == _OUTER:
                continue
            hidden_inner_count += 1
            if not admin:
                params.pop(name, None)
    return {
        "path": str(resolved),
        "recipe": result,
        "hidden_inner_count": hidden_inner_count,
        "camera_editable": bool(admin),
    }


def save_recipe(path: str | Path, recipe: dict, admin: bool, base_path: str | None = None) -> dict:
    """Validate and write ``recipe``; non-admin edits to inner params/camera are ignored."""
    manager = RecipeManager()
    detector_manager = DetectorManager()
    final = deepcopy(recipe)
    target = paths.resolve_host_path(path)
    if not admin:
        base = _base_recipe(target, base_path, manager)
        if base is not None:
            final = _restore_hidden(base, final, detector_manager)
    manager.validate(final)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(yaml.safe_dump(final, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return {"path": str(target)}


def _base_recipe(path: str | Path, base_path: str | None, manager: RecipeManager) -> dict | None:
    candidates = []
    if base_path:
        candidates.append(paths.resolve_host_path(base_path))
    candidates.append(path)
    for candidate in candidates:
        try:
            return manager.load(candidate)
        except Exception:
            continue
    return None


def _restore_hidden(base: dict, recipe: dict, detector_manager: DetectorManager) -> dict:
    """Copy every hidden ``inner``/unknown value and the ``camera`` section exactly from ``base``."""
    base_detectors = base.get("detectors", {}) or {}
    for detector_id, config in recipe.get("detectors", {}).items():
        if not isinstance(config, dict):
            continue
        base_config = base_detectors.get(str(detector_id))
        base_params = base_config.get("params") if isinstance(base_config, dict) else None
        specs = detector_manager.parameter_specs(str(detector_id))
        outer_names = {name for name, spec in specs.items() if spec.parameter_group == _OUTER}
        if not isinstance(base_params, dict):
            base_params = {}
        params = config.get("params")
        if not isinstance(params, dict):
            params = {}
            config["params"] = params
        # Fail-closed: a param without an ``outer`` spec is ``inner``. Eng cannot add it, so drop
        # any such name that is not already in the base recipe (classified inner or unknown).
        for name in list(params.keys()):
            if name not in outer_names and name not in base_params:
                params.pop(name, None)
        # Restore every non-outer value from base exactly, including unclassified params.
        for name in list(base_params.keys()):
            if name in outer_names:
                continue
            params[name] = deepcopy(base_params[name])
    if "camera" in base:
        recipe["camera"] = deepcopy(base["camera"])
    else:
        recipe.pop("camera", None)
    return recipe
