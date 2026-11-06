# -*- coding: utf-8 -*-
"""
RETubeMatrix Browser Engine Runner
Bridge between RETubeMatrix (Tauri Rust backend) and anti-detect core & YouTube upload automation.
"""
import sys
import os
import json
import asyncio
import logging
import argparse
import time
import base64
import platform
import shutil
from datetime import datetime, timezone
from pathlib import Path

# Ensure UTF-8 output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Ensure local browser_engine directory is prioritized in sys.path
ENGINE_DIR = Path(__file__).resolve().parent
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

try:
    import psutil
except ImportError:
    psutil = None

try:
    from core.profile_store import (
        load_profiles,
        add_profile,
        update_profile,
        delete_profile,
    )
    from core.paths import profile_data_dir, profile_data_root, user_data_root
    from core.browser import CloakSession
    from actions.upload_actions import YouTubeUpload
    from core.run_history import session_summary, recent_runs, record_run
    from core.window_arranger import arrange_windows
except ImportError as e:
    print(json.dumps({"success": False, "error": f"Failed to import browser_engine modules: {e}"}))
    sys.exit(1)

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("browser_engine")


def get_payload(args) -> dict:
    """Safely decode payload either from base64 (preferred) or raw JSON string."""
    if getattr(args, "data_b64", None):
        try:
            raw = base64.b64decode(args.data_b64.encode("ascii")).decode("utf-8")
            return json.loads(raw)
        except Exception as e:
            logger.error("Lỗi giải mã data_b64: %s", e)
    if getattr(args, "data", None):
        try:
            return json.loads(args.data)
        except Exception as e:
            logger.error("Lỗi parse data json: %s", e)
    return {}


def _clean_profile_locks(profile_dir_name: str, force_kill_live: bool = False):
    """Clean SingletonLock and stale files so profile always opens cleanly."""
    try:
        pdir = profile_data_dir(profile_dir_name)
        if force_kill_live and pdir.is_dir():
            try:
                from core.window_icon_badge import chrome_pids_for_user_data_dir
                import psutil
                pids = chrome_pids_for_user_data_dir(str(pdir))
                for pid in pids:
                    try:
                        if psutil.pid_exists(pid):
                            proc = psutil.Process(pid)
                            for child in proc.children(recursive=True):
                                try:
                                    child.kill()
                                except Exception:
                                    pass
                            proc.kill()
                    except Exception:
                        pass
                if pids:
                    time.sleep(0.5)
            except Exception:
                pass
        if pdir.is_dir():
            for fname in ("SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile", "browsermulti_session.pid"):
                lock_file = pdir / fname
                try:
                    if lock_file.exists():
                        lock_file.unlink(missing_ok=True)
                except Exception:
                    pass
    except Exception:
        pass


