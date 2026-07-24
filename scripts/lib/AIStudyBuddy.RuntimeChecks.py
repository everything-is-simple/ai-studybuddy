#!/usr/bin/env python3
"""Stable runtime checks invoked by Windows deployment PowerShell scripts."""
from __future__ import annotations

import json
import struct
import sys
from typing import Any


def emit(ok: bool, check: str, **details: Any) -> None:
    payload = {"ok": ok, "check": check, **details}
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def main() -> int:
    if len(sys.argv) != 2:
        emit(False, "invalid", error="A single runtime check name is required.")
        return 64

    check = sys.argv[1]
    if check == "python-info":
        version = sys.version_info
        emit(
            True,
            check,
            version=f"{version.major}.{version.minor}.{version.micro}",
            major=version.major,
            minor=version.minor,
            patch=version.micro,
            bits=struct.calcsize("P") * 8,
        )
        return 0

    if check == "ocr-import":
        try:
            import rapidocr_onnxruntime  # noqa: F401
        except Exception as exc:  # pragma: no cover - depends on target runtime
            emit(False, check, error=f"{type(exc).__name__}: {exc}")
            return 1
        emit(True, check)
        return 0

    emit(False, check, error="Unsupported runtime check.")
    return 64


if __name__ == "__main__":
    raise SystemExit(main())
