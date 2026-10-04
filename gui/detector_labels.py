from __future__ import annotations

# Names deliberately carry no product or machine identity.
DETECTOR_ZH = {f"demo{number}": f"demo{number}" for number in range(1, 13)}


def detector_zh_name(detector_id: str) -> str:
    return DETECTOR_ZH.get(str(detector_id), "")