def action_list_profiles():
    try:
        profiles = load_profiles()
        # Đối soát tiến trình Chromium thực tế: kiểm tra xem PID thực tế có còn sống không
        try:
            from core.window_icon_badge import chrome_pids_by_user_data_dir
            from core.paths import profile_data_dir
            import psutil
            active_dirs = chrome_pids_by_user_data_dir()
            changed = False
            for p in profiles:
                p_dir = p.get("profile_dir") or p.get("profile_name") or p.get("id")
                norm = ""
                pdir_path = None
                try:
                    pdir_path = profile_data_dir(p_dir)
                    norm = os.path.normcase(os.path.abspath(str(pdir_path)))
                except Exception:
                    pass
                pids = active_dirs.get(norm, [])
                is_running = bool(pids and any(psutil.pid_exists(pid) for pid in pids))

                if is_running:
                    if p.get("last_run_status") != "running":
                        p["last_run_status"] = "running"
                        changed = True
                else:
                    if p.get("last_run_status") == "running":
                        p["last_run_status"] = "stopped"
                        changed = True
            if changed:
                save_profiles(profiles)
        except Exception as e:
            logger.warning("Lỗi đối soát trạng thái profile: %s", e)

        print(json.dumps({"success": True, "profiles": profiles}, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.stdout.flush()
        sys.exit(1)


def action_add_profile(args):
    try:
        payload = get_payload(args)
        name = (payload.get("profile_name") or "").strip()
        if not name:
            print(json.dumps({"success": False, "error": "Profile name is required"}, ensure_ascii=False))
            sys.stdout.flush()
            sys.exit(1)

        proxy = (payload.get("proxy") or "").strip()
        group = (payload.get("group") or "Default").strip()
        locale = (payload.get("locale") or "vi-VN").strip()
        preferred_channel = (payload.get("youtube_preferred_channel") or "").strip()
        note = (payload.get("note") or "").strip()
        color = (payload.get("color") or "#E15B64").strip()

        created = add_profile(
            profile_name=name,
            proxy=proxy,
            group=group,
            locale=locale,
        )

        p_id = created.get("id") or name
        patch = {}
        if preferred_channel:
            patch["youtube_preferred_channel"] = preferred_channel
        if note:
            patch["note"] = note
        if color:
            patch["color"] = color

        if patch:
            update_profile(p_id, **patch)
            created.update(patch)

        print(json.dumps({"success": True, "profile": created}, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.stdout.flush()
        sys.exit(1)


def action_update_profile(args):
    try:
        p_id = args.profile_id
        payload = get_payload(args)
        if not p_id:
            print(json.dumps({"success": False, "error": "Profile ID is required"}, ensure_ascii=False))
            sys.stdout.flush()
            sys.exit(1)

        # Filter out None values
        clean_payload = {k: v for k, v in payload.items() if v is not None}
        ok = update_profile(p_id, **clean_payload)
        print(json.dumps({"success": ok}, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.stdout.flush()
        sys.exit(1)


def action_delete_profile(args):
    try:
        p_id = args.profile_id
        if not p_id:
            print(json.dumps({"success": False, "error": "Profile ID is required"}, ensure_ascii=False))
            sys.stdout.flush()
            sys.exit(1)

        ok = delete_profile(p_id)
        is_success = bool(ok) if isinstance(ok, (bool, dict)) else True
        print(json.dumps({"success": is_success, "data": ok}, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.stdout.flush()
        sys.exit(1)


def action_test_proxy(args):
    import requests
    payload = get_payload(args)
    proxy_str = (payload.get("proxy") or "").strip()
    if not proxy_str:
        print(json.dumps({"success": False, "error": "Proxy string is empty"}, ensure_ascii=False))
        sys.stdout.flush()
        return

    # Normalize proxy
    scheme = "http"
    target = proxy_str
    if "://" in proxy_str:
        scheme, target = proxy_str.split("://", 1)
        scheme = scheme.lower()

    proxies = {
        "http": f"{scheme}://{target}",
        "https": f"{scheme}://{target}",
    }

    try:
        t0 = time.perf_counter()
        resp = requests.get("https://api.ipify.org?format=json", proxies=proxies, timeout=8)
        t1 = time.perf_counter()
        latency_ms = int((t1 - t0) * 1000)

        ip = resp.json().get("ip", "")

        country = ""
        city = ""
        org = ""
        try:
            geo_resp = requests.get(f"http://ip-api.com/json/{ip}?fields=status,country,city,isp,org", timeout=5)
            if geo_resp.status_code == 200:
                geo_data = geo_resp.json()
                country = geo_data.get("country", "")
                city = geo_data.get("city", "")
                org = geo_data.get("isp") or geo_data.get("org", "")
        except Exception:
            pass

        print(json.dumps({
            "success": True,
            "ip": ip,
            "latency_ms": latency_ms,
            "country": country,
            "city": city,
            "org": org,
        }, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Kết nối thất bại: {e}"}, ensure_ascii=False))
        sys.stdout.flush()


def action_get_stats():
    try:
        profiles = load_profiles()
        summary = session_summary(limit=20)

        # Check live profiles
        running_profiles = []
        try:
            from core.window_icon_badge import chrome_pids_by_user_data_dir
            from core.window_arranger import has_profile_windows
            active_dirs = chrome_pids_by_user_data_dir()
        except Exception:
            active_dirs = {}

        for p in profiles:
            p_id = p.get("id") or p.get("profile_name")
            p_dir = p.get("profile_dir") or p.get("profile_name") or p_id
            norm = ""
            pdir_path = None
            try:
                pdir_path = profile_data_dir(p_dir)
                norm = os.path.normcase(os.path.abspath(str(pdir_path)))
            except Exception:
                pass
            pids = active_dirs.get(norm, [])
            is_running = False
            if pids and pdir_path and has_profile_windows(pdir_path, pids):
                is_running = True

            if is_running:
                running_profiles.append({
                    "id": p_id,
                    "name": p.get("profile_name") or p_id,
                    "action": p.get("action") or "browser",
                })

        now = datetime.now(timezone.utc).date()

        def _is_today(dt_str):
            if not dt_str:
                return False
            try:
                dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                return dt.astimezone(timezone.utc).date() == now
            except Exception:
                return False

        success_today = sum(1 for p in profiles if p.get("last_run_status") == "success" and _is_today(p.get("last_run_time")))
        error_today = sum(1 for p in profiles if p.get("last_run_status") == "error" and _is_today(p.get("last_run_time")))
        ready_count = len([p for p in profiles if p.get("last_run_status") != "running" and p.get("last_run_status") != "error"])

        recent_errors = []
        for p in sorted((p for p in profiles if p.get("last_run_status") == "error"), key=lambda x: str(x.get("last_run_time") or ""), reverse=True)[:5]:
            recent_errors.append({
                "id": p.get("id") or p.get("profile_name"),
                "name": p.get("profile_name") or p.get("id"),
                "time": str(p.get("last_run_time") or ""),
                "error": str(p.get("last_run_error") or "Không có chi tiết lỗi"),
            })

        ram_str = "N/A"
        if psutil is not None:
            try:
                mem = psutil.virtual_memory()
                ram_str = f"{round(mem.used / (1024**3), 1)}GB / {round(mem.total / (1024**3), 1)}GB ({mem.percent}%)"
            except Exception:
                pass

        data = {
            "success": True,
            "stats": {
                "total_profiles": len(profiles),
                "running": len(running_profiles),
                "success_today": success_today,
                "error_today": error_today,
                "ready": ready_count,
                "running_profiles": running_profiles,
                "recent_errors": recent_errors,
                "warnings": [],
                "run_summary": summary,
                "system_info": {
                    "os": f"{platform.system()} {platform.release()}",
                    "ram": ram_str,
                    "python": sys.version.split()[0],
                    "data_dir": str(profile_data_root()),
                },
            },
        }
        print(json.dumps(data, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.stdout.flush()


def action_stop_profile(args):
    try:
        p_id = args.profile_id
        if not p_id:
            print(json.dumps({"success": False, "error": "Profile ID is required"}, ensure_ascii=False))
            sys.stdout.flush()
            return

        profiles = load_profiles()
        p = next((x for x in profiles if x.get("id") == p_id or x.get("profile_name") == p_id), None)
        p_dir = p.get("profile_dir") or p.get("profile_name") or p_id if p else p_id

        # Kill process if PID exists
        try:
            pdir_path = profile_data_dir(p_dir)
            pid_file = pdir_path / "browsermulti_session.pid"
            if pid_file.exists():
                pid_str = pid_file.read_text(encoding="utf-8").strip()
                if pid_str.isdigit() and psutil is not None:
                    pid = int(pid_str)
                    if psutil.pid_exists(pid):
                        proc = psutil.Process(pid)
                        for child in proc.children(recursive=True):
                            try:
                                child.kill()
                            except Exception:
                                pass
                        proc.kill()
        except Exception:
            pass

        _clean_profile_locks(p_dir, force_kill_live=True)
        update_profile(p_id, last_run_status="stopped")
        print(json.dumps({"success": True, "message": f"Đã dừng hồ sơ {p_id}"}, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.stdout.flush()


def action_bulk_stop(args):
    try:
        payload = get_payload(args)
        ids = payload.get("profile_ids") or []
        for p_id in ids:
            try:
                profiles = load_profiles()
                p = next((x for x in profiles if x.get("id") == p_id or x.get("profile_name") == p_id), None)
                p_dir = p.get("profile_dir") or p.get("profile_name") or p_id if p else p_id
                _clean_profile_locks(p_dir, force_kill_live=True)
                update_profile(p_id, last_run_status="stopped")
            except Exception:
                pass
        print(json.dumps({"success": True, "stopped_count": len(ids)}, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.stdout.flush()


def action_arrange_windows(args):
    try:
        payload = get_payload(args)
        layout = payload.get("layout", "auto")
        w = int(payload.get("window_width") or payload.get("width") or 516)
        h = int(payload.get("window_height") or payload.get("height") or 600)
        apply_visible = bool(payload.get("apply_to_visible_area", True))
        cols_val = payload.get("columns")
        columns = int(cols_val) if cols_val is not None and str(cols_val).isdigit() else None
        gap = int(payload.get("gap") or 0)

        profiles = load_profiles()
        profile_ids = [p.get("id") for p in profiles if p.get("id")]
        profile_names = {p.get("id"): (p.get("profile_name") or p.get("id")) for p in profiles if p.get("id")}
        profile_dirs = {
            p.get("id"): str(profile_data_dir(p.get("profile_dir") or p.get("profile_name") or p.get("id")))
            for p in profiles
            if p.get("id")
        }

        res = arrange_windows(
            profile_ids=profile_ids,
            profile_names=profile_names,
            profile_dirs=profile_dirs,
            layout=layout,
            window_width=w,
            window_height=h,
            apply_to_visible_area=apply_visible,
            columns=columns,
            gap=gap,
        )
        print(json.dumps({"success": True, "result": res}, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.stdout.flush()


def action_clean_cache(args):
    try:
        p_id = args.profile_id
        if not p_id:
            print(json.dumps({"success": False, "error": "Profile ID is required"}, ensure_ascii=False))
            sys.stdout.flush()
            return

        profiles = load_profiles()
        p = next((x for x in profiles if x.get("id") == p_id or x.get("profile_name") == p_id), None)
        p_dir = p.get("profile_dir") or p.get("profile_name") or p_id if p else p_id

        pdir_path = profile_data_dir(p_dir)
        cleaned_mb = 0.0
        cache_subdirs = [
            "Cache",
            "Code Cache",
            "GPUCache",
            "DawnCache",
            "Service Worker/CacheStorage",
            "Service Worker/ScriptCache",
        ]
        for sub in cache_subdirs:
            target = pdir_path / sub
            if target.exists():
                try:
                    size = sum(f.stat().st_size for f in target.rglob("*") if f.is_file())
                    cleaned_mb += size / (1024 * 1024)
                    if target.is_dir():
                        shutil.rmtree(target, ignore_errors=True)
                    else:
                        target.unlink(missing_ok=True)
                except Exception:
                    pass
        print(json.dumps({"success": True, "message": f"Đã dọn dẹp cache ({round(cleaned_mb, 1)} MB). Phiên đăng nhập được bảo toàn."}, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.stdout.flush()


def action_update_profile_meta(args):
    try:
        p_id = args.profile_id
        payload = get_payload(args)
        patch = {}
        if "note" in payload:
            patch["note"] = payload["note"]
        if "tags" in payload:
            patch["tags"] = payload["tags"]
        if "color" in payload:
            patch["color"] = payload["color"]
        ok = update_profile(p_id, **patch)
        print(json.dumps({"success": ok}, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.stdout.flush()


def action_bulk_set_group(args):
    try:
        payload = get_payload(args)
        ids = payload.get("profile_ids") or []
        group = (payload.get("group") or "Default").strip()
        count = 0
        for p_id in ids:
            if update_profile(p_id, group=group):
                count += 1
        print(json.dumps({"success": True, "updated_count": count, "group": group}, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.stdout.flush()


async def _async_open_profile(profile_id: str, target_url: str | None = None):
    profiles = load_profiles()
    profile = next((p for p in profiles if (p.get("id") == profile_id or p.get("profile_name") == profile_id)), None)
    if not profile:
        print(json.dumps({"success": False, "error": f"Profile '{profile_id}' not found"}, ensure_ascii=False))
        sys.stdout.flush()
        return

    name = profile.get("profile_name") or profile_id
    profile_dir = profile.get("profile_dir") or name
    pdir = profile_data_dir(profile_dir)
    proxy = profile.get("proxy") or ""
    fingerprint_seed = profile.get("fingerprint_seed")

    # 1. Kiểm tra xem profile đã có tiến trình Chromium đang chạy không
    try:
        from core.window_icon_badge import chrome_pids_for_user_data_dir
        live_pids = chrome_pids_for_user_data_dir(str(pdir))
    except Exception:
        live_pids = []

    if live_pids:
        # Đã có Chromium đang mở: đưa cửa sổ lên màn hình chính thay vì báo lỗi
        from core.window_arranger import focus_profile_windows
        brought_to_front = focus_profile_windows(pdir, live_pids)
        if brought_to_front:
            logger.info(f"Hồ sơ '{name}' đã đang mở. Đã kích hoạt và đưa cửa sổ lên phía trước.")
            update_profile(profile_id, last_run_status="running")
            print(json.dumps({
                "success": True,
                "event": "profile_already_running",
                "profile_id": profile_id,
                "name": name,
                "pids": live_pids
            }, ensure_ascii=False))
            sys.stdout.flush()
            return
        else:
            # Có PID nhưng không có cửa sổ hiển thị (tiến trình zombie/treo ngầm) -> dọn sạch để mở mới
            logger.info(f"Phát hiện tiến trình treo ngầm không có cửa sổ cho hồ sơ '{name}'. Đang dọn dẹp để mở lại...")
            _clean_profile_locks(profile_dir, force_kill_live=True)

    _clean_profile_locks(profile_dir)
    update_profile(profile_id, last_run_status="running")

    session = CloakSession()
    try:
        logger.info(f"Đang mở trình duyệt cho hồ sơ: {name}")
        page = await session.start(
            profile_name=name,
            proxy=proxy,
            fingerprint_seed=fingerprint_seed,
            profile_dir_name=profile_dir,
            profile_data=profile,
        )

        dest_url = (target_url or "").strip()
        if not dest_url:
            dest_url = "https://studio.youtube.com/"

        # Điều hướng nhanh với wait_until='commit' tránh block 30s
        try:
            current_url = str(getattr(page, "url", "") or "").strip().lower()
            if dest_url.lower().rstrip("/") not in current_url:
                await page.goto(dest_url, wait_until="commit", timeout=15000)
        except Exception as e:
            logger.warning(f"Lỗi điều hướng ban đầu ({dest_url}): {e}")

        # Đưa cửa sổ vừa mở lên phía trước
        try:
            from core.window_arranger import focus_profile_windows
            focus_profile_windows(pdir)
        except Exception:
            pass

        print(json.dumps({"event": "profile_opened", "profile_id": profile_id, "name": name}, ensure_ascii=False))
        sys.stdout.flush()

        context = session.context
        if context is not None:
            closed_event = asyncio.Event()

            def _on_context_close():
                closed_event.set()

            try:
                context.on("close", lambda _: _on_context_close())
            except Exception:
                pass

            # Duy trì phiên mở liên tục không giới hạn thời gian (không timeout).
            # Trình duyệt chỉ đóng lại khi người dùng tự bấm nút X đóng toàn bộ cửa sổ Chromium.
            while not closed_event.is_set():
                try:
                    pages = context.pages
                    if not pages:
                        # Chờ thêm 3s phòng trường hợp tab cũ vừa đóng và tab mới đang mở
                        await asyncio.sleep(3)
                        if not context.pages:
                            logger.info(f"Tất cả các tab của hồ sơ {name} đã đóng.")
                            break
                    await asyncio.sleep(2)
                except Exception:
                    # Context hoặc kết nối tới Chromium đã đóng
                    break

        logger.info(f"Trình duyệt cho hồ sơ {name} đã đóng.")
    except Exception as exc:
        logger.error(f"Lỗi mở hồ sơ {name}: {exc}")
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
        sys.stdout.flush()
    finally:
        try:
            await session.close()
        except Exception:
            pass
        _clean_profile_locks(profile_dir)
        update_profile(profile_id, last_run_status="stopped")


async def _async_upload_video(args):
    payload = get_payload(args)
    profile_id = str(payload.get("profile_id") or "").strip()
    video_path = str(payload.get("video_path") or "").strip()
    title = str(payload.get("title") or "").strip()
    description = str(payload.get("description") or "").strip()
    tags = str(payload.get("tags") or "").strip()
    thumbnail_path = str(payload.get("thumbnail_path") or "").strip()
    visibility = str(payload.get("visibility") or "public").strip()
    schedule_date = str(payload.get("schedule_date") or "").strip()
    schedule_time = str(payload.get("schedule_time") or "").strip()
    pinned_comment = str(payload.get("pinned_comment") or "").strip()
    preferred_channel = str(payload.get("preferred_channel") or "").strip()

    if not profile_id or not video_path:
        print(json.dumps({"success": False, "error": "profile_id và video_path là bắt buộc"}, ensure_ascii=False))
        sys.stdout.flush()
        return

    if not os.path.exists(video_path):
        print(json.dumps({"success": False, "error": f"Không tìm thấy file video: {video_path}"}, ensure_ascii=False))
        sys.stdout.flush()
        return

    profiles = load_profiles()
    profile = next((p for p in profiles if (p.get("id") == profile_id or p.get("profile_name") == profile_id)), None)
    if not profile:
        print(json.dumps({"success": False, "error": f"Không tìm thấy profile '{profile_id}'"}, ensure_ascii=False))
        sys.stdout.flush()
        return

    name = profile.get("profile_name") or profile_id
    profile_dir = profile.get("profile_dir") or name
    proxy = profile.get("proxy") or ""
    fingerprint_seed = profile.get("fingerprint_seed")
    if not preferred_channel:
        preferred_channel = profile.get("youtube_preferred_channel", "")

    # Auto tag appending for Shorts if video is short
    if tags:
        description = f"{description}\n\nTags: {tags}"

    _clean_profile_locks(profile_dir, force_kill_live=True)
    update_profile(profile_id, last_run_status="running")
    t0 = time.time()

    session = CloakSession()
    try:
        logger.info(f"Bắt đầu quy trình tải lên YouTube cho hồ sơ: {name}")
        page = await session.start(
            profile_name=name,
            proxy=proxy,
            fingerprint_seed=fingerprint_seed,
            profile_dir_name=profile_dir,
            profile_data=profile,
        )

        uploader = YouTubeUpload()
        video_url = await uploader.upload_video(
            page=page,
            video_path=video_path,
            title=title,
            description=description,
            thumbnail_path=thumbnail_path if thumbnail_path and os.path.exists(thumbnail_path) else None,
            visibility=visibility,
            schedule_date=schedule_date,
            schedule_time=schedule_time,
            pinned_comment=pinned_comment,
            preferred_channel=preferred_channel,
        )

        duration = time.time() - t0
        if video_url:
            yt_id = ""
            if "youtu.be/" in video_url:
                yt_id = video_url.split("youtu.be/")[1].split("?")[0].split("/")[0]
            elif "v=" in video_url:
                yt_id = video_url.split("v=")[1].split("&")[0]
            elif "/shorts/" in video_url:
                yt_id = video_url.split("/shorts/")[1].split("?")[0]
            elif "/video/" in video_url:
                yt_id = video_url.split("/video/")[1].split("/")[0].split("?")[0]

            print(json.dumps({
                "success": True,
                "video_url": video_url,
                "youtube_video_id": yt_id
            }, ensure_ascii=False))
            sys.stdout.flush()
            update_profile(profile_id, last_run_status="success", last_run_error="")
            record_run(
                profile_id=profile_id,
                profile_name=name,
                action="upload",
                status="success",
                duration_seconds=duration,
            )
        else:
            print(json.dumps({"success": False, "error": "Quá trình đăng video không trả về liên kết YouTube thành công"}, ensure_ascii=False))
            sys.stdout.flush()
            update_profile(profile_id, last_run_status="error", last_run_error="Không nhận được liên kết video")
            record_run(
                profile_id=profile_id,
                profile_name=name,
                action="upload",
                status="error",
                duration_seconds=duration,
                error="Không nhận được liên kết video",
            )
    except Exception as exc:
        duration = time.time() - t0
        logger.error(f"Lỗi đăng video: {exc}", exc_info=True)
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
        sys.stdout.flush()
        update_profile(profile_id, last_run_status="error", last_run_error=str(exc))
        record_run(
            profile_id=profile_id,
            profile_name=name,
            action="upload",
            status="error",
            duration_seconds=duration,
            error=str(exc),
        )
    finally:
        try:
            await session.close()
        except Exception:
            pass
        _clean_profile_locks(profile_dir)
        update_profile(profile_id, last_run_status="stopped")


async def _async_check_copyright_status(args):
    """
    Check copyright / restrictions / monetization for videos in YouTube Studio.
    Payload: {"profile_id": str, "video_ids": [str], "preferred_channel": str}
    """
    t0 = time.time()
    payload = get_payload(args)
    profile_id = str(payload.get("profile_id") or "").strip() or str(args.profile_id or "").strip()
    video_ids = payload.get("video_ids") or []
    preferred_channel = str(payload.get("preferred_channel") or "").strip()

    if not profile_id:
        print(json.dumps({"success": False, "error": "Thiếu profile_id để kiểm tra bản quyền"}, ensure_ascii=False))
        sys.stdout.flush()
        return

    profiles = load_profiles()
    profile = next((p for p in profiles if (p.get("id") == profile_id or p.get("profile_name") == profile_id)), None)
    if not profile:
        print(json.dumps({"success": False, "error": f"Không tìm thấy hồ sơ: {profile_id}"}, ensure_ascii=False))
        sys.stdout.flush()
        return

    name = profile.get("profile_name") or profile_id
    profile_dir = profile.get("profile_dir") or name
    proxy = profile.get("proxy") or ""
    fingerprint_seed = profile.get("fingerprint_seed")

    _clean_profile_locks(profile_dir, force_kill_live=True)

    session = CloakSession()
    try:
        page = await session.start(
            profile_name=name,
            proxy=proxy,
            fingerprint_seed=fingerprint_seed,
            profile_dir_name=profile_dir,
            profile_data=profile,
        )

        logger.info("Mở YouTube Studio để kiểm tra bản quyền Content ID...")

        # Hàm trích xuất bảng video từ DOM hiện tại (hỗ trợ cả tab Videos và Shorts)
        async def extract_table_rows():
            return await page.evaluate("""() => {
                const results = {};
                const rows = document.querySelectorAll('ytcp-video-row');
                rows.forEach(row => {
                    let vid = '';
                    // 1. Thử lấy video ID từ liên kết edit hoặc shorts
                    const link = row.querySelector('a[href*="/video/"]');
                    if (link) {
                        const m = link.getAttribute('href').match(/\\/video\\/([^\\/\\?]+)/);
                        if (m) vid = m[1];
                    }
                    if (!vid) {
                        const linkShort = row.querySelector('a[href*="/shorts/"]');
                        if (linkShort) {
                            const m = linkShort.getAttribute('href').match(/\\/shorts\\/([^\\/\\?]+)/);
                            if (m) vid = m[1];
                        }
                    }
                    if (!vid) {
                        const linkYt = row.querySelector('a[href*="youtu.be/"]');
                        if (linkYt) {
                            const m = linkYt.getAttribute('href').match(/youtu\\.be\\/([^\\/\\?]+)/);
                            if (m) vid = m[1];
                        }
                    }
                    if (!vid) {
                        vid = row.getAttribute('video-id') || '';
                    }

                    const titleEl = row.querySelector('#video-title, .video-title-text, #title');
                    const title = titleEl ? (titleEl.innerText || titleEl.textContent || '').trim() : '';

                    // 2. Tìm cột Hạn chế (Restrictions) đa năng
                    const restrCell = row.querySelector(
                        '#restrictions, ytcp-table-cell-restrictions, .tablecell-restrictions, .table-cell-restrictions, [cell-id="restrictions"], .restrictions-column'
                    );
                    let restrictions = '';
                    if (restrCell) {
                        const badge = restrCell.querySelector('yt-formatted-string, .restriction-text, yt-button-shape, button');
                        restrictions = badge ? (badge.innerText || badge.textContent || '').trim() : (restrCell.innerText || restrCell.textContent || '').trim();
                    }

                    // 3. Tìm cột Kiếm tiền (Monetization)
                    const monetCell = row.querySelector(
                        '#monetization, ytcp-table-cell-monetization, .tablecell-monetization, .table-cell-monetization, [cell-id="monetization"]'
                    );
                    let monetization = '';
                    if (monetCell) {
                        monetization = (monetCell.innerText || monetCell.textContent || '').trim();
                    }

                    if (vid) {
                        results[vid] = { title, restrictions, monetization };
                    }
                });
                return results;
            }""")

        # Bước 1: Mở YouTube Studio và điều hướng chính xác vào tab Content (Nội dung)
        logger.info("Mở YouTube Studio để kiểm tra bản quyền Content ID...")
        await page.goto("https://studio.youtube.com/", timeout=45000)
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=15000)
        except Exception:
            pass
        await asyncio.sleep(3.0)

        # Kiểm tra nếu profile chưa đăng nhập Google/YouTube Studio (bị chuyển hướng sang trang đăng nhập)
        curr_url_check = page.url.lower()
        if any(sig in curr_url_check for sig in ["accounts.google.com", "servicelogin", "signin", "v3/signin"]):
            err_msg = (
                "Hồ sơ trình duyệt chưa đăng nhập YouTube Studio. "
                "Vui lòng vào 'Quản lý Profile' hoặc bấm biểu tượng mở trình duyệt trên Kênh Test "
                "để đăng nhập tài khoản Google/YouTube Studio trước khi quét bản quyền."
            )
            logger.error(err_msg)
            print(json.dumps({"success": False, "error": err_msg, "not_logged_in": True}, ensure_ascii=False))
            sys.stdout.flush()
            return

        # Đảm bảo điều hướng vào trang Content (Videos)
        if "/videos" not in page.url:
            try:
                content_link = page.locator("a[href*='/videos']").first
                if await content_link.is_visible(timeout=5000):
                    await content_link.click()
                    await asyncio.sleep(4.0)
                else:
                    curr_url = page.url.split("?")[0].rstrip("/")
                    target_url = f"{curr_url}/videos/upload" if "/channel/" in curr_url else "https://studio.youtube.com/videos/upload"
                    await page.goto(target_url, timeout=25000)
                    await asyncio.sleep(4.0)
            except Exception as exc:
                logger.warning("Không điều hướng được qua content_link: %s", exc)

        dom_results = await extract_table_rows()
        logger.info("Quét tab Videos: tìm thấy %d video", len(dom_results))

        # Bước 2: Nếu có target_ids chưa tìm thấy, quét tiếp tab Shorts (vì video ngắn tự động vào Shorts)
        target_ids = list(video_ids) if video_ids else []
        missing_ids = [vid for vid in target_ids if vid not in dom_results]

        if missing_ids or not target_ids:
            logger.info("Kiểm tra tab Shorts trên YouTube Studio...")
            try:
                shorts_tab = page.locator('tp-yt-paper-tab, [role="tab"]').filter(has_text="Shorts").first
                if await shorts_tab.is_visible(timeout=3000):
                    await shorts_tab.click()
                    await asyncio.sleep(3.5)
                    shorts_results = await extract_table_rows()
                    logger.info("Quét tab Shorts: tìm thấy %d video", len(shorts_results))
                    dom_results.update(shorts_results)
                else:
                    await page.goto("https://studio.youtube.com/videos/short", timeout=20000)
                    await asyncio.sleep(3.5)
                    shorts_results = await extract_table_rows()
                    dom_results.update(shorts_results)
            except Exception as exc:
                logger.warning("Không thể chuyển sang tab Shorts: %s", exc)

        # Bước 3: Nếu vẫn chưa thấy video, kiểm tra trực tiếp qua trang chi tiết video (/video/<id>/edit)
        missing_ids = [vid for vid in target_ids if vid not in dom_results]
        for vid in missing_ids:
            logger.info("Quét trang chi tiết trực tiếp cho video ID: %s", vid)
            try:
                await page.goto(f"https://studio.youtube.com/video/{vid}/edit", timeout=25000)
                await asyncio.sleep(4.0)
                detail_info = await page.evaluate("""() => {
                    const titleEl = document.querySelector('#title-textarea #textbox, [aria-label*="Title" i], #textbox');
                    const title = titleEl ? (titleEl.innerText || titleEl.textContent || '').trim() : '';

                    // Quét các thành phần hạn chế / checks
                    const textAll = (document.body.innerText || '').toLowerCase();
                    let restr = '';
                    if (textAll.includes('checks complete. no issues found') || textAll.includes('no issues found')) {
                        restr = 'None';
                    } else if (textAll.includes('copyright-protected content') || textAll.includes('copyright claim') || textAll.includes('khiếu nại bản quyền')) {
                        restr = 'Copyright';
                    } else if (textAll.includes('checking') || textAll.includes('đang kiểm tra') || textAll.includes('checks in progress')) {
                        restr = 'Checking';
                    }
                    return { title, restrictions: restr, monetization: '' };
                }""")
                if detail_info.get("restrictions"):
                    dom_results[vid] = detail_info
            except Exception as exc:
                logger.warning("Không quét được trang chi tiết video %s: %s", vid, exc)

        target_ids = list(video_ids) if video_ids else list(dom_results.keys())
        classified = {}
        for vid in target_ids:
            found = dom_results.get(vid)
            if not found:
                classified[vid] = {
                    "bkt_check_status": "pending",
                    "bkt_restriction": "Chưa tìm thấy video trên bảng Studio (YouTube đang tải/xử lý)",
                    "monetization": None,
                }
                continue

            restr = (found.get("restrictions") or "").lower()
            monet = (found.get("monetization") or "").lower()

            # 1. Đang kiểm tra
            if any(k in restr for k in ["checking", "đang kiểm tra", "processing", "đang xử lý", "min left", "phút còn lại"]):
                classified[vid] = {
                    "bkt_check_status": "pending",
                    "bkt_restriction": found.get("restrictions") or "YouTube đang kiểm tra bản quyền (Checking...)",
                    "monetization": found.get("monetization"),
                }
            # 2. Dính bản quyền Content ID / Bị chặn
            elif any(k in restr for k in ["copyright", "bản quyền", "blocked", "bị chặn", "terms", "chính sách", "khiếu nại", "claim", "protected"]):
                classified[vid] = {
                    "bkt_check_status": "red_matched",
                    "bkt_restriction": found.get("restrictions") or "Dính bản quyền Content ID (Copyright Claim)",
                    "monetization": found.get("monetization"),
                }
            # 3. Sạch bản quyền: YouTube hiển thị 'None', 'Không có', hoặc dấu gạch ngang '—'
            elif any(restr == m or m in restr for m in ["none", "không có", "không", "no issues found", "clean", "—", "–", "-"]):
                if any(m in monet for m in ["limited", "hạn chế", "giới hạn"]):
                    classified[vid] = {
                        "bkt_check_status": "red_matched",
                        "bkt_restriction": "Kiếm tiền bị hạn chế (Limited Monetization)",
                        "monetization": found.get("monetization"),
                    }
                elif any(m in monet for m in ["ineligible", "không đủ điều kiện"]):
                    classified[vid] = {
                        "bkt_check_status": "red_matched",
                        "bkt_restriction": "Không đủ điều kiện kiếm tiền do chính sách/bản quyền",
                        "monetization": found.get("monetization"),
                    }
                else:
                    classified[vid] = {
                        "bkt_check_status": "green_clean",
                        "bkt_restriction": "None / — (Sạch bản quyền, an toàn)",
                        "monetization": found.get("monetization") or "On",
                    }
            else:
                classified[vid] = {
                    "bkt_check_status": "pending",
                    "bkt_restriction": found.get("restrictions") or "Đang chờ YouTube cập nhật",
                    "monetization": found.get("monetization"),
                }

        duration = time.time() - t0
        print(json.dumps({"success": True, "results": classified}, ensure_ascii=False))
        sys.stdout.flush()

        record_run(
            profile_id=profile_id,
            profile_name=profile.get("name", profile_id),
            action="check_copyright",
            status="success",
            duration_seconds=duration,
        )
    except Exception as exc:
        duration = time.time() - t0
        logger.error(f"Lỗi kiểm tra bản quyền: {exc}", exc_info=True)
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
        sys.stdout.flush()
        record_run(
            profile_id=profile_id,
            profile_name=profile.get("name", profile_id),
            action="check_copyright",
            status="error",
            duration_seconds=duration,
            error=str(exc),
        )
    finally:
        await session.close()


def action_hunt_outliers(args):
    try:
        from outlier_hunter import hunt_niche_outliers
        raw_data = {}
        if args.data_b64:
            raw_data = json.loads(base64.b64decode(args.data_b64).decode("utf-8"))
        elif args.data:
            raw_data = json.loads(args.data)
        
        settings = raw_data.get("settings") or {}
        target_niche = (raw_data.get("target_niche") or "").strip()

        logger.info(f"Yêu cầu săn video đột biến cho ngách: '{target_niche or 'TOÀN BỘ NGÁCH NGON IKIGAI'}'")
        all_discovered = hunt_niche_outliers(target_niche, settings)
        logger.info(f"Tìm thấy tổng cộng: {len(all_discovered)} video bứt phá")

        print(json.dumps({"success": True, "discovered_videos": all_discovered}, ensure_ascii=True))
        sys.stdout.flush()
    except Exception as e:
        logger.error(f"Lỗi action_hunt_outliers: {e}")
        print(json.dumps({"success": False, "error": str(e), "discovered_videos": []}, ensure_ascii=True))
        sys.stdout.flush()


def action_ping_momentum(args):
    try:
        from outlier_hunter import ping_momentum_videos
        raw_data = {}
        if args.data_b64:
            raw_data = json.loads(base64.b64decode(args.data_b64).decode("utf-8"))
        elif args.data:
            raw_data = json.loads(args.data)

        videos = raw_data.get("videos") or []
        updated = ping_momentum_videos(videos)
        print(json.dumps({"success": True, "updated_videos": updated}, ensure_ascii=True))
        sys.stdout.flush()
    except Exception as e:
        logger.error(f"Lỗi action_ping_momentum: {e}")
        print(json.dumps({"success": False, "error": str(e), "updated_videos": []}, ensure_ascii=True))
        sys.stdout.flush()


def action_find_goldmines(args):
    try:
        from outlier_hunter import find_goldmines
        raw_data = {}
        if args.data_b64:
            raw_data = json.loads(base64.b64decode(args.data_b64).decode("utf-8"))
        elif args.data:
            raw_data = json.loads(args.data)

        seed = raw_data.get("seed_keyword") or ""
        results = find_goldmines(seed)
        print(json.dumps({"success": True, "keywords": results}, ensure_ascii=True))
        sys.stdout.flush()
    except Exception as e:
        logger.error(f"Lỗi action_find_goldmines: {e}")
        print(json.dumps({"success": False, "error": str(e), "keywords": []}, ensure_ascii=True))
        sys.stdout.flush()


def action_analyze_hook(args):
    try:
        from outlier_hunter import analyze_video_hook_and_transcript
        raw_data = {}
        if args.data_b64:
            raw_data = json.loads(base64.b64decode(args.data_b64).decode("utf-8"))
        elif args.data:
            raw_data = json.loads(args.data)

        video_id = raw_data.get("video_id") or ""
        results = analyze_video_hook_and_transcript(video_id)
        print(json.dumps(results, ensure_ascii=True))
        sys.stdout.flush()
    except Exception as e:
        logger.error(f"Lỗi action_analyze_hook: {e}")
        print(json.dumps({
            "success": False,
            "error": str(e),
            "has_transcript": False,
            "hook_30s": "",
            "full_transcript_preview": f"Lỗi phân tích: {e}",
            "key_points": []
        }, ensure_ascii=True))
        sys.stdout.flush()


def action_analyze_competitor(args):
    try:
        from outlier_hunter import analyze_competitor_channel
        raw_data = {}
        if args.data_b64:
            raw_data = json.loads(base64.b64decode(args.data_b64).decode("utf-8"))
        elif args.data:
            raw_data = json.loads(args.data)

        channel_url = raw_data.get("channel_url") or ""
        sort_by = raw_data.get("sort_by") or "popular"
        results = analyze_competitor_channel(channel_url, sort_by=sort_by)
        print(json.dumps({"success": True, "videos": results}, ensure_ascii=True))
        sys.stdout.flush()
    except Exception as e:
        logger.error(f"Lỗi action_analyze_competitor: {e}")
        print(json.dumps({"success": False, "error": str(e), "videos": []}, ensure_ascii=True))
        sys.stdout.flush()


def main():
    parser = argparse.ArgumentParser(description="RETubeMatrix Browser Engine Runner")
    parser.add_argument("--action", required=True, choices=[
        "list_profiles",
        "add_profile",
        "update_profile",
        "delete_profile",
        "test_proxy",
        "open_profile",
        "upload_video",
        "check_copyright_status",
        "get_stats",
        "stop_profile",
        "bulk_stop",
        "arrange_windows",
        "clean_cache",
        "update_profile_meta",
        "bulk_set_group",
        "hunt_outliers",
        "ping_momentum",
        "find_goldmines",
        "analyze_hook",
        "analyze_competitor",
    ])
    parser.add_argument("--profile-id", default="")
    parser.add_argument("--target-url", default="")
    parser.add_argument("--data", default="")
    parser.add_argument("--data-b64", default="")

    args = parser.parse_args()

    if args.action == "list_profiles":
        action_list_profiles()
    elif args.action == "add_profile":
        action_add_profile(args)
    elif args.action == "update_profile":
        action_update_profile(args)
    elif args.action == "delete_profile":
        action_delete_profile(args)
    elif args.action == "test_proxy":
        action_test_proxy(args)
    elif args.action == "open_profile":
        target_url = getattr(args, "target_url", None)
        asyncio.run(_async_open_profile(args.profile_id, target_url=target_url))
    elif args.action == "upload_video":
        asyncio.run(_async_upload_video(args))
    elif args.action == "check_copyright_status":
        asyncio.run(_async_check_copyright_status(args))
    elif args.action == "get_stats":
        action_get_stats()
    elif args.action == "stop_profile":
        action_stop_profile(args)
    elif args.action == "bulk_stop":
        action_bulk_stop(args)
    elif args.action == "arrange_windows":
        action_arrange_windows(args)
    elif args.action == "clean_cache":
        action_clean_cache(args)
    elif args.action == "update_profile_meta":
        action_update_profile_meta(args)
    elif args.action == "bulk_set_group":
        action_bulk_set_group(args)
    elif args.action == "hunt_outliers":
        action_hunt_outliers(args)
    elif args.action == "ping_momentum":
        action_ping_momentum(args)
    elif args.action == "find_goldmines":
        action_find_goldmines(args)
    elif args.action == "analyze_hook":
        action_analyze_hook(args)
    elif args.action == "analyze_competitor":
        action_analyze_competitor(args)


if __name__ == "__main__":
    main()
