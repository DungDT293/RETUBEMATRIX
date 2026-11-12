"""Loopback HTTP proxy bridge for authenticated SOCKS5 and HTTP/HTTPS upstreams."""
from __future__ import annotations

import asyncio
import base64
import contextlib
import logging
import socket
import ssl
import time
from urllib.parse import unquote, urlsplit, urlunsplit

import socks  # type: ignore[import-not-found]

logger = logging.getLogger(__name__)


class ProxyBridgeError(RuntimeError):
    """The local proxy bridge cannot start or connect."""


class AuthenticatedProxyBridge:
    def __init__(self, upstream_url: str):
        parts = urlsplit(str(upstream_url or "").strip())
        scheme = parts.scheme.lower()
        if scheme not in {"socks5", "socks5h", "http", "https"} or not parts.hostname or not parts.port:
            raise ProxyBridgeError(f"Proxy upstream không hợp lệ cho bridge cục bộ: {upstream_url}")
        self._scheme = "socks5" if "socks" in scheme else ("https" if scheme == "https" else "http")
        self._is_ssl = self._scheme == "https"
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
        logger.info(
            "Started loopback proxy bridge | scheme=%s | upstream=%s:%d | local=%s",
            self._scheme,
            self._host,
            self._port,
            self.server_url,
        )
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
        logger.info("Stopped loopback proxy bridge | scheme=%s | upstream=%s:%d", self._scheme, self._host, self._port)

    def _connect_upstream(self, target_host: str, target_port: int, is_connect: bool = True) -> tuple[socket.socket, bytes]:
        started = time.monotonic()
        try:
            if self._scheme == "socks5":
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
                sock.connect((target_host, target_port))
                sock.setblocking(False)
                elapsed_ms = (time.monotonic() - started) * 1000
                logger.info(
                    "Proxy bridge upstream SOCKS5 connect succeeded | target=%s:%d | elapsed_ms=%.1f",
                    target_host,
                    target_port,
                    elapsed_ms,
                )
                return sock, b""

            # HTTP / HTTPS upstream proxy with pre-injected Proxy-Authorization
            sock = socket.socket(socket.AF_INET6 if ":" in self._host else socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10)
            sock.connect((self._host, self._port))

            if self._is_ssl:
                ssl_context = ssl.create_default_context()
                sock = ssl_context.wrap_socket(sock, server_hostname=self._host)

            trailing = b""
            if is_connect:
                auth_header = ""
                if self._username or self._password:
                    cred = base64.b64encode(f"{self._username}:{self._password}".encode("latin-1")).decode("ascii")
                    auth_header = f"Proxy-Authorization: Basic {cred}\r\n"
                connect_payload = (
                    f"CONNECT {target_host}:{target_port} HTTP/1.1\r\n"
                    f"Host: {target_host}:{target_port}\r\n"
                    f"{auth_header}"
                    f"Proxy-Connection: Keep-Alive\r\n\r\n"
                ).encode("latin-1")
                sock.sendall(connect_payload)

                resp_buf = bytearray()
                while b"\r\n\r\n" not in resp_buf:
                    chunk = sock.recv(4096)
                    if not chunk:
                        raise ProxyBridgeError(f"HTTP upstream proxy ngắt kết nối đột ngột: {self._host}:{self._port}")
                    resp_buf.extend(chunk)

                header_end = resp_buf.find(b"\r\n\r\n") + 4
                first_line = resp_buf[:header_end].split(b"\r\n", 1)[0].decode("latin-1", "replace").strip()
                status_parts = first_line.split()
                status_code = status_parts[1] if len(status_parts) >= 2 else ""
                if status_code != "200" and not first_line.startswith(("HTTP/1.1 200", "HTTP/1.0 200")):
                    raise ProxyBridgeError(f"HTTP upstream proxy từ chối CONNECT: {first_line}")

                trailing = bytes(resp_buf[header_end:])

            elapsed_ms = (time.monotonic() - started) * 1000
            logger.info(
                "Proxy bridge upstream HTTP connect succeeded | scheme=%s | target=%s:%d | is_connect=%s | elapsed_ms=%.1f",
                self._scheme,
                target_host,
                target_port,
                is_connect,
                elapsed_ms,
            )
            sock.setblocking(False)
            return sock, trailing
        except Exception as exc:
            elapsed_ms = (time.monotonic() - started) * 1000
            logger.warning(
                "Proxy bridge upstream connect failed | scheme=%s | target=%s:%d | elapsed_ms=%.1f | error_type=%s",
                self._scheme,
                target_host,
                target_port,
                elapsed_ms,
                type(exc).__name__,
            )
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
            try:
                while True:
                    data = await reader.read(64 * 1024)
                    if not data:
                        return
                    await loop.sock_sendall(upstream, data)
            except (asyncio.CancelledError, GeneratorExit):
                pass
            except (ConnectionError, OSError):
                pass

        async def upstream_to_client() -> None:
            try:
                while True:
                    data = await loop.sock_recv(upstream, 64 * 1024)
                    if not data:
                        return
                    writer.write(data)
                    await writer.drain()
            except (asyncio.CancelledError, GeneratorExit):
                pass
            except (ConnectionError, OSError):
                pass

        tasks = [asyncio.create_task(client_to_upstream()), asyncio.create_task(upstream_to_client())]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            with contextlib.suppress(asyncio.CancelledError, GeneratorExit):
                await asyncio.gather(*tasks, return_exceptions=True)

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        self._writers.add(writer)
        upstream: socket.socket | None = None
        try:
            header = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=15)
            request_line = header.split(b"\r\n", 1)[0].decode("latin-1", "replace")
            target_host, target_port, target_path, is_connect = self._target(request_line)
            upstream, trailing = await asyncio.to_thread(self._connect_upstream, target_host, target_port, is_connect)

            if is_connect:
                writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                if trailing:
                    writer.write(trailing)
                await writer.drain()
            else:
                lines = header.decode("latin-1", "replace").split("\r\n")
                if self._scheme == "socks5":
                    lines[0] = f"{request_line.split(' ', 1)[0]} {target_path} HTTP/1.1"
                    filtered = [line for line in lines[1:] if line.lower() != "proxy-connection: keep-alive"]
                    rewritten = ("\r\n".join([lines[0], *filtered])).encode("latin-1", "replace")
                else:
                    filtered = [line for line in lines if line and not line.lower().startswith("proxy-authorization:")]
                    if self._username or self._password:
                        cred = base64.b64encode(f"{self._username}:{self._password}".encode("latin-1")).decode("ascii")
                        filtered.insert(1, f"Proxy-Authorization: Basic {cred}")
                    rewritten = ("\r\n".join(filtered) + "\r\n\r\n").encode("latin-1")

                await asyncio.get_running_loop().sock_sendall(upstream, rewritten)

            await self._relay(reader, writer, upstream)
        except (asyncio.IncompleteReadError, asyncio.TimeoutError, ConnectionError, OSError, ProxyBridgeError) as exc:
            logger.debug("Proxy bridge connection ended: %s", exc)
            if not writer.is_closing():
                try:
                    writer.write(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
                    await writer.drain()
                except Exception:
                    pass
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
                logger.debug("Proxy bridge client cleanup failed", exc_info=True)


# Backwards compatibility aliases
Socks5HttpBridge = AuthenticatedProxyBridge
HttpToHttpBridge = AuthenticatedProxyBridge

