"""Export one committed source tree into a private repository with no parent history."""
from __future__ import annotations

import argparse
import io
import json
import subprocess
import tarfile
from pathlib import Path, PurePosixPath

try:
    from tools.distribution_policy import require_public_distribution
except ModuleNotFoundError:
    from distribution_policy import require_public_distribution

EXCLUDED = (".claude/", "codex-skills/", "weekly_reports/", "docs/reports/",
            "docs/release-notes/", "design_handoff_aoi_gui/")
EXCLUDED_FILES = {".mcp.json", "CLAUDE.md", "HERMES.md", "ARTIFACTS.md"}


def export_snapshot(root: Path, destination: Path, *, private_review: bool = False) -> str:
    root, destination = root.resolve(), destination.resolve()
    if destination == root or root in destination.parents:
        raise ValueError("Snapshot must be outside the source repository.")
    if not private_review:
        require_public_distribution(root)
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("Snapshot destination must be empty; existing files are never replaced.")
    status = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=root)
    if status.strip():
        raise RuntimeError("Commit the reviewed source tree before creating its snapshot.")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root).decode().strip()
    archive = subprocess.check_output(["git", "archive", "--format=tar", "HEAD"], cwd=root)
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(archive)) as stream:
        for entry in stream.getmembers():
            name = PurePosixPath(entry.name)
            if name.is_absolute() or ".." in name.parts or ".git" in name.parts:
                raise ValueError("Unsafe snapshot path.")
            if entry.name in EXCLUDED_FILES or entry.name.startswith(EXCLUDED):
                continue
            target = destination.joinpath(*name.parts)
            if entry.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif entry.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(stream.extractfile(entry).read())
            else:
                raise ValueError("Symlinks and special files are not supported in a review snapshot.")
    (destination / "snapshot-record.json").write_text(json.dumps({
        "schema_version": 1, "source_tree_commit": commit,
        "purpose": "private-review" if private_review else "reviewed-distribution",
        "history_included": False, "remote_configured": False,
        "ownership_cleared": not private_review,
    }, indent=2), encoding="utf-8")
    subprocess.run(["git", "init", "-b", "main", str(destination)], check=True, capture_output=True)
    subprocess.run(["git", "add", "--all"], cwd=destination, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "Create synthetic demo review baseline"],
                   cwd=destination, check=True, capture_output=True)
    count = subprocess.check_output(["git", "rev-list", "--count", "HEAD"], cwd=destination).strip()
    assert count == b"1"
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=destination).decode().strip()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--private-review", action="store_true")
    args = parser.parse_args()
    print(export_snapshot(args.root, args.output, private_review=args.private_review))
