"""Persist a lightweight history of automation runs for the dashboard.

Stores one JSON line per finished run: profile, workflow, status, duration.
This lets the Overview show "phiên auto gần nhất" with real durations and a
click-through breakdown without depending on live runtime state.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from core.paths import user_data_path

logger = logging.getLogger(__name__)

RUN_HISTORY_FILE = user_data_path("logs", "run_history.jsonl")
_MAX_RECORDS = 500


def record_run(
    profile_id: str,
    profile_name: str,
    action: str,
    status: str,
    duration_seconds: float,
    error: str = "",
    session_id: str = "",
) -> None:
    """Append a finished-run record. Best effort: never raise to caller."""
    try:
        RUN_HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "id": str(profile_id or ""),
            "profile_name": str(profile_name or profile_id or ""),
            "action": str(action or ""),
            "status": str(status or ""),
            "duration_seconds": round(max(0.0, float(duration_seconds or 0.0)), 2),
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "error": str(error or "").splitlines()[0][:200] if error else "",
            "session_id": str(session_id or ""),
        }
        with open(RUN_HISTORY_FILE, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        _trim_history()
    except Exception as exc:
        logger.debug("Khong ghi duoc run_history: %s", exc)


def _trim_history() -> None:
    try:
        if not RUN_HISTORY_FILE.exists():
            return
        lines = RUN_HISTORY_FILE.read_text(encoding="utf-8").splitlines()
        if len(lines) > _MAX_RECORDS:
            RUN_HISTORY_FILE.write_text("\n".join(lines[-_MAX_RECORDS:]) + "\n", encoding="utf-8")
    except Exception:
        pass


def recent_runs(limit: int = 20) -> list[dict]:
    """Return the most recent finished runs (newest first)."""
    if not RUN_HISTORY_FILE.exists():
        return []
    try:
        lines = RUN_HISTORY_FILE.read_text(encoding="utf-8").splitlines()
    except Exception:
        return []
    records: list[dict] = []
    for line in lines[-_MAX_RECORDS:]:
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except Exception:
            continue
    records.reverse()
    return records[: max(1, int(limit or 20))]


def _is_today(iso_value: str) -> bool:
    if not iso_value:
        return False
    try:
        dt = datetime.fromisoformat(iso_value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return dt.astimezone(timezone.utc).date() == datetime.now(timezone.utc).date()


def _parse_finished_at(run: dict) -> datetime | None:
    try:
        value = str(run.get("finished_at") or "")
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _run_start_at(run: dict) -> datetime | None:
    finished = _parse_finished_at(run)
    if finished is None:
        return None
    try:
        duration = float(run.get("duration_seconds") or 0.0)
    except (TypeError, ValueError):
        duration = 0.0
    return finished - timedelta(seconds=max(0.0, duration))


def _session_status(runs: list[dict]) -> str:
    statuses = {str(run.get("status") or "") for run in runs}
    if "error" in statuses:
        return "error"
    if "running" in statuses:
        return "running"
    if "stopped" in statuses or "cancelled" in statuses:
        return "stopped"
    if statuses == {"success"}:
        return "success"
    return next(iter(statuses), "")


def _build_session(session_id: str, runs: list[dict], index: int) -> dict:
    ordered = sorted(runs, key=lambda run: _parse_finished_at(run) or datetime.min.replace(tzinfo=timezone.utc))
    starts = [value for value in (_run_start_at(run) for run in ordered) if value is not None]
    finishes = [value for value in (_parse_finished_at(run) for run in ordered) if value is not None]
    started_at = min(starts).isoformat() if starts else ""
    finished_at = max(finishes).isoformat() if finishes else ""
    duration = 0.0
    if starts and finishes:
        duration = max(0.0, (max(finishes) - min(starts)).total_seconds())
    actions = [str(run.get("action") or "") for run in ordered if run.get("action")]
    action = actions[0] if actions and all(item == actions[0] for item in actions) else "mixed"
    return {
        "session_id": session_id or f"legacy-{index}",
        "action": action,
        "status": _session_status(ordered),
        "started_at": started_at,
        "finished_at": finished_at,
        "duration_seconds": round(duration, 2),
        "profile_count": len({str(run.get("id") or run.get("profile_name") or idx) for idx, run in enumerate(ordered)}),
        "runs": list(reversed(ordered)),
    }


def recent_sessions(limit: int = 20) -> list[dict]:
    """Group recent profile-level runs into clearer automation sessions."""
    runs = list(reversed(recent_runs(limit=max(limit * 8, 80))))
    explicit: dict[str, list[dict]] = {}
    legacy: list[list[dict]] = []
    current: list[dict] = []
    current_end: datetime | None = None
    current_action = ""
    max_gap = timedelta(minutes=20)

    for run in runs:
        sid = str(run.get("session_id") or "")
        if sid:
            explicit.setdefault(sid, []).append(run)
            continue
        start = _run_start_at(run)
        end = _parse_finished_at(run)
        action = str(run.get("action") or "")
        same_chain = bool(current and start and current_end and start <= current_end + max_gap and (not current_action or action == current_action))
        if not same_chain:
            if current:
                legacy.append(current)
            current = [run]
            current_action = action
            current_end = end
        else:
            current.append(run)
            if end and (current_end is None or end > current_end):
                current_end = end
    if current:
        legacy.append(current)

    sessions: list[dict] = []
    for idx, (sid, grouped_runs) in enumerate(explicit.items()):
        sessions.append(_build_session(sid, grouped_runs, idx))
    base = len(sessions)
    for idx, grouped_runs in enumerate(legacy):
        sessions.append(_build_session("", grouped_runs, base + idx))

    sessions.sort(key=lambda item: str(item.get("finished_at") or ""), reverse=True)
    return sessions[: max(1, int(limit or 20))]


def session_summary(limit: int = 20) -> dict:
    """Aggregate the latest runs into an overview-friendly session summary."""
    runs = recent_runs(limit=max(limit, 20))
    sessions = recent_sessions(limit=limit)
    today_runtime = sum(
        float(session.get("duration_seconds") or 0.0)
        for session in sessions
        if _is_today(str(session.get("finished_at") or ""))
    )
    today_run_count = sum(1 for r in runs if _is_today(str(r.get("finished_at") or "")))
    today_session_count = sum(1 for session in sessions if _is_today(str(session.get("finished_at") or "")))
    last_run = runs[0] if runs else None
    return {
        "last_run": last_run,
        "today_runtime_seconds": round(today_runtime, 2),
        "today_run_count": today_run_count,
        "today_session_count": today_session_count,
        "recent_runs": runs,
        "recent_sessions": sessions,
    }
