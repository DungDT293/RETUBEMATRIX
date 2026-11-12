"""Opt-in BrowserMulti v155 SDK backend."""
from __future__ import annotations

import logging
import os
from pathlib import Path
import sys
from typing import Any

from playwright.async_api import async_playwright

from .base import BaseBrowserEngine, BrowserEngineUnavailableError, BrowserLaunchSpec, EngineCapabilities

logger = logging.getLogger(__name__)

BASELINE_VERSION = "152.0.7977.65"
CANARY_VERSION = "155.0.8059.12"
DEFAULT_BROWSERMULTI_VERSION = "155.0.8059.12"
BROWSERMULTI_VERSION = DEFAULT_BROWSERMULTI_VERSION
BROWSERMULTI_SDK_VERSIONS = {"152.0.7977.65", "155.0.0", "155.0.8059.12"}
BROWSERMULTI_BUNDLED_DIR = "browsermulti-cache"
BROWSERMULTI_BUNDLED_ENV = "BROWSERMULTI_EXECUTABLE"
BROWSERMULTI_RUNTIME_VERSION_ENV = "BROWSERMULTI_RUNTIME_VERSION"
BROWSERMULTI_REQUIRED_FILES = (
    "chrome.exe",
    "chrome.dll",
    "chrome_elf.dll",
    "resources.pak",
    "icudtl.dat",
    f"{BROWSERMULTI_VERSION}.manifest",
    "locales/en-US.pak",
)

REPO_ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = Path(__file__).resolve().parents[3]

RUNTIME_MAPPINGS: dict[str, tuple[Path, ...]] = {
    DEFAULT_BROWSERMULTI_VERSION: (
        # Đường dẫn cài đặt chuẩn khi phân phối ứng dụng (App Root / Roots)
        APP_ROOT / "roots" / "browsermulti" / DEFAULT_BROWSERMULTI_VERSION / "chrome.exe",
        REPO_ROOT / "roots" / "browsermulti" / DEFAULT_BROWSERMULTI_VERSION / "chrome.exe",
        Path(sys.executable).resolve().parent.parent / "roots" / "browsermulti" / DEFAULT_BROWSERMULTI_VERSION / "chrome.exe",
        Path(sys.executable).resolve().parent / "roots" / "browsermulti" / DEFAULT_BROWSERMULTI_VERSION / "chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "RETubeMatrix" / "roots" / "browsermulti" / DEFAULT_BROWSERMULTI_VERSION / "chrome.exe",
        Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "RETubeMatrix" / "roots" / "browsermulti" / DEFAULT_BROWSERMULTI_VERSION / "chrome.exe",
        # Legacy data dirs kept for migration from earlier builds
        Path(os.environ.get("LOCALAPPDATA", "")) / "reupytb" / "roots" / "browsermulti" / DEFAULT_BROWSERMULTI_VERSION / "chrome.exe",
        Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "reupytb" / "roots" / "browsermulti" / DEFAULT_BROWSERMULTI_VERSION / "chrome.exe",
        # Gói đóng gói runtime
        APP_ROOT / "browsermulti-155.0.8059.12-win64" / "browsermulti-155.0.8059.12-win64" / "chrome.exe",
        REPO_ROOT / "browsermulti-155.0.8059.12-win64" / "browsermulti-155.0.8059.12-win64" / "chrome.exe",
        Path.home() / ".browsermulti" / "bin" / DEFAULT_BROWSERMULTI_VERSION / "chrome.exe",
    ),
    BASELINE_VERSION: (
        REPO_ROOT / "roots" / "browsermulti" / BASELINE_VERSION / "chrome.exe",
        Path.home() / ".browsermulti" / "bin" / BASELINE_VERSION / "chrome.exe",
    ),
}

_DEFAULT_BINARY_CANDIDATES = RUNTIME_MAPPINGS[DEFAULT_BROWSERMULTI_VERSION]
DEFAULT_BINARY_PATH = next(
    (path for path in _DEFAULT_BINARY_CANDIDATES if path.is_file()),
    _DEFAULT_BINARY_CANDIDATES[0],
)


