import asyncio
import json
import logging
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from core.paths import app_path


logger = logging.getLogger(__name__)


def _free_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class SidecarClient:
    def __init__(self):
        self.host = "127.0.0.1"
        self.port = _free_local_port()
        self.token = secrets.token_urlsafe(32)
        self.process: subprocess.Popen | None = None

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def start(self, timeout: float = 12.0) -> bool:
        if self.process and self.process.poll() is None:
            return True

        cmd = self._command()
        log_path = app_path("logs", "sidecar-subprocess.log")
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_file = open(log_path, "a", encoding="utf-8")
        startupinfo = None
        creationflags = 0
        if sys.platform == "win32":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW

        # Keep subprocess diagnostics in log file; never inherit a console on Windows.

        logger.info("Starting sidecar subprocess on %s", self.base_url)
        self.process = subprocess.Popen(
            cmd,
            cwd=str(app_path()),
            stdout=log_file,
            stderr=log_file,
            stdin=subprocess.DEVNULL,
            startupinfo=startupinfo,
            creationflags=creationflags,
        )

        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.process.poll() is not None:
                logger.error("Sidecar exited early with code %s", self.process.returncode)
                return False
            try:
                self.health()
                logger.info("Sidecar is ready: %s", self.base_url)
                return True
            except Exception:
                time.sleep(0.25)
        logger.error("Sidecar did not become ready within %.1fs", timeout)
        return False

    def stop(self, timeout: float = 5.0) -> None:
        proc = self.process
        if not proc:
            return
        if proc.poll() is None:
            try:
                self._request("POST", "/shutdown")
            except Exception as exc:
                logger.debug("Sidecar graceful shutdown failed: %s", exc)
            try:
                proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                logger.warning("Sidecar did not stop gracefully; terminating")
                proc.terminate()
                try:
                    proc.wait(timeout=2.0)
                except subprocess.TimeoutExpired:
                    proc.kill()
        self.process = None

    def health(self) -> dict:
        return self._request("GET", "/health")

    def open_profile(self, profile_id: str, row_data: dict) -> dict:
        return self._request("POST", f"/profiles/{profile_id}/open", {"row_data": row_data})

    def stop_profile(self, profile_id: str) -> dict:
        return self._request("POST", f"/profiles/{profile_id}/stop")

    def run_profile(self, profile_id: str, row_data: dict, stagger_delay: float = 0.0) -> dict:
        return self._request("POST", f"/profiles/{profile_id}/run", {"row_data": row_data, "stagger_delay": stagger_delay})

    def profile_status(self, profile_id: str) -> dict:
        return self._request("GET", f"/profiles/{profile_id}/status")

    async def async_run_profile(self, profile_id: str, row_data: dict, stagger_delay: float = 0.0) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.run_profile, profile_id, row_data, stagger_delay)

    async def wait_for_run_complete(self, profile_id: str, poll_interval: float = 2.0) -> str:
        """Poll /profiles/{id}/status until run is done. Returns final status string."""
        while True:
            try:
                data = await asyncio.get_event_loop().run_in_executor(None, self.profile_status, profile_id)
                if not data.get("running", True) and data.get("status") not in ("running", "unknown"):
                    return data.get("status", "unknown")
            except Exception:
                return "failed"
            await asyncio.sleep(poll_interval)

    async def async_open_profile(self, profile_id: str, row_data: dict) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.open_profile, profile_id, row_data)

    async def async_stop_profile(self, profile_id: str) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.stop_profile, profile_id)

    async def async_health(self) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.health)

    async def wait_for_profile_close(self, profile_id: str, poll_interval: float = 2.0) -> None:
        """Poll /health until profile_id is no longer in running_profiles."""
        while True:
            try:
                data = await self.async_health()
                if profile_id not in data.get("running_profiles", []):
                    return
            except Exception:
                return  # sidecar gone — treat as closed
            await asyncio.sleep(poll_interval)

    def poll_logs(self, since: int = 0) -> dict:
        return self._request("GET", f"/logs/recent?since={since}")

    async def async_poll_logs(self, since: int = 0) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.poll_logs, since)

    def is_running(self) -> bool:
        return bool(self.process and self.process.poll() is None)

    def _command(self) -> list[str]:
        args = [
            "--sidecar",
            "--host",
            self.host,
            "--port",
            str(self.port),
            "--token",
            self.token,
        ]
        if getattr(sys, "frozen", False):
            return [sys.executable, *args]
        return [sys.executable, str(app_path("ui_main.py")), *args]

    def _request(self, method: str, path: str, body: dict | None = None) -> dict:
        data = None
        headers = {"X-BrowserMulti-Token": self.token}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=3) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Sidecar HTTP {exc.code}: {detail}") from exc


sidecar_client = SidecarClient()
