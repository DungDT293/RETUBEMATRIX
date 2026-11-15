import ast
import importlib
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
ENGINE_ROOT = REPO_ROOT / "browser_engine"
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))


class BktSafetyRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runner = importlib.import_module("runner")
        cls.bkt = importlib.import_module("actions.bkt_check")
        cls.upload = importlib.import_module("actions.upload_actions")
        cls.channel = importlib.import_module("actions.channel_settings")

    def test_upload_rescue_requires_verified_video_row_id(self):
        self.assertIsNone(self.upload._verified_video_url_from_row({"title": "target"}))
        self.assertIsNone(self.upload._verified_video_url_from_row({"vid": "short-id", "title": "target"}))
        self.assertEqual(
            self.upload._verified_video_url_from_row({"vid": "ABCDEFGHIJK", "title": "target"}),
            "https://youtu.be/ABCDEFGHIJK",
        )

    def test_bkt_handoff_requires_an_eleven_character_youtube_id(self):
        self.assertIsNone(self.runner._extract_verified_youtube_id("https://youtu.be/short"))
        self.assertIsNone(self.runner._extract_verified_youtube_id("https://evil.example/?v=ABCDEFGHIJK"))
        self.assertEqual(
            self.runner._extract_verified_youtube_id("https://youtu.be/ABCDEFGHIJK?x=1"),
            "ABCDEFGHIJK",
        )
        self.assertEqual(
            self.runner._extract_verified_youtube_id("https://www.youtube.com/watch?v=ABCDEFGHIJK"),
            "ABCDEFGHIJK",
        )

    def test_unidentified_rows_remain_pending_instead_of_selecting_first_row(self):
        self.assertEqual(
            self.bkt._target_ids_without_identity([], ""),
            ["__pending_new_row__"],
        )
        self.assertEqual(
            self.bkt._target_ids_without_identity(
                [
                    {"vid": "ABCDEFGHIJK", "title": "same title"},
                    {"vid": "LMNOPQRSTUV", "title": "same title"},
                ],
                "same title",
            ),
            ["__pending_new_row__"],
        )
        self.assertEqual(
            self.bkt._target_ids_without_identity(
                [{"vid": "ABCDEFGHIJK", "title": "same title"}],
                "same title",
            ),
            ["ABCDEFGHIJK"],
        )

    def test_bkt_timeout_is_explicit_pending_failure(self):
        result = self.bkt._timeout_result("ABCDEFGHIJK", {"ABCDEFGHIJK": {"bkt_check_status": "pending"}})
        self.assertFalse(result["success"])
        self.assertTrue(result["pending"])
        self.assertTrue(result["timed_out"])
        self.assertEqual(result["status"], "timeout")

    def test_requested_audience_is_semantically_selected_and_verified(self):
        self.assertTrue(self.channel._audience_matches("MADE_FOR_KIDS", "", True))
        self.assertFalse(self.channel._audience_matches("NOT_MADE_FOR_KIDS", "", True))
        self.assertTrue(self.channel._audience_matches("", "No, set this channel as not made for kids", False))
        self.assertTrue(self.channel._audience_state_matches({"aria_checked": "true", "name": "MADE_FOR_KIDS"}, True))
        self.assertFalse(self.channel._audience_state_matches({"aria_checked": "true", "name": "NOT_MADE_FOR_KIDS"}, True))

    def test_timeout_result_does_not_mark_profile_success(self):
        self.assertEqual(self.runner._terminal_status_from_result({"success": False, "timed_out": True}), "error")
        self.assertEqual(self.runner._terminal_status_from_result({"success": True}), "success")

    def test_share_dialog_alone_cannot_finish_standalone_upload(self):
        source = (REPO_ROOT / "browser_engine" / "actions" / "upload_actions.py").read_text(encoding="utf-8")
        self.assertNotIn(
            '(is_share_dlg and not is_popup and percent is None and (time.time() - upload_poll_start >= 3))',
            source,
        )
        self.assertIn('upload_stream_finished = True', source)
        self.assertIn('if not upload_stream_finished:', source)
        self.assertIn('không bàn giao URL cứu hộ', source)
        self.assertNotIn('return rescued_url', source)
        self.assertNotIn('navigate_to_channel_content(', source)
        self.assertNotIn('time.time() - upload_poll_start > 180', source)
        self.assertNotIn("ytcp-badge [role=\\\"progressbar\\\"]", source)
        self.assertNotIn(", tp-yt-paper-progress');", source)
        self.assertNotIn("'ytcp-dialog, tp-yt-paper-dialog", source)
        self.assertNotIn("'.progress-label, #progress-label'", source)
        self.assertIn("'ytcp-uploads-dialog, ytcp-uploads-still-processing-dialog, ytcp-video-upload-progress'", source)
        self.assertIn('Upload stream đã hoàn tất nhưng chưa xác minh được URL/ID video', source)
        self.assertIn('verified_url = _verified_video_url_from_row({"videoUrl": video_url})', source)

    def test_unresolved_non_polling_result_is_pending_not_success(self):
        result = self.bkt._pending_result("ABCDEFGHIJK", {"__pending_new_row__": {"bkt_check_status": "pending"}})
        self.assertFalse(result["success"])
        self.assertTrue(result["pending"])
        self.assertEqual(result["status"], "pending")

    def test_rescue_refuses_ambiguous_title_rows(self):
        rows = [
            {"vid": "ABCDEFGHIJK", "title": "target"},
            {"vid": "LMNOPQRSTUV", "title": "target"},
        ]
        self.assertIsNone(self.upload._unique_verified_video_url(rows, "target"))
        self.assertEqual(
            self.upload._unique_verified_video_url([rows[0]], "target"),
            "https://youtu.be/ABCDEFGHIJK",
        )

    def test_upload_stream_completion_logic(self):
        # 1. Khi percent < 100, tuyệt đối không được coi là hoàn tất kể cả khi DOM có thông báo dự báo
        premature_text = "Video của bạn vẫn đang được tải lên và quá trình xử lý sẽ sớm bắt đầu... Quá trình kiểm tra sẽ sớm bắt đầu"
        self.assertFalse(self.upload.is_upload_stream_complete(15, premature_text))
        self.assertFalse(self.upload.is_upload_stream_complete(99, premature_text))
        self.assertFalse(self.upload.is_upload_stream_complete(0, "processing will begin"))

        # 2. Khi percent >= 100, hoàn tất
        self.assertTrue(self.upload.is_upload_stream_complete(100, ""))
        self.assertTrue(self.upload.is_upload_stream_complete(100, premature_text))

        # 3. Khi percent là None, chỉ chấp nhận các tín hiệu dứt khoát của YouTube server
        self.assertFalse(self.upload.is_upload_stream_complete(None, premature_text))
        self.assertFalse(self.upload.is_upload_stream_complete(None, "đang kiểm tra"))
        self.assertTrue(self.upload.is_upload_stream_complete(None, "Đã hoàn tất quá trình tải lên. Đang xử lý SD..."))
        self.assertTrue(self.upload.is_upload_stream_complete(None, "Upload complete. Processing SD version..."))
        self.assertTrue(self.upload.is_upload_stream_complete(None, "checks complete"))

    def test_bkt_upload_path_does_not_rescue_by_leaving_upload_session(self):
        source = (REPO_ROOT / "browser_engine" / "runner.py").read_text(encoding="utf-8")
        start = source.index("async def _async_bkt_unified_pipeline")
        end = source.index("async def ", start + 10)
        bkt_source = source[start:end]
        self.assertNotIn("Kích hoạt kiểm tra cứu hộ BKT Pipeline", bkt_source)
        self.assertIn("handover_after_save=True", bkt_source)

    def test_independent_upload_path_calls_strict_id_validator(self):
        tree = ast.parse((REPO_ROOT / "browser_engine" / "runner.py").read_text(encoding="utf-8"))
        upload_fn = next(node for node in ast.walk(tree) if isinstance(node, ast.AsyncFunctionDef) and node.name == "_async_upload_video")
        calls = {
            call.func.id
            for call in ast.walk(upload_fn)
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Name)
        }
        self.assertIn("_extract_verified_youtube_id", calls)

    def test_open_profile_records_stopped_after_normal_close(self):
        tree = ast.parse((REPO_ROOT / "browser_engine" / "runner.py").read_text(encoding="utf-8"))
        open_fn = next(node for node in ast.walk(tree) if isinstance(node, ast.AsyncFunctionDef) and node.name == "_async_open_profile")
        stopped_calls = [
            call for call in ast.walk(open_fn)
            if isinstance(call, ast.Call)
            and isinstance(call.func, ast.Name)
            and call.func.id == "update_profile"
            and any(
                isinstance(kw.value, ast.Constant) and kw.value.value == "stopped"
                for kw in call.keywords
                if kw.arg == "last_run_status"
            )
        ]
        self.assertTrue(stopped_calls)

    def test_terminal_run_status_is_not_replaced_by_stopped(self):
        tree = ast.parse((REPO_ROOT / "browser_engine" / "runner.py").read_text(encoding="utf-8"))
        names = {"_async_upload_video", "_async_bkt_unified_pipeline", "_async_check_copyright_status"}
        for node in ast.walk(tree):
            if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name in names:
                for call in ast.walk(node):
                    if isinstance(call, ast.Call) and isinstance(call.func, ast.Name) and call.func.id == "update_profile":
                        self.assertFalse(
                            any(
                                isinstance(kw.value, ast.Constant) and kw.value.value == "stopped"
                                for kw in call.keywords
                                if kw.arg == "last_run_status"
                            ),
                            f"{node.name} overwrites terminal status",
                        )

    def test_source_and_runtime_mirrors_are_byte_identical(self):
        for relative in (
            "runner.py",
            "actions/bkt_check.py",
            "actions/channel_settings.py",
            "actions/upload_actions.py",
        ):
            self.assertEqual(
                (REPO_ROOT / "browser_engine" / relative).read_bytes(),
                (REPO_ROOT / "roots" / "browsermulti" / relative).read_bytes(),
                relative,
            )


if __name__ == "__main__":
    unittest.main()
