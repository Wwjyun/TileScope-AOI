"""Fail closed when publication has unresolved ownership or source reviews."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def require_public_distribution(root: Path) -> dict:
    path = root / "distribution-policy.json"
    policy = json.loads(path.read_text(encoding="utf-8"))
    if (policy.get("schema_version") != 1
            or policy.get("public_distribution_allowed") is not True
            or policy.get("pending_reviews") != []
            or not str(policy.get("review_record", "")).strip()):
        raise RuntimeError("Public distribution is disabled: ownership and source review is pending.")
    return policy


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        require_public_distribution(args.root)
    except (OSError, ValueError, RuntimeError) as exc:
        parser.exit(1, f"{exc}\n")
    print("Public distribution review recorded.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
