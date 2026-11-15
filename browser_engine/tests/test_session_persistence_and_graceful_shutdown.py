import asyncio
import importlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

def _find_repo_root(start: Path) -> Path:
    cur = start
    for _ in range(6):
        if (cur / "package.json").is_file():
            return cur
        cur = cur.parent
    return start.parent

REPO_ROOT = _find_repo_root(Path(__file__).resolve())
ENGINE_ROOT = REPO_ROOT / "browser_engine"
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))


class SessionPersistenceAndGracefulShutdownTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp_dir.name)
        self.data_root = self.base / "RETubeMatrixData" / "browser_engine"
        self.env_patch = mock.patch.dict(
            os.environ,
            {"RETUBEMATRIX_BROWSER_DATA_DIR": str(self.data_root)},
        )
        self.env_patch.start()

        import core.window_icon_badge as wib_mod
        import core.browser as browser_mod
        import runner as runner_mod
        import core.engines.browsermulti_engine as bme_mod
        import core.engines.cloakbrowser_engine as cbe_mod
        from core.engines.base import BrowserLaunchSpec

        self.wib_mod = wib_mod
        self.browser_mod = browser_mod
        self.runner_mod = runner_mod
        self.bme_mod = bme_mod
        self.cbe_mod = cbe_mod
        self.BrowserLaunchSpec = BrowserLaunchSpec

    def tearDown(self) -> None:
        self.env_patch.stop()
        self.tmp_dir.cleanup()

    def test_user_data_dir_from_cmdline_supports_both_forms(self) -> None:
        cmd1 = ["chrome.exe", "--user-data-dir=C:\\Profiles\\Test1", "--lang=en"]
        self.assertEqual(self.wib_mod._user_data_dir_from_cmdline(cmd1), "C:\\Profiles\\Test1")

        cmd2 = ["browsermulti.exe", "--no-sandbox", "--user-data-dir", "C:\\Profiles\\Test2", "--lang=vi"]
        self.assertEqual(self.wib_mod._user_data_dir_from_cmdline(cmd2), "C:\\Profiles\\Test2")

    def test_is_chromium_process_name_covers_all_variants(self) -> None:
        self.assertTrue(self.wib_mod._is_chromium_process_name("chrome.exe"))
        self.assertTrue(self.wib_mod._is_chromium_process_name("chromium.exe"))
        self.assertTrue(self.wib_mod._is_chromium_process_name("browsermulti.exe"))
        self.assertTrue(self.wib_mod._is_chromium_process_name("cloak.exe"))
        self.assertTrue(self.wib_mod._is_chromium_process_name(r"C:\Program Files\BrowserMulti\browsermulti.exe"))
        self.assertFalse(self.wib_mod._is_chromium_process_name("notepad.exe"))
        self.assertFalse(self.wib_mod._is_chromium_process_name("python.exe"))

    def test_automation_actions_never_force_kill_live_profile(self) -> None:
        import inspect

        for action_name in (
            "_async_upload_video",
            "_async_bkt_unified_pipeline",
            "_async_check_copyright_status",
            "_async_configure_channel_settings",
        ):
            action_source = inspect.getsource(getattr(self.runner_mod, action_name))
            self.assertNotIn("force_kill_live=True", action_source, action_name)

    def test_session_start_never_kills_live_profile_without_visible_window(self) -> None:
        session = self.browser_mod.CloakSession()
        profile_dir = self.data_root / "profiles" / "live_hidden"
        profile_dir.mkdir(parents=True, exist_ok=True)

        with mock.patch.object(self.browser_mod, "chrome_pids_for_user_data_dir", return_value=[9999]):
            with mock.patch.object(self.browser_mod.psutil, "Process") as process:
                with self.assertRaisesRegex(RuntimeError, "không tự động dừng"):
                    asyncio.run(session.start("live_hidden"))
                process.assert_not_called()

    def test_clean_profile_locks_does_not_unlink_if_process_alive(self) -> None:
        pdir = self.data_root / "profiles" / "test_prof"
        pdir.mkdir(parents=True, exist_ok=True)
        lock_file = pdir / "SingletonLock"
        lock_file.write_text("1234", encoding="utf-8")

        with mock.patch("core.window_icon_badge.chrome_pids_for_user_data_dir", return_value=[9999]), \
             mock.patch("core.engines.browsermulti_native.graceful_terminate_pids") as terminate:
            self.runner_mod._clean_profile_locks("test_prof", force_kill_live=False)
            terminate.assert_not_called()
            self.assertTrue(lock_file.exists())

        with mock.patch("core.window_icon_badge.chrome_pids_for_user_data_dir", return_value=[]):
            self.runner_mod._clean_profile_locks("test_prof", force_kill_live=False)
            self.assertFalse(lock_file.exists())

    def test_clean_profile_cache_dir_never_touches_service_worker_or_blob_storage(self) -> None:
        pdir = self.data_root / "profiles" / "cache_test"
        def_dir = pdir / "Default"
        sw_cache = def_dir / "Service Worker" / "CacheStorage"
        sw_script = def_dir / "Service Worker" / "ScriptCache"
        blob_dir = def_dir / "blob_storage"
        regular_cache = def_dir / "Cache"
        gpu_cache = def_dir / "GPUCache"

        for d in (sw_cache, sw_script, blob_dir, regular_cache, gpu_cache):
            d.mkdir(parents=True, exist_ok=True)
            (d / "data.bin").write_bytes(b"x" * 1024)

        with mock.patch("core.window_icon_badge.chrome_pids_for_user_data_dir", return_value=[]):
            freed = self.runner_mod._clean_profile_cache_dir(pdir)

        self.assertGreater(freed, 0)
        self.assertTrue(sw_cache.exists())
        self.assertTrue((sw_cache / "data.bin").exists())
        self.assertTrue(sw_script.exists())
        self.assertTrue(blob_dir.exists())
        self.assertFalse(regular_cache.exists())
        self.assertFalse(gpu_cache.exists())

    def test_ensure_google_search_provider_atomic_and_safe(self) -> None:
        pdir = self.data_root / "profiles" / "pref_test"
        def_dir = pdir / "Default"
        def_dir.mkdir(parents=True, exist_ok=True)
        pref_file = def_dir / "Preferences"
        pref_file.write_text('{"account_id": "google_123", "session": {"tokens": "abc"}}', encoding="utf-8")

        ok = self.browser_mod.ensure_google_search_provider(pdir)
        self.assertTrue(ok)
        self.assertTrue((def_dir / "Preferences.bak").exists())

        data = json.loads(pref_file.read_text(encoding="utf-8"))
        self.assertEqual(data["account_id"], "google_123")
        self.assertEqual(data["session"]["tokens"], "abc")
        self.assertIn("default_search_provider", data)

    def test_browsermulti_engine_missing_binary_fails_closed(self) -> None:
        engine = self.bme_mod.BrowserMultiEngine(
            binary_path=self.base / "missing-browsermulti.exe",
            runtime_version="1.0.0",
        )
        with self.assertRaises(self.bme_mod.BrowserEngineUnavailableError):
            engine._load_launcher()

    def test_browsermulti_engine_preserves_spec_locale(self) -> None:
        engine = self.bme_mod.BrowserMultiEngine(runtime_version="1.0.0")
        spec = self.BrowserLaunchSpec(
            user_data_dir=self.base / "prof",
            headless=False,
            proxy=None,
            locale="en-US",
            timezone="America/New_York",
            window_width=800,
            window_height=600,
            window_x=0,
            window_y=0,
            mute_audio=False,
            viewport=None,
            engine_options={},
        )
        args = engine.build_launch_args(spec)
        self.assertIn("--lang=en-US", args)
        self.assertNotIn("--lang=vi-VN", args)

    def test_cloakbrowser_engine_includes_webrtc_protection(self) -> None:
        engine = self.cbe_mod.CloakBrowserEngine()
        spec = self.BrowserLaunchSpec(
            user_data_dir=self.base / "prof",
            headless=False,
            proxy=None,
            locale="vi-VN",
            timezone="Asia/Ho_Chi_Minh",
            window_width=800,
            window_height=600,
            window_x=0,
            window_y=0,
            mute_audio=False,
            viewport=None,
            engine_options={},
        )
        args = engine.build_launch_args(spec)
        self.assertIn("--webrtc-ip-handling-policy=disable_non_proxied_udp", args)


if __name__ == "__main__":
    unittest.main()
