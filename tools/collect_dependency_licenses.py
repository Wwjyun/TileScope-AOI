"""Collect license evidence from installed runtime distributions for a private build."""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import shutil
from pathlib import Path, PurePosixPath

PACKAGES = ("opencv-python", "numpy", "onnxruntime", "PyYAML", "PySide6",
            "PySide6_Essentials", "PySide6_Addons", "shiboken6", "pythonnet", "clr_loader")


def collect(destination: Path) -> list[dict]:
    destination.mkdir(parents=True, exist_ok=True)
    index = []
    for package in PACKAGES:
        distribution = importlib.metadata.distribution(package)
        copied = []
        for entry in distribution.files or ():
            relative = PurePosixPath(str(entry).replace("\\", "/"))
            if ".." in relative.parts or relative.is_absolute():
                continue
            name = relative.name.lower()
            if not ("license" in name or "licence" in name or "notice" in name or name == "copying"):
                continue
            source = Path(distribution.locate_file(entry))
            if not source.is_file():
                continue
            target = destination / package / Path(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            copied.append(relative.as_posix())
        if not copied:
            raise RuntimeError(f"No license evidence found for {package}; inspect this distribution.")
        index.append({"package": package, "version": distribution.version, "files": copied})
    (destination / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    return index


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = collect(args.output)
    print(f"Collected license evidence for {len(result)} distributions.")
