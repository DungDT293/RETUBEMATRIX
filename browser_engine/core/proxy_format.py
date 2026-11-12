"""Parse common proxy provider formats into browser-ready proxy URLs."""
from __future__ import annotations

from dataclasses import dataclass
import re
from urllib.parse import quote, unquote, urlsplit

_SUPPORTED_SCHEMES = {"http", "https", "socks4", "socks5", "socks5h"}
_PERSISTED_SCHEMES = {"http", "https", "socks4", "socks5"}
_AUTO_SCHEMES = ("http", "https", "socks5", "socks4")


@dataclass(frozen=True)
class ProxyCandidate:
    scheme: str
    url: str
    input_format: str


@dataclass(frozen=True)
class ParsedProxy:
    raw: str
    input_format: str
    candidates: tuple[ProxyCandidate, ...]
    warnings: tuple[str, ...]


def _clean(value: str | None) -> str:
    return str(value or "").strip()


def _encode_auth(value: str) -> str:
    return quote(unquote(value), safe="")


def _format_host(host: str) -> str:
    host = host.strip().strip("[]")
    if ":" in host and not re.match(r"^\d+\.\d+\.\d+\.\d+$", host):
        return f"[{host}]"
    return host


def _valid_port(port: str) -> bool:
    if not port.isdigit():
        return False
    number = int(port)
    return 1 <= number <= 65535


def normalize_proxy_scheme(value: str | None, *, allow_auto: bool = False) -> str:
    scheme = _clean(value).lower()
    if scheme == "socks5h":
        scheme = "socks5"
    if scheme in _PERSISTED_SCHEMES or (allow_auto and scheme == "auto"):
        return scheme
    return ""


def proxy_scheme_from_input(value: str | None) -> str:
    raw = _clean(value)
    if not re.match(r"^[a-z][a-z0-9+.-]*://", raw, re.IGNORECASE):
        return ""
    try:
        return normalize_proxy_scheme(urlsplit(raw).scheme)
    except ValueError:
        return ""


def _scheme_choices(proxy_type: str | None) -> tuple[str, ...]:
    requested = normalize_proxy_scheme(proxy_type, allow_auto=True)
    if requested and requested != "auto":
        return (requested,)
    return _AUTO_SCHEMES


def _is_explicit_url(value: str | None) -> bool:
    return bool(re.match(r"^[a-z][a-z0-9+.-]*://", _clean(value), re.IGNORECASE))


def _make_url(scheme: str, host: str, port: str, username: str = "", password: str = "") -> str:
    scheme = "socks5" if scheme == "socks5h" else scheme.lower()
    auth = ""
    if username or password:
        auth = f"{_encode_auth(username)}:{_encode_auth(password)}@"
    return f"{scheme}://{auth}{_format_host(host)}:{int(port)}"


def _candidate_from_parts(
    scheme: str,
    host: str,
    port: str,
    username: str = "",
    password: str = "",
    input_format: str = "unknown",
) -> ProxyCandidate | None:
    host = host.strip().strip("[]")
    port = port.strip()
    if not host or not _valid_port(port):
        return None
    return ProxyCandidate(
        scheme="socks5" if scheme == "socks5h" else scheme.lower(),
        url=_make_url(scheme, host, port, username.strip(), password.strip()),
        input_format=input_format,
    )


def _candidate_from_url(raw: str, input_format: str = "url") -> ProxyCandidate | None:
    try:
        parts = urlsplit(raw)
        port = str(parts.port or "")
    except ValueError:
        return None
    scheme = parts.scheme.lower()
    if scheme not in _SUPPORTED_SCHEMES:
        return None
    host = parts.hostname or ""
    return _candidate_from_parts(
        scheme,
        host,
        port,
        parts.username or "",
        parts.password or "",
        input_format,
    )


def _candidates_for_parts(
    schemes: tuple[str, ...],
    host: str,
    port: str,
    username: str = "",
    password: str = "",
    input_format: str = "unknown",
) -> list[ProxyCandidate]:
    candidates: list[ProxyCandidate] = []
    seen: set[str] = set()
    for scheme in schemes:
        candidate = _candidate_from_parts(scheme, host, port, username, password, input_format)
        if candidate and candidate.url not in seen:
            candidates.append(candidate)
            seen.add(candidate.url)
    return candidates


