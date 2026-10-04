"""Shared environment-variable name resolution.

Operator-facing configuration uses the ``TILESCOPE_*`` prefix. The historical ``VISIONFLOW_*``
names remain accepted as a fallback so existing camera-machine setups keep working. New code should
call :func:`env_value` with the bare suffix (for example ``env_value("SAPERA_DLL")``) instead of
reading one specific name directly.
"""

from __future__ import annotations

import os
from collections.abc import Mapping

_NEW_PREFIX = "TILESCOPE_"
_LEGACY_PREFIX = "VISIONFLOW_"


def env_value(name: str, environ: Mapping[str, str] | None = None) -> str | None:
    """Return ``TILESCOPE_<name>`` if set, else the legacy ``VISIONFLOW_<name>``, else ``None``.

    An empty string counts as unset so a blank override cannot mask a legacy value.
    """
    mapping = os.environ if environ is None else environ
    for prefix in (_NEW_PREFIX, _LEGACY_PREFIX):
        value = mapping.get(f"{prefix}{name}")
        if value:
            return str(value)
    return None
