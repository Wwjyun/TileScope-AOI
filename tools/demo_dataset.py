"""Generate geometric inputs without importing any production data."""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np


def images() -> dict[str, np.ndarray]:
    blank = np.zeros((128, 128, 3), dtype=np.uint8)
    shapes = blank.copy()
    cv2.rectangle(shapes, (16, 16), (39, 39), (255, 255, 255), -1)
    cv2.circle(shapes, (88, 88), 12, (255, 255, 255), -1)
    dark = np.full_like(blank, 255)
    cv2.rectangle(dark, (48, 48), (71, 71), (0, 0, 0), -1)
    circle = blank.copy()
    cv2.circle(circle, (64, 64), 12, (255, 255, 255), -1)
    frame = blank.copy()
    cv2.rectangle(frame, (16, 24), (111, 103), (255, 255, 255), -1)
    cv2.rectangle(frame, (32, 40), (95, 87), (0, 0, 0), -1)
    return {"blank": blank, "shapes": shapes, "dark_rectangle": dark,
            "circle": circle, "frame": frame}


def write_images(destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for name, array in images().items():
        success, data = cv2.imencode(".png", array)
        if not success:
            raise RuntimeError(f"PNG encoding failed: {name}")
        data.tofile(destination / f"{name}.png")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    write_images(parser.parse_args().output)
