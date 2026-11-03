"""CloakBrowser binary and fingerprint launch policy."""
from __future__ import annotations

import importlib
import os
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

CLOAKBROWSER_PACKAGE_VERSION = "0.4.12"
CLOAKBROWSER_BROWSER_VERSION = "146.0.7680.177.5"
BUNDLED_CLOAKBROWSER_CACHE_DIR = "cloakbrowser-cache"

_BROWSER_VERSION_RE = re.compile(r"^\d+\.\d+\.\d+\.\d+\.\d+$")
_LOCALE_RE = re.compile(r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")
_DEFAULT_LOCALE_LABELS = {"", "auto", "default", "theo proxy", "theo seed"}
_DEFAULT_TIMEZONE_LABELS = {"", "auto", "default", "theo proxy", "theo seed"}


def validate_browser_version(value: str) -> str:
    version = str(value or "").strip()
    if not _BROWSER_VERSION_RE.fullmatch(version):
        raise ValueError(f"Unsupported CloakBrowser Chromium version: {version!r}")
    return version


def normalize_profile_locale(value: object) -> str | None:
    """Use first valid BCP-47 tag; metadata labels never reach Chromium."""
    raw = str(value or "").strip()
    if raw.casefold() in _DEFAULT_LOCALE_LABELS:
        return None
    for candidate in re.split(r"[,;|\s]+", raw):
        if _LOCALE_RE.fullmatch(candidate):
            return candidate
    return None


def normalize_profile_timezone(value: object) -> str | None:
    """Accept only an IANA timezone; invalid UI metadata falls back to GeoIP/local."""
    raw = str(value or "").strip()
    if raw.casefold() in _DEFAULT_TIMEZONE_LABELS:
        return None
    try:
        ZoneInfo(raw)
    except Exception:
        return None
    return raw


def configure_bundled_cache() -> Path | None:
    """Point CloakBrowser at its frozen, exact-version cache when packaged."""
    if not getattr(sys, "frozen", False):
        return None
    bundle_dir = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    cache_dir = bundle_dir / BUNDLED_CLOAKBROWSER_CACHE_DIR
    if not cache_dir.is_dir():
        raise RuntimeError("Bundled CloakBrowser Chromium cache is missing")
    os.environ["CLOAKBROWSER_CACHE_DIR"] = str(cache_dir)
    return cache_dir




def cloakbrowser_binary_dir() -> Path:
    """Return exact-version cache folder; packaging must fail if it is absent."""
    download = importlib.import_module("cloakbrowser.download")
    get_binary_dir = getattr(download, "get_binary_dir", None)
    if not callable(get_binary_dir):
        raise RuntimeError("CloakBrowser 0.4.12 does not expose get_binary_dir")
    return Path(get_binary_dir(CLOAKBROWSER_BROWSER_VERSION))


def collect_cloakbrowser_binary() -> list[tuple[str, str]]:
    """Collect exact free Windows Chromium cache instead of Playwright Chromium."""
    binary_dir = cloakbrowser_binary_dir()
    if not binary_dir.is_dir():
        raise RuntimeError(
            f"Missing CloakBrowser Chromium {CLOAKBROWSER_BROWSER_VERSION}: "
            "run ensure_binary(browser_version=...) before PyInstaller"
        )
    return [(str(binary_dir), f"{BUNDLED_CLOAKBROWSER_CACHE_DIR}/{binary_dir.name}")]
