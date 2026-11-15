import importlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ENGINE_ROOT = Path(__file__).resolve().parents[1]
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))


class StructuredRunHistoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.data_root = Path(self.tmp_dir.name) / "browser_engine"
        self.env_patch = mock.patch.dict(
            os.environ,
            {"RETUBEMATRIX_BROWSER_DATA_DIR": str(self.data_root)},
        )
        self.env_patch.start()
        if "core.run_history" in sys.modules:
            del sys.modules["core.run_history"]
        import core.run_history as run_history

        self.rh = importlib.reload(run_history)

    def tearDown(self) -> None:
        self.env_patch.stop()
        self.tmp_dir.cleanup()

    def test_record_run_writes_diagnostic_fields(self) -> None:
        self.rh.record_run(
            profile_id="profile-1",
            profile_name="Test",
            action="bkt_unified",
            status="error",
            duration_seconds=1.25,
            error="Network timeout while checking copyright",
            session_id="trace-1",
        )

        record = json.loads(self.rh.RUN_HISTORY_FILE.read_text(encoding="utf-8"))
        self.assertEqual(record["trace_id"], "trace-1")
        self.assertEqual(record["feature"], "bkt_test")
        self.assertEqual(record["operation"], "bkt_check")
        self.assertEqual(record["stage"], "error")
        self.assertEqual(record["error_code"], "NETWORK_TIMEOUT")
        self.assertTrue(record["retryable"])
        self.assertEqual(record["duration_ms"], 1250)

    def test_record_run_redacts_sensitive_error_values(self) -> None:
        self.rh.record_run(
            profile_id="profile-1",
            profile_name="Test",
            action="upload",
            status="error",
            duration_seconds=0,
            error="token=secret cookie: abc password=hunter2",
        )

        record = json.loads(self.rh.RUN_HISTORY_FILE.read_text(encoding="utf-8"))
        self.assertNotIn("secret", record["error"])
        self.assertNotIn("abc", record["error"])
        self.assertNotIn("hunter2", record["error"])
        self.assertIn("[REDACTED]", record["error"])
        self.assertRegex(record["trace_id"], r"^[0-9a-f-]{36}$")

    def test_record_run_redacts_whitespace_and_authorization_credentials(self) -> None:
        self.rh.record_run(
            profile_id="profile-1",
            profile_name="Test",
            action="upload",
            status="error",
            duration_seconds=0,
            error="token plain-secret cookie cookie-secret password pass-secret authorization auth-secret authorization Bearer bearer-secret",
        )

        record = json.loads(self.rh.RUN_HISTORY_FILE.read_text(encoding="utf-8"))
        for secret in ("plain-secret", "cookie-secret", "pass-secret", "auth-secret", "bearer-secret"):
            self.assertNotIn(secret, record["error"])
        self.assertIn("[REDACTED]", record["error"])

    def test_record_run_redacts_json_and_bearer_credentials(self) -> None:
        self.rh.record_run(
            profile_id="profile-1",
            profile_name="Test",
            action="upload",
            status="error",
            duration_seconds=0,
            error='{"access_token":"json-secret","api_key":"key-secret"} Authorization: Bearer bearer-secret',
        )

        record = json.loads(self.rh.RUN_HISTORY_FILE.read_text(encoding="utf-8"))
        self.assertNotIn("json-secret", record["error"])
        self.assertNotIn("key-secret", record["error"])
        self.assertNotIn("bearer-secret", record["error"])
        self.assertIn("[REDACTED]", record["error"])

    def test_success_run_has_no_error_code(self) -> None:
        self.rh.record_run(
            profile_id="profile-1",
            profile_name="Test",
            action="upload",
            status="success",
            duration_seconds=2,
        )

        record = json.loads(self.rh.RUN_HISTORY_FILE.read_text(encoding="utf-8"))
        self.assertEqual(record["feature"], "upload")
        self.assertEqual(record["operation"], "upload")
        self.assertEqual(record["stage"], "complete")
        self.assertIsNone(record["error_code"])
        self.assertFalse(record["retryable"])


if __name__ == "__main__":
    unittest.main()