def normalize_runtime_version(version: str | None = None) -> str:
    """Normalize runtime version string into canonical version number."""
    raw = (
        str(version or "").strip()
        or os.environ.get(BROWSERMULTI_RUNTIME_VERSION_ENV, "").strip()
        or os.environ.get("BROWSERMULTI_VERSION", "").strip()
    )
    if not raw:
        return DEFAULT_BROWSERMULTI_VERSION
    raw_lower = raw.lower()
    if raw_lower in {"155", "v155", "canary", "155.0.8059.12", "155.0.0", "default"}:
        return DEFAULT_BROWSERMULTI_VERSION
    if raw_lower in {"152", "v152", "baseline", "control", "152.0.7977.65"}:
        return BASELINE_VERSION
    return raw


def resolve_binary_for_version(runtime_version: str | None = None) -> Path | None:
    """Resolve executable path for a specific runtime version."""
    configured = os.environ.get(BROWSERMULTI_BUNDLED_ENV, "").strip()
    if configured:
        p = Path(configured).expanduser()
        if p.is_file():
            return p
    version = normalize_runtime_version(runtime_version)
    candidates = RUNTIME_MAPPINGS.get(version, ())
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    fallback = REPO_ROOT / "roots" / "browsermulti" / version / "chrome.exe"
    if fallback.is_file():
        return fallback
    return None


def _bundled_runtime_dir(runtime_version: str | None = None) -> Path | None:
    if not getattr(sys, "frozen", False):
        return None
    bundle_dir = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    version = normalize_runtime_version(runtime_version)
    return bundle_dir / BROWSERMULTI_BUNDLED_DIR / version


def _bundled_runtime_missing(runtime_version: str | None = None) -> list[str]:
    runtime_dir = _bundled_runtime_dir(runtime_version)
    if runtime_dir is None:
        return []
    version = normalize_runtime_version(runtime_version)
    required = (
        "chrome.exe",
        "chrome.dll",
        "chrome_elf.dll",
        "resources.pak",
        "icudtl.dat",
        f"{version}.manifest",
        "locales/en-US.pak",
    )
    return [name for name in required if not (runtime_dir / name).is_file()]


def _bundled_binary_path(runtime_version: str | None = None) -> Path | None:
    runtime_dir = _bundled_runtime_dir(runtime_version)
    if runtime_dir is None or _bundled_runtime_missing(runtime_version):
        return None
    return runtime_dir / "chrome.exe"


def _frozen_runtime_error(binary_path: Path | None, runtime_version: str | None = None) -> str:
    runtime_dir = _bundled_runtime_dir(runtime_version)
    missing = _bundled_runtime_missing(runtime_version)
    version = normalize_runtime_version(runtime_version)
    if runtime_dir is None:
        return "BrowserMulti runtime chỉ kiểm tra được trong bản frozen."
    if missing:
        return f"Bản cài đặt thiếu runtime BrowserMulti v{version}: {', '.join(missing)}"
    if binary_path is None or not binary_path.is_file():
        return f"Không tìm thấy BrowserMulti chrome.exe trong {runtime_dir}."
    return ""


def _default_binary_path(runtime_version: str | None = None) -> Path | None:
    bundled = _bundled_binary_path(runtime_version)
    if bundled is not None:
        return bundled
    if getattr(sys, "frozen", False):
        return None
    configured = os.environ.get(BROWSERMULTI_BUNDLED_ENV, "").strip()
    if configured:
        return Path(configured).expanduser()
    if runtime_version is not None:
        resolved = resolve_binary_for_version(runtime_version)
        if resolved is not None:
            return resolved
    return DEFAULT_BINARY_PATH


def _ensure_sdk_binary() -> Path:
    try:
        from browsermulti import ensure_binary
        return Path(ensure_binary()).expanduser().resolve()
    except Exception as exc:
        raise BrowserEngineUnavailableError(
            f"Không tải được binary BrowserMulti v{BROWSERMULTI_VERSION} từ SDK. "
            "Kiểm tra mạng hoặc đặt BROWSERMULTI_EXECUTABLE tới chrome.exe đã ký."
        ) from exc


