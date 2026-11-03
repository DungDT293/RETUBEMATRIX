"""Stable browser-engine boundary for BrowserMulti sessions."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class BrowserLaunchSpec:
    user_data_dir: Path
    headless: bool
    proxy: dict[str, str] | None
    locale: str | None
    timezone: str | None
    window_width: int
    window_height: int
    window_x: int
    window_y: int
    mute_audio: bool
    viewport: dict[str, int] | None
    engine_options: dict[str, Any] = field(default_factory=dict)

    def window_args(self) -> list[str]:
        return [
            f"--window-size={self.window_width},{self.window_height}",
            f"--window-position={self.window_x},{self.window_y}",
        ]


@dataclass(frozen=True)
class EngineCapabilities:
    persistent_context: bool = True
    proxy: bool = True
    extensions: bool = True
    smooth_input: bool = False
    native_viewport: bool = False
    window_synced_viewport: bool = False
    geoip: bool = False


class BrowserEngineUnavailableError(RuntimeError):
    """Engine cannot launch safely on this machine."""


class BaseBrowserEngine(ABC):
    engine_id: str
    capabilities: EngineCapabilities

    @abstractmethod
    def build_launch_args(self, spec: BrowserLaunchSpec) -> list[str]:
        """Return only this engine's allowlisted Chromium arguments."""

    @abstractmethod
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
        """Launch and return a Playwright-compatible persistent context."""

    async def post_launch(self, context: Any, options: dict[str, Any] | None = None) -> None:
        """Configure only this engine's context/page behavior after launch."""

        return None

    @abstractmethod
    def version(self) -> str:
        """Return safe engine version text for diagnostics."""
