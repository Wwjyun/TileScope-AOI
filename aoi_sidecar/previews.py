"""CPU image and tile previews; pixels are written as PNG files, never sent in JSON."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import cv2

from core.image_loader import ImageLoader
from core.tiler import create_tiler

MAX_PREVIEW_SIDE = 2200


def cache_dir() -> Path:
    env = os.environ.get("AOI_SIDECAR_CACHE_DIR")
    if env:
        return Path(env)
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("TEMP") or os.path.expanduser("~")
    return Path(base) / "VisionFlowAOI" / "cache" / "previews"


def _file_key(path: Path) -> str:
    stat = path.stat()
    raw = f"{path.resolve()}|{stat.st_mtime_ns}|{stat.st_size}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:24]


def _write_png(directory: Path, name: str, image) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name
    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise OSError("OpenCV 無法編碼 PNG")
    path.write_bytes(encoded.tobytes())
    return path


def image_preview(image_path: str | Path, max_side: int = 2048) -> dict:
    """Decode on CPU, INTER_AREA-downscale if larger, cache the PNG keyed by path+mtime+size."""
    image_path = Path(image_path)
    key = _file_key(image_path)
    directory = cache_dir()
    png_path = directory / f"{key}.png"
    meta_path = directory / f"{key}.json"
    if png_path.is_file() and meta_path.is_file():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            return {
                "path": str(png_path),
                "width": int(meta["width"]),
                "height": int(meta["height"]),
                "scale": float(meta["scale"]),
            }
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
            pass  # stale/partial cache entry; regenerate below

    image = ImageLoader().load_bgr(image_path)
    height, width = image.shape[:2]
    longest = max(width, height)
    scale = 1.0
    if longest > max_side:
        scale = max_side / float(longest)
        new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
        image = cv2.resize(image, new_size, interpolation=cv2.INTER_AREA)
    _write_png(directory, png_path.name, image)
    meta_path.write_text(
        json.dumps({"width": int(image.shape[1]), "height": int(image.shape[0]), "scale": scale}),
        encoding="utf-8",
    )
    return {
        "path": str(png_path),
        "width": int(image.shape[1]),
        "height": int(image.shape[0]),
        "scale": scale,
    }


def preview_tiles(image_path: str | Path, tile_config: dict) -> dict:
    """Create tiles with ``core.tiler.create_tiler`` and render them onto a cached preview PNG."""
    image_path = Path(image_path)
    image = ImageLoader().load_bgr(image_path)
    tiler = create_tiler(tile_config)
    tiles = list(tiler.iter_tiles(image))
    image_height, image_width = image.shape[:2]
    preview = _resize_preview(image)
    scale_x = preview.shape[1] / image_width
    scale_y = preview.shape[0] / image_height
    preview = _draw_tiles(preview, tiles, scale_x, scale_y)

    config_blob = json.dumps(tile_config, sort_keys=True, default=str).encode("utf-8")
    key = hashlib.sha256(_file_key(image_path).encode("utf-8") + config_blob).hexdigest()[:24]
    png_path = _write_png(cache_dir(), f"tiles_{key}.png", preview)

    tiles_payload = [
        {"id": tile.tile_id, "x": int(tile.x), "y": int(tile.y), "w": int(tile.width), "h": int(tile.height)}
        for tile in tiles[:2000]
    ]
    return {"count": len(tiles), "preview_path": str(png_path), "tiles": tiles_payload}


def _resize_preview(preview):
    height, width = preview.shape[:2]
    longest = max(width, height)
    if longest <= MAX_PREVIEW_SIDE:
        return preview
    scale = MAX_PREVIEW_SIDE / float(longest)
    target = (max(1, int(width * scale)), max(1, int(height * scale)))
    return cv2.resize(preview, target, interpolation=cv2.INTER_AREA)


def _draw_tiles(image, tiles, scale_x: float, scale_y: float):
    preview = image.copy()
    scale = min(scale_x, scale_y)
    line_width = max(1, int(round(4 * scale)))
    colors = {
        "rectangle": (0, 180, 0),
        "circle": (255, 120, 0),
        "polygon": (180, 0, 180),
        "grid": (80, 220, 80),
        "pattern_match": (0, 180, 255),
        "unknown": (0, 0, 255),
    }
    for tile in tiles:
        metadata = tile.metadata or {}
        shape = metadata.get("shape", metadata.get("mode", "unknown"))
        color = colors.get(shape, colors["unknown"])
        x1 = int(round(tile.x * scale_x))
        y1 = int(round(tile.y * scale_y))
        x2 = int(round((tile.x + tile.width) * scale_x))
        y2 = int(round((tile.y + tile.height) * scale_y))
        cv2.rectangle(preview, (x1, y1), (x2, y2), color, line_width)
    return preview
