import faulthandler
import logging
import os
import sys
import traceback
from logging.handlers import RotatingFileHandler
from pathlib import Path
from types import TracebackType
from typing import TextIO

from core.paths import app_path, user_data_path


_fault_file: TextIO | None = None


def startup_log_path() -> Path:
    return app_path("logs", "startup.log")


def _ensure_parent_dir(path: Path) -> None:
    try:
        os.makedirs(path.parent, exist_ok=True)
        return
    except OSError:
        pass

    # Some UNC shares fail recursive mkdir even when the final directory is
    # writable. Walk components manually, then let caller fall back if needed.
    cur = Path(path.parent.anchor)
    for part in path.parent.relative_to(cur).parts:
        cur = cur / part
        try:
            cur.mkdir(exist_ok=True)
        except (FileExistsError, OSError):
            pass
    if not path.parent.is_dir():
        raise FileNotFoundError(path.parent)


def _open_log_handler(formatter: logging.Formatter) -> tuple[Path, RotatingFileHandler]:
    errors: list[str] = []
    for log_path in (startup_log_path(), user_data_path("logs", "startup.log")):
        try:
            _ensure_parent_dir(log_path)
            handler = RotatingFileHandler(
                log_path, maxBytes=1_500_000, backupCount=2, encoding="utf-8"
            )
            handler.setFormatter(formatter)
            return log_path, handler
        except Exception as exc:
            errors.append(f"{log_path}: {exc}")
    raise RuntimeError("Cannot open startup log. Tried: " + " | ".join(errors))


def setup_startup_logging() -> Path:
    """Write early startup failures to file; fall back to LOCALAPPDATA if needed."""
    global _fault_file

    root = logging.getLogger()
    root.setLevel(logging.INFO)

    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Redact proxy credentials / tokens / passwords / license keys khỏi log chính.
    class _StartupRedactingFilter(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            try:
                from sidecar.utils.logging_setup import redact_sensitive

                clean = redact_sensitive(record.getMessage())
                if clean != record.getMessage():
                    record.msg = clean
                    record.args = ()
            except Exception:
                pass
            return True

    redact_filter: logging.Filter = _StartupRedactingFilter()

    log_path, file_handler = _open_log_handler(formatter)
    file_handler.addFilter(redact_filter)
    root.addHandler(file_handler)

    if not getattr(sys, "frozen", False):
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)
        stream_handler.addFilter(redact_filter)
        root.addHandler(stream_handler)

    _fault_file = open(log_path, "a", encoding="utf-8")
    faulthandler.enable(file=_fault_file)

    def excepthook(
        exc_type: type[BaseException],
        exc: BaseException,
        tb: TracebackType | None,
    ) -> None:
        logging.critical(
            "Unhandled exception:\n%s",
            "".join(traceback.format_exception(exc_type, exc, tb)),
        )

    sys.excepthook = excepthook
    from core.version import BUILD_DATE, __version__

    logging.info("BrowserMulti v%s (%s) startup logging: %s", __version__, BUILD_DATE, log_path)
    if log_path != startup_log_path():
        logging.warning("Portable log path is not writable; using fallback log path: %s", log_path)
    return log_path