def parse_proxy_input(value: str | None, proxy_type: str | None = "auto") -> ParsedProxy:
    raw = _clean(value)
    if not raw:
        return ParsedProxy(raw="", input_format="blank", candidates=(), warnings=())

    lowered = raw.lower()
    warnings: list[str] = []
    if re.match(r"^[a-z][a-z0-9+.-]*://", raw, re.IGNORECASE):
        candidate = _candidate_from_url(raw)
        candidates = (candidate,) if candidate else ()
    else:
        schemes = _scheme_choices(proxy_type)
        candidates_list: list[ProxyCandidate] = []
        input_format = "unknown"

        if "@" in raw:
            candidate = _candidate_from_url(f"http://{raw}", "auth_at_host")
            if candidate:
                input_format = "auth_at_host"
                parts = urlsplit(candidate.url)
                candidates_list = _candidates_for_parts(
                    schemes,
                    parts.hostname or "",
                    str(parts.port or ""),
                    parts.username or "",
                    parts.password or "",
                    input_format,
                )

        if not candidates_list:
            for delimiter, fmt in (("|", "delimited"), (";", "delimited")):
                if delimiter not in raw:
                    continue
                parts = [part.strip() for part in raw.split(delimiter)]
                if len(parts) >= 4:
                    input_format = fmt
                    candidates_list = _candidates_for_parts(
                        schemes, parts[0], parts[1], parts[2], delimiter.join(parts[3:]), input_format
                    )
                elif len(parts) == 2:
                    input_format = fmt
                    candidates_list = _candidates_for_parts(schemes, parts[0], parts[1], input_format=input_format)
                if candidates_list:
                    break

        if not candidates_list and re.search(r"\s", raw):
            parts = raw.split()
            if len(parts) >= 4:
                input_format = "space_delimited"
                candidates_list = _candidates_for_parts(schemes, parts[0], parts[1], parts[2], " ".join(parts[3:]), input_format)
            elif len(parts) == 2:
                input_format = "space_delimited"
                candidates_list = _candidates_for_parts(schemes, parts[0], parts[1], input_format=input_format)

        if not candidates_list:
            parts = raw.split(":")
            if len(parts) >= 4:
                input_format = "host_port_auth"
                candidates_list = _candidates_for_parts(schemes, parts[0], parts[1], parts[2], ":".join(parts[3:]), input_format)
            elif len(parts) == 2:
                input_format = "host_port"
                candidates_list = _candidates_for_parts(schemes, parts[0], parts[1], input_format=input_format)

        candidates = tuple(candidates_list)

    input_format = candidates[0].input_format if candidates else "invalid"
    return ParsedProxy(raw=raw, input_format=input_format, candidates=candidates, warnings=tuple(warnings))


def canonical_proxy(value: str | None, proxy_type: str | None = "auto") -> str:
    parsed = parse_proxy_input(value, proxy_type)
    if parsed.candidates:
        return parsed.candidates[0].url
    return parsed.raw


def canonical_proxy_with_scheme(value: str | None, proxy_scheme: str | None = "") -> str:
    raw = _clean(value)
    if not raw:
        return ""
    if _is_explicit_url(raw):
        return canonical_proxy(raw)
    scheme = normalize_proxy_scheme(proxy_scheme)
    if not scheme:
        return raw
    parsed = parse_proxy_input(raw, scheme)
    return parsed.candidates[0].url if parsed.candidates else raw


def proxy_requires_bridge(value: str | None, proxy_type: str | None = "auto") -> bool:
    proxy = canonical_proxy_with_scheme(value, proxy_type)
    if proxy and not _is_explicit_url(proxy):
        proxy = canonical_proxy(proxy, proxy_type)
    if not proxy:
        return False
    try:
        parts = urlsplit(proxy)
    except ValueError:
        return False
    scheme = parts.scheme.lower()
    has_auth = bool(parts.username or parts.password)
    # Bridge any authenticated proxy (SOCKS5 or HTTP) to bypass CDP 407 interception deadlock and enable HTTP/2
    return has_auth and scheme in {"socks5", "socks5h", "http", "https"}


def proxy_launch_compatibility(value: str | None, proxy_type: str | None = "auto") -> tuple[bool, str]:
    """Return whether Chromium can launch this proxy without unsupported auth."""
    proxy = canonical_proxy_with_scheme(value, proxy_type)
    if proxy and not _is_explicit_url(proxy):
        proxy = canonical_proxy(proxy, proxy_type)
    if not proxy:
        return True, ""
    try:
        parts = urlsplit(proxy)
        has_host_port = bool(parts.scheme and parts.hostname and parts.port)
    except ValueError:
        return False, "Proxy không có định dạng URL hợp lệ."
    if not has_host_port:
        return False, "Proxy không có host/port hợp lệ."
    scheme = parts.scheme.lower()
    if scheme not in _SUPPORTED_SCHEMES:
        return False, f"Giao thức proxy '{scheme}' không được hỗ trợ."
    return True, ""


def playwright_proxy_config(value: str | None, proxy_type: str | None = "auto") -> dict[str, str]:
    proxy = canonical_proxy_with_scheme(value, proxy_type)
    if proxy and not _is_explicit_url(proxy):
        # ponytail: raw legacy proxies without a saved detection keep the old HTTP-first launch.
        proxy = canonical_proxy(proxy, proxy_type)
    if not proxy:
        return {}
    if not proxy:
        return {}
    try:
        parts = urlsplit(proxy)
        host = parts.hostname or ""
        port = str(parts.port or "")
    except ValueError:
        return {"server": proxy}
    if not parts.scheme or not host or not port:
        return {"server": proxy}
    config = {"server": f"{parts.scheme}://{_format_host(host)}:{port}"}
    if parts.username:
        config["username"] = unquote(parts.username)
    if parts.password:
        config["password"] = unquote(parts.password)
    return config
