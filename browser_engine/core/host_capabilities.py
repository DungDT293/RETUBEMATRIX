"""Read-only host capability checks used for resource-aware UI hints."""
from __future__ import annotations

import ctypes
import os
from typing import Any

_LOW_MEMORY_BYTES = 4 * 1024 * 1024 * 1024


def _memory_status() -> int | None:
    if os.name != "nt":
        return None

    class MemoryStatusEx(ctypes.Structure):
        _fields_ = [
            ("dwLength", ctypes.c_ulong),
            ("dwMemoryLoad", ctypes.c_ulong),
            ("ullTotalPhys", ctypes.c_ulonglong),
            ("ullAvailPhys", ctypes.c_ulonglong),
            ("ullTotalPageFile", ctypes.c_ulonglong),
            ("ullAvailPageFile", ctypes.c_ulonglong),
            ("ullTotalVirtual", ctypes.c_ulonglong),
            ("ullAvailVirtual", ctypes.c_ulonglong),
            ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
        ]

    try:
        status = MemoryStatusEx()
        status.dwLength = ctypes.sizeof(status)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return None
        return int(status.ullTotalPhys)
    except Exception:
        return None


def _is_low_memory(total: int | None) -> bool:
    return bool(total is not None and total < _LOW_MEMORY_BYTES)


def host_capabilities() -> dict[str, Any]:
    total = _memory_status()
    return {
        "total_physical_memory_bytes": total,
        "low_memory_host": _is_low_memory(total),
    }
