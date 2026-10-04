"""Sidecar entry point: ``python -m aoi_sidecar``."""

from __future__ import annotations

import logging
import os
import sys


def main(argv=None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--smoke-test" in args:
        from aoi_sidecar.smoke_test import run_smoke_test

        return run_smoke_test()

    try:
        from core.logging_system import configure_logging

        configure_logging(level=os.environ.get("AOI_LOG_LEVEL"))
    except Exception:  # noqa: BLE001 - logging must never block sidecar startup
        logging.basicConfig(stream=sys.stderr, level=logging.INFO)

    from aoi_sidecar.protocol import Protocol
    from aoi_sidecar.service import SidecarService

    writer = Protocol.capture_stdout()
    protocol = Protocol(writer=writer)
    service = SidecarService(emit=protocol.emit_event)
    return protocol.run(service)


if __name__ == "__main__":
    raise SystemExit(main())
