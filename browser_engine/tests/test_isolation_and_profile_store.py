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


class IsolationAndProfileStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp_dir.name)
        self.data_root = self.base / "RETubeMatrixData" / "browser_engine"
        self.external_local = self.base / "LocalAppData"
        # Seed simulated external BrowserMulti + reupytb data that must NEVER leak
        for ext_name in ("BrowserMulti", "reupytb"):
            ext_root = self.external_local / ext_name
            (ext_root / "profiles" / "ext_chromium_1").mkdir(parents=True, exist_ok=True)
            (ext_root / "profiles" / "ext_chromium_1" / "Local State").write_text("{}", encoding="utf-8")
            (ext_root / "profiles.json").write_text(
                json.dumps([{"id": f"ext-{ext_name}", "profile_name": f"External {ext_name}"}]),
                encoding="utf-8",
            )

        self.env_patch = mock.patch.dict(
            os.environ,
            {
                "RETUBEMATRIX_BROWSER_DATA_DIR": str(self.data_root),
                "LOCALAPPDATA": str(self.external_local),
            },
        )
        self.env_patch.start()

        import core.paths as paths_mod
        import core.profile_store as ps_mod
        import core.run_history as rh_mod
        import core.overlay_state as os_mod
        import core.ai_comment_settings as acs_mod
        import actions.upload_actions as ua_mod
        import core.window_icon_badge as wib_mod
        import core.engines.browsermulti_engine as bme_mod

        self.paths_mod = importlib.reload(paths_mod)
        self.ps_mod = importlib.reload(ps_mod)
        self.rh_mod = importlib.reload(rh_mod)
        self.os_mod = importlib.reload(os_mod)
        self.acs_mod = importlib.reload(acs_mod)
        self.ua_mod = importlib.reload(ua_mod)
        self.wib_mod = wib_mod
        self.bme_mod = bme_mod

    def tearDown(self) -> None:
        self.env_patch.stop()
        self.tmp_dir.cleanup()

    def test_paths_and_runtime_files_are_strictly_isolated(self) -> None:
        self.assertEqual(self.paths_mod.user_data_root(), self.data_root)
        self.assertEqual(self.paths_mod.legacy_profile_data_roots(), ())
        self.assertEqual(self.paths_mod.profile_data_roots(), (self.data_root,))
        self.assertEqual(self.paths_mod.profile_data_dir("demo"), self.data_root / "profiles" / "demo")

        self.assertEqual(self.rh_mod.RUN_HISTORY_FILE, self.data_root / "logs" / "run_history.jsonl")
        self.assertEqual(self.os_mod._state_path(), self.data_root / ".tmp" / "overlay_state.json")
        self.assertEqual(self.acs_mod._SETTINGS_PATH, self.data_root / "security" / "ai_comment_settings.json")
        self.assertEqual(self.ua_mod.PENDING_COMMENTS_FILE, self.data_root / "pending_comments.jsonl")

        ext_local_norm = str(self.external_local).replace("/", "\\").lower()
        for candidates in self.bme_mod.RUNTIME_MAPPINGS.values():
            for candidate in candidates:
                norm = str(candidate).replace("/", "\\").lower()
                self.assertNotIn(f"{ext_local_norm}\\reupytb", norm)
                self.assertNotIn("\\program files\\reupytb", norm)
                self.assertNotIn(f"{ext_local_norm}\\browsermulti", norm)

    def test_external_browsermulti_or_reupytb_profiles_never_import(self) -> None:
        self.ps_mod._ensure_legacy_profile_migration()
        self.assertEqual(self.ps_mod.load_profiles(), [])

        diag = self.ps_mod.profile_recovery_diagnostics()
        self.assertEqual(len(diag["metadata"]), 1)
        self.assertEqual(diag["recovery_candidates"], [])
        self.assertEqual(self.ps_mod._configured_metadata_roots(self.ps_mod.PROFILES_JSON), ())

    def test_no_stub_dirs_on_add_or_read_and_unique_names(self) -> None:
        row = self.ps_mod.add_profile("Ken Alpha", group="Default")
        p_dir = self.ps_mod.PROFILES_ROOT / row["profile_dir"]
        self.assertFalse(p_dir.exists(), "Adding an unlaunched profile must not materialize empty folders")

        loaded = self.ps_mod.load_profiles()
        self.assertEqual(len(loaded), 1)
        self.assertFalse(p_dir.exists(), "Read-only load_profiles must not create folders or rewrite snapshots")

        with self.assertRaises(self.ps_mod.ProfileConflictError):
            self.ps_mod.add_profile("ken   alpha", group="Default")

    def test_deleted_profile_tombstone_prevents_resurrection(self) -> None:
        row = self.ps_mod.add_profile("ToDelete")
        folder = self.ps_mod.PROFILES_ROOT / row["profile_dir"]
        (folder / "Default").mkdir(parents=True, exist_ok=True)
        (folder / "Local State").write_text("{}", encoding="utf-8")
        self.ps_mod.save_profiles([row])
        self.assertTrue((folder / ".browsermulti-profile.json").is_file())

        self.ps_mod.delete_profile(row["id"])
        # Deleted profile must remain absent even when its Chromium folder & snapshot still exist on disk.
        self.assertEqual(self.ps_mod.load_profiles(), [])

    def test_stub_without_chromium_files_does_not_auto_recover_while_real_chromium_does(self) -> None:
        stub_dir = self.ps_mod.PROFILES_ROOT / "123_517fd019"
        stub_dir.mkdir(parents=True, exist_ok=True)
        (stub_dir / ".browsermulti-profile.json").write_text(
            json.dumps([{"id": "stub-1", "profile_name": "123", "profile_dir": "123_517fd019"}]),
            encoding="utf-8",
        )

        real_dir = self.ps_mod.PROFILES_ROOT / "real_abcd1234"
        real_dir.mkdir(parents=True, exist_ok=True)
        (real_dir / "Local State").write_text("{}", encoding="utf-8")
        (real_dir / ".browsermulti-profile.json").write_text(
            json.dumps([{"id": "real-1", "profile_name": "Real Profile", "profile_dir": "real_abcd1234"}]),
            encoding="utf-8",
        )

        loaded = self.ps_mod.load_profiles()
        loaded_ids = [r["id"] for r in loaded]
        self.assertEqual(loaded_ids, ["real-1"])

    def test_update_bulk_and_restore_conflict_checks(self) -> None:
        r1 = self.ps_mod.add_profile("One Profile")
        r2 = self.ps_mod.add_profile("Two Profile")

        with self.assertRaises(self.ps_mod.ProfileConflictError):
            self.ps_mod.update_profile(r2["id"], profile_name=" one   profile ")

        updated_count = self.ps_mod.bulk_update_profiles({
            r1["id"]: {"group": "BKT", "last_run_status": "stopped"},
            r2["id"]: {"group": "BKT", "last_run_status": "stopped"},
        })
        self.assertEqual(updated_count, 2)
        groups = {p["id"]: p["group"] for p in self.ps_mod.load_profiles()}
        self.assertEqual(groups, {r1["id"]: "BKT", r2["id"]: "BKT"})

        self.ps_mod.delete_profile(r1["id"])
        self.ps_mod.add_profile("one   profile")
        with self.assertRaises(self.ps_mod.ProfileConflictError):
            self.ps_mod.restore_deleted_profile(r1["id"])

    def test_window_icon_badge_exact_path_matching(self) -> None:
        self.assertEqual(self.wib_mod._normalize_user_data_dir(""), "")
        self.assertEqual(self.wib_mod._normalize_user_data_dir(None), "")
        target = str(self.data_root / "profiles" / "alpha")
        norm_target = self.wib_mod._normalize_user_data_dir(target)
        fake_cache = {self.wib_mod._normalize_user_data_dir(r"C:\External\BrowserMulti\profiles\alpha"): [9999]}
        with mock.patch.object(self.wib_mod, "_PROCESS_CACHE", fake_cache):
            self.assertEqual(self.wib_mod.chrome_pids_for_user_data_dir(target), [])
        with mock.patch.object(self.wib_mod, "_PROCESS_CACHE", {norm_target: [4321]}):
            self.assertEqual(self.wib_mod.chrome_pids_for_user_data_dir(target), [4321])

    def test_roots_browsermulti_parity_with_browser_engine(self) -> None:
        roots_engine = REPO_ROOT / "roots" / "browsermulti"
        for rel in ("runner.py", "outlier_hunter.py", "requirements.txt"):
            self.assertEqual(
                (ENGINE_ROOT / rel).read_bytes(),
                (roots_engine / rel).read_bytes(),
                f"Drift detected for {rel}",
            )
        for sub in ("actions", "core"):
            for src_file in sorted((ENGINE_ROOT / sub).rglob("*.py")):
                rel_path = src_file.relative_to(ENGINE_ROOT)
                mirror_file = roots_engine / rel_path
                self.assertTrue(mirror_file.exists(), f"Missing mirror file: {mirror_file}")
                self.assertEqual(src_file.read_bytes(), mirror_file.read_bytes(), f"Drift in {rel_path}")


if __name__ == "__main__":
    unittest.main()