class BrowserMultiEngine(BaseBrowserEngine):
    engine_id = "browsermulti"
    capabilities = EngineCapabilities(
        smooth_input=True,
        native_viewport=True,
        window_synced_viewport=False,
    )

    def __init__(
        self,
        binary_path: str | Path | None = None,
        runtime_version: str | None = None,
    ):
        self.runtime_version = normalize_runtime_version(runtime_version)
        configured = os.environ.get(BROWSERMULTI_BUNDLED_ENV, "").strip()
        self._explicit_binary_path = binary_path is not None or bool(configured)
        if binary_path is not None:
            self.binary_path = Path(binary_path).expanduser()
        elif configured:
            self.binary_path = Path(configured).expanduser()
        else:
            try:
                self.binary_path = _default_binary_path(self.runtime_version)
            except TypeError:
                self.binary_path = _default_binary_path()
        self._launcher: Any = None

    def build_launch_args(self, spec: BrowserLaunchSpec) -> list[str]:
        options = spec.engine_options
        args = [
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-session-crashed-bubble",
            "--webrtc-ip-handling-policy=disable_non_proxied_udp",
            "--disable-quic",
            "--lang=vi-VN",
            "--homepage=https://www.google.com",
            "--disable-component-update",
        ]
        from core.host_capabilities import host_capabilities
        if host_capabilities().get("low_memory_host"):
            args.extend([
                "--renderer-process-limit=2",
                "--disable-background-networking",
                "--disable-dev-shm-usage",
                "--js-flags=--max-old-space-size=256 --expose-gc",
            ])
        if spec.proxy:
            server_str = (spec.proxy.get("server") or "") if isinstance(spec.proxy, dict) else str(spec.proxy)
            if not server_str.startswith("socks") and "127.0.0.1" not in server_str:
                args.append("--disable-http2")
            args.append("--dns-over-https-mode=off")
        if not options.get("restore_profile_window_placement"):
            args.extend(spec.window_args())
        elif options.get("start_maximized"):
            args.append("--start-maximized")
        args.extend([
            "--force-device-scale-factor=1.0000",
        ])
        benchmark_flags = options.get("benchmark_launch_flags") or []
        allowed_benchmark_flags = {"--enable-logging=file", "--enable-logging=stderr", "--v=1"}
        for flag in benchmark_flags:
            if flag in allowed_benchmark_flags and flag not in args:
                args.append(flag)
        log_file = options.get("benchmark_log_file")
        if log_file:
            args.append(f"--log-file={os.path.abspath(str(log_file))}")
        if spec.mute_audio:
            args.append("--mute-audio")
        return args

    def _load_launcher(self):
        if self._launcher is not None:
            return self._launcher
        try:
            from browsermulti import launch_persistent_context
            from browsermulti import __version__ as sdk_version
            if sdk_version not in BROWSERMULTI_SDK_VERSIONS:
                expected = ", ".join(sorted(BROWSERMULTI_SDK_VERSIONS))
                raise BrowserEngineUnavailableError(
                    f"BrowserMulti SDK version mismatch: expected one of {expected}, got {sdk_version}."
                )
        except BrowserEngineUnavailableError:
            raise
        except Exception as exc:
            logger.warning(
                f"Không tải được SDK browsermulti v{self.runtime_version} ({exc}). "
                "Tự động fallback sang Playwright Chromium engine."
            )
            self._launcher = self._launch_with_playwright
            return self._launcher
        if getattr(sys, "frozen", False):
            missing = _bundled_runtime_missing(self.runtime_version)
            if missing:
                logger.warning(
                    f"Bản cài đặt thiếu runtime BrowserMulti v{self.runtime_version}: {', '.join(missing)}. "
                    "Tự động fallback sang Playwright Chromium engine."
                )
                self._launcher = self._launch_with_playwright
                return self._launcher
        if self.binary_path is None or not self.binary_path.is_file():
            logger.warning(
                f"BrowserMulti custom binary không tìm thấy tại '{self.binary_path}'. "
                "Tự động fallback sang Playwright Chromium engine."
            )
            self._launcher = self._launch_with_playwright
            return self._launcher
        self._launcher = launch_persistent_context
        return self._launcher

    async def _launch_with_playwright(self, **kwargs: Any) -> Any:
        """Launch direct Playwright; SDK wrapper applies a fixed viewport default."""
        playwright = await async_playwright().start()
        try:
            context = await playwright.chromium.launch_persistent_context(**kwargs)
        except Exception:
            await playwright.stop()
            raise
        original_close = context.close
        closed = False

        async def close() -> None:
            nonlocal closed
            if closed:
                return
            closed = True
            try:
                await original_close()
            finally:
                await playwright.stop()

        context.close = close
        return context

    async def post_launch(self, context: Any, options: dict[str, Any] | None = None) -> None:
        """Attach native BrowserMulti SDK input behavior without viewport emulation."""
        try:
            from browsermulti import SmoothInputController
        except Exception:
            try:
                from browsermulti.input_helper import SmoothInputController
            except Exception:
                return

        def attach(page: Any) -> None:
            try:
                page.input_controller = SmoothInputController(page)
            except Exception:
                pass

        for page in getattr(context, "pages", []) or []:
            attach(page)
        try:
            context.on("page", attach)
        except Exception:
            pass

    @staticmethod
    def _native_launch_kwargs(
        *,
        user_data_dir: Path,
        headless: bool,
        proxy: dict[str, str] | None,
        locale: str | None,
        timezone: str | None,
        args: list[str],
    ) -> dict[str, Any]:
        return {
            "user_data_dir": str(user_data_dir),
            "executable_path": None,
            "headless": headless,
            "chromium_sandbox": True,
            "proxy": proxy,
            "args": list(args),
            "ignore_default_args": ["--enable-automation", "--no-sandbox"],
            "viewport": None,
            "no_viewport": True,
            "locale": locale or "en-US",
            "timezone_id": timezone,
        }

    def launch_kwargs(
        self,
        *,
        user_data_dir: Path,
        headless: bool,
        proxy: dict[str, str] | None,
        locale: str | None,
        timezone: str | None,
        args: list[str],
    ) -> dict[str, Any]:
        kwargs = self._native_launch_kwargs(
            user_data_dir=user_data_dir,
            headless=headless,
            proxy=proxy,
            locale=locale,
            timezone=timezone,
            args=args,
        )
        if self.binary_path and self.binary_path.is_file():
            kwargs["executable_path"] = str(self.binary_path)
        if getattr(sys, "frozen", False):
            runtime_error = _frozen_runtime_error(self.binary_path, self.runtime_version)
            if runtime_error:
                raise BrowserEngineUnavailableError(runtime_error)
            required_dlls = ["chrome.dll", "chrome_elf.dll", "resources.pak", "icudtl.dat"]
            runtime_dir = _bundled_runtime_dir(self.runtime_version)
            if runtime_dir is not None and any(not (runtime_dir / name).is_file() for name in required_dlls):
                raise BrowserEngineUnavailableError(f"BrowserMulti runtime không đủ DLL trong {runtime_dir}.")
        return kwargs

    @staticmethod
    def _assert_native_viewport(kwargs: dict[str, Any]) -> None:
        if kwargs.get("viewport") is not None or kwargs.get("no_viewport") is not True:
            raise BrowserEngineUnavailableError("BrowserMulti phải khởi động bằng native viewport.")

    async def launch_persistent_context(
        self,
        *,
        user_data_dir: Path,
        headless: bool,
        proxy: dict[str, str] | None,
        locale: str | None,
        timezone: str | None,
        args: list[str],
        viewport: dict[str, int] | None,
        options: dict[str, Any] | None = None,
    ) -> Any:
        self._load_launcher()
        if viewport is not None:
            raise BrowserEngineUnavailableError("BrowserMulti không hỗ trợ viewport emulation.")
        kwargs = self.launch_kwargs(
            user_data_dir=user_data_dir,
            headless=headless,
            proxy=proxy,
            locale=locale,
            timezone=timezone,
            args=args,
        )
        self._assert_native_viewport(kwargs)
        return await self._launch_with_playwright(**kwargs)

    def viewport_mode(self) -> str:
        return "native-window"

    @staticmethod
    def classify_page_failure(error_text: str) -> str:
        text = str(error_text or "").upper()
        if "STATUS_BREAKPOINT" in text:
            return "renderer_crash"
        if "TIMEOUT" in text or "NAVIGATION" in text:
            return "navigation_failure"
        return "unknown_failure"

    def launch_native(
        self,
        *,
        user_data_dir: Path,
        spec: BrowserLaunchSpec,
        target_url: str = "https://www.google.com/",
        on_exit: Any = None,
        proxy_args: list[str] | None = None,
    ) -> Any:
        from .browsermulti_native import launch_native

        return launch_native(
            self.binary_path,
            user_data_dir,
            self.build_launch_args(spec),
            target_url=target_url,
            on_exit=on_exit,
            proxy_args=proxy_args,
        )

    def version(self) -> str:
        return self.runtime_version if self.binary_path else "browsermulti-auto"
