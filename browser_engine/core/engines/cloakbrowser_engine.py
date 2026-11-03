"""CloakBrowser backend behind the common engine boundary."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from cloakbrowser import launch_persistent_context_async
from cloakbrowser.human.actionability import ElementNotStableError

from core.browser_policy import CLOAKBROWSER_BROWSER_VERSION
from .base import BaseBrowserEngine, BrowserLaunchSpec, EngineCapabilities


class CloakBrowserEngine(BaseBrowserEngine):
    engine_id = "cloakbrowser"
    capabilities = EngineCapabilities(geoip=True, native_viewport=True, window_synced_viewport=True)

    def build_launch_args(self, spec: BrowserLaunchSpec) -> list[str]:
        options = spec.engine_options
        extension_dir = options.get("extension_dir")
        args = [
            *spec.window_args(),
            f"--force-device-scale-factor={float(options.get('scale_factor', 1.0)):.4f}",
            f"--homepage={options.get('homepage', 'https://www.google.com/')}",
        ]
        if spec.mute_audio:
            args.append("--mute-audio")
        seed = options.get("fingerprint_seed")
        if seed is not None:
            args.extend([
                f"--fingerprint={seed}",
                "--fingerprint-platform=windows",
                "--fingerprint-storage-quota=5000",
            ])
        if extension_dir:
            path = Path(extension_dir)
            if path.exists():
                self._allow_extensions()
                args.extend([f"--disable-extensions-except={path}", f"--load-extension={path}"])
        if spec.proxy:
            server = str(spec.proxy.get("server") or "")
            args.append("--fingerprint-webrtc-ip=auto")
            if server.lower().startswith(("http://", "https://")):
                args.append("--disable-http2")
        return args

    @staticmethod
    def _allow_extensions() -> None:
        try:
            from cloakbrowser import browser as cloak_browser
            ignored = getattr(cloak_browser, "IGNORE_DEFAULT_ARGS", None)
            if isinstance(ignored, list) and "--disable-extensions" not in ignored:
                ignored.append("--disable-extensions")
        except Exception:
            pass

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
        kwargs: dict[str, Any] = {
            "user_data_dir": str(user_data_dir),
            "browser_version": CLOAKBROWSER_BROWSER_VERSION,
            "humanize": True,
            "human_preset": "careful",
            "stealth_args": False,
            "headless": headless,
            "chromium_sandbox": True,
            "proxy": proxy,
            "viewport": viewport,
            "args": args,
        }

        if options and options.get("launcher"):
            launcher = options["launcher"]
        else:
            launcher = launch_persistent_context_async
        if locale:
            kwargs["locale"] = locale
        if timezone:
            kwargs["timezone"] = timezone
        if options and options.get("geoip"):
            kwargs["geoip"] = True
        return await launcher(**kwargs)

    async def post_launch(self, context: Any, options: dict[str, Any] | None = None) -> None:
        options = options or {}
        for script in options.get("init_scripts", []):
            await context.add_init_script(script)
        fallback = options.get("human_fallback") or self._install_native_viewport_human_fallback
        for page in getattr(context, "pages", []) or []:
            fallback(page)
        try:
            context.on("page", fallback)
        except Exception:
            pass

    @staticmethod
    def _install_native_viewport_human_fallback(page: Any) -> None:
        if getattr(page, "_browsermulti_native_viewport_fallback", False):
            return
        originals = getattr(page, "_original", None)
        if originals is None:
            return

        async def invoke(method_name: str, current: Any, *args: Any, **kwargs: Any) -> Any:
            try:
                return await current(*args, **kwargs)
            except Exception as exc:
                if not isinstance(exc, ElementNotStableError) and "Viewport size not available" not in str(exc):
                    raise
                native = getattr(originals, method_name)
                safe_kwargs = {key: value for key, value in kwargs.items() if key != "human_config"}
                return await native(*args, **safe_kwargs)

        for name in ("click", "dblclick", "hover", "fill", "type"):
            current = getattr(page, name)

            async def wrapped(*args: Any, _name=name, _current=current, **kwargs: Any) -> Any:
                return await invoke(_name, _current, *args, **kwargs)

            setattr(page, name, wrapped)
        page._browsermulti_native_viewport_fallback = True

    def version(self) -> str:
        return CLOAKBROWSER_BROWSER_VERSION
