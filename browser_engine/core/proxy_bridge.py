"""Loopback HTTP proxy bridge for authenticated SOCKS5 upstreams."""
from __future__ import annotations

import asyncio
import contextlib
import logging
import socket
import time
from urllib.parse import unquote, urlsplit, urlunsplit

import socks  # type: ignore[import-not-found]

logger = logging.getLogger(__name__)


class ProxyBridgeError(RuntimeError):
    """The local SOCKS5-to-HTTP bridge cannot start or connect."""


class Socks5HttpBridge:
    def __init__(self, upstream_url: str):
        parts = urlsplit(str(upstream_url or "").strip())
        if parts.scheme.lower() != "socks5" or not parts.hostname or not parts.port:
            raise ProxyBridgeError("Proxy SOCKS5 không hợp lệ cho bridge cục bộ.")
        self._host = parts.hostname
        self._port = int(parts.port)
        self._username = unquote(parts.username or "")
        self._password = unquote(parts.password or "")
        self._server: asyncio.AbstractServer | None = None
        self._writers: set[asyncio.StreamWriter] = set()

    @property
    def server_url(self) -> str:
        if self._server is None or not self._server.sockets:
            raise ProxyBridgeError("Proxy bridge chưa khởi động.")
        port = self._server.sockets[0].getsockname()[1]
        return f"http://127.0.0.1:{port}"

    async def start(self) -> str:
        self._server = await asyncio.start_server(self._handle_client, "127.0.0.1", 0)
        logger.info("Started loopback SOCKS5 proxy bridge | upstream=%s:%d | local=%s", self._host, self._port, self.server_url)
        return self.server_url

    async def close(self) -> None:
        server = self._server
        self._server = None
        try:
            if server is not None:
                server.close()
                await server.wait_closed()
            for writer in list(self._writers):
                try:
                    writer.close()
                    await writer.wait_closed()
                except (asyncio.CancelledError, GeneratorExit):
                    pass
                except (ConnectionError, OSError):
                    pass
        except (asyncio.CancelledError, GeneratorExit):
            pass
        finally:
            self._writers.clear()
        logger.info("Stopped loopback SOCKS5 proxy bridge | upstream=%s:%d", self._host, self._port)

    def _connect_upstream(self, target_host: str, target_port: int) -> socket.socket:
        sock = socks.socksocket(socket.AF_INET6 if ":" in target_host else socket.AF_INET, socket.SOCK_STREAM)
        sock.set_proxy(
            socks.SOCKS5,
            self._host,
            self._port,
            rdns=True,
            username=self._username or None,
            password=self._password or None,
        )
        sock.settimeout(10)
        started = time.monotonic()
        try:
            sock.connect((target_host, target_port))
            elapsed_ms = (time.monotonic() - started) * 1000
            logger.info(
                "SOCKS5 bridge upstream connect succeeded | target=%s:%d | elapsed_ms=%.1f",
                target_host,
                target_port,
                elapsed_ms,
            )
            sock.setblocking(False)
            return sock
        except Exception as exc:
            elapsed_ms = (time.monotonic() - started) * 1000
            logger.warning(
                "SOCKS5 bridge upstream connect failed | target=%s:%d | elapsed_ms=%.1f | error_type=%s",
                target_host,
                target_port,
                elapsed_ms,
                type(exc).__name__,
            )
            sock.close()
            raise

    @staticmethod
    def _target(request_line: str) -> tuple[str, int, str, bool]:
        parts = request_line.split(" ", 2)
        if len(parts) < 2:
            raise ProxyBridgeError("Proxy request không hợp lệ.")
        method, target = parts[0].upper(), parts[1]
        if method == "CONNECT":
            host, separator, port_text = target.rpartition(":")
            if not separator or not host or not port_text.isdigit():
                raise ProxyBridgeError("CONNECT target không hợp lệ.")
            return host.strip("[]"), int(port_text), target, True
        parsed = urlsplit(target)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
            raise ProxyBridgeError("HTTP proxy target không hợp lệ.")
        port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
        path = urlunsplit(("", "", parsed.path or "/", parsed.query, ""))
        return parsed.hostname, port, path, False

    async def _relay(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter, upstream: socket.socket) -> None:
        loop = asyncio.get_running_loop()

        async def client_to_upstream() -> None:
            while True:
                data = await reader.read(64 * 1024)
                if not data:
                    return
                await loop.sock_sendall(upstream, data)

        async def upstream_to_client() -> None:
            while True:
                data = await loop.sock_recv(upstream, 64 * 1024)
                if not data:
                    return
                writer.write(data)
                await writer.drain()

        tasks = [asyncio.create_task(client_to_upstream()), asyncio.create_task(upstream_to_client())]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:
            try:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
            except (asyncio.CancelledError, GeneratorExit):
                pass

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        self._writers.add(writer)
        upstream: socket.socket | None = None
        try:
            header = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=10)
            request_line = header.split(b"\r\n", 1)[0].decode("latin-1", "replace")
            target_host, target_port, target_path, is_connect = self._target(request_line)
            upstream = await asyncio.to_thread(self._connect_upstream, target_host, target_port)
            if is_connect:
                writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                await writer.drain()
            else:
                lines = header.decode("latin-1", "replace").split("\r\n")
                lines[0] = f"{request_line.split(' ', 1)[0]} {target_path} HTTP/1.1"
                filtered = [line for line in lines[1:] if line.lower() != "proxy-connection: keep-alive"]
                rewritten = ("\r\n".join([lines[0], *filtered])).encode("latin-1", "replace")
                await asyncio.get_running_loop().sock_sendall(upstream, rewritten)
            await self._relay(reader, writer, upstream)
        except (asyncio.IncompleteReadError, asyncio.TimeoutError, ConnectionError, OSError, ProxyBridgeError) as exc:
            logger.debug("SOCKS5 proxy bridge connection ended: %s", exc)
        except (asyncio.CancelledError, GeneratorExit):
            pass
        finally:
            try:
                if upstream is not None:
                    upstream.close()
                self._writers.discard(writer)
                writer.close()
                await writer.wait_closed()
            except (asyncio.CancelledError, GeneratorExit):
                pass
            except Exception:
                logger.debug("SOCKS5 proxy bridge client cleanup failed", exc_info=True)
