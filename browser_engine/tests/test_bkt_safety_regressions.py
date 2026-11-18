import ast
import importlib
import sys
import unittest
from pathlib import Path


def _find_repo_root(start: Path) -> Path:
    cur = start
    for _ in range(6):
        if (cur / "package.json").is_file():
            return cur
        cur = cur.parent
    return start.parents[3]


REPO_ROOT = _find_repo_root(Path(__file__).resolve())
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

    def test_blocking_studio_dialogs_dismissal_is_exported(self):
        studio_dom = importlib.import_module("actions.studio_dom")
        self.assertTrue(callable(getattr(studio_dom, "dismiss_blocking_studio_dialogs", None)))
        dom_mod = importlib.import_module("actions.dom")
        self.assertTrue(callable(getattr(dom_mod, "dismiss_blocking_studio_dialogs", None)))
        self.assertIn("inspectAndDismissBlockingDialog", dom_mod.STUDIO_DOM_JS_LIB)
        self.assertIn("bạn đã hoàn tất", dom_mod.STUDIO_DOM_JS_LIB)
        self.assertIn("you're all set", dom_mod.STUDIO_DOM_JS_LIB)
        self.assertIn("hãy thử làm mới trang", dom_mod.STUDIO_DOM_JS_LIB)
        self.assertIn("đã hiểu", dom_mod.STUDIO_DOM_JS_LIB)
        self.assertIn("知道了", dom_mod.STUDIO_DOM_JS_LIB)
        self.assertIn("閉じる", dom_mod.STUDIO_DOM_JS_LIB)
        self.assertIn("assignedNodes", dom_mod.STUDIO_DOM_JS_LIB)

    def test_dismiss_blocking_studio_dialogs_structure_and_reload_target(self):
        dom_mod = importlib.import_module("actions.dom")
        import asyncio

        class DummyLocator:
            def __init__(self, count_val=0):
                self._count = count_val
            @property
            def first(self):
                return self
            async def count(self):
                return self._count
            async def is_visible(self):
                return False
            async def click(self, **kwargs):
                pass

        class DummyPage:
            def __init__(self, cur_url: str):
                self.url = cur_url
                self.navigated_url = None
            def locator(self, sel: str):
                return DummyLocator(0)
            async def evaluate(self, script, arg=None):
                if "__rtmDom" in script:
                    return {
                        "found": True,
                        "clicked": True,
                        "needsReload": True,
                        "isAllSet": True,
                        "buttonText": "Đã hiểu",
                        "sample": "Bạn đã hoàn tất. Hãy thử làm mới trang.",
                    }
                return None
            async def goto(self, url, **kwargs):
                self.navigated_url = url

        # Test reload redirects to channel root (Dashboard), not /videos/upload
        page = DummyPage("https://studio.youtube.com/channel/UC12345/videos/upload")
        res = asyncio.run(dom_mod.dismiss_blocking_studio_dialogs(page, allow_reload=True))
        self.assertTrue(res.get("handled"))
        self.assertTrue(res.get("needsReload"))
        self.assertTrue(res.get("reloaded"))
        self.assertEqual(page.navigated_url, "https://studio.youtube.com/channel/UC12345")

    def test_source_and_runtime_mirrors_are_byte_identical(self):
        for relative in (
            "runner.py",
            "outlier_hunter.py",
            "actions/bkt_check.py",
            "actions/channel_settings.py",
            "actions/upload_actions.py",
            "actions/youtube_actions.py",
            "actions/dom/modals.py",
            "actions/dom/js_lib.py",
        ):
            self.assertEqual(
                (REPO_ROOT / "browser_engine" / relative).read_bytes(),
                (REPO_ROOT / "roots" / "browsermulti" / relative).read_bytes(),
                relative,
            )

    def test_no_local_re_imports_in_browser_engine_and_roots(self):
        """Regression test: Ensure no function has local 'import re' causing UnboundLocalError."""
        import ast

        for base_dir in (REPO_ROOT / "browser_engine", REPO_ROOT / "roots" / "browsermulti"):
            for py_path in base_dir.rglob("*.py"):
                tree = ast.parse(py_path.read_text(encoding="utf-8"), filename=str(py_path))
                for node in ast.walk(tree):
                    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        for subnode in ast.walk(node):
                            if isinstance(subnode, ast.Import):
                                for alias in subnode.names:
                                    if alias.name == "re" or (alias.asname and alias.asname == "re"):
                                        self.fail(f"Local 'import re' found in {py_path}:{subnode.lineno} inside {node.name}()")
                            elif isinstance(subnode, ast.ImportFrom):
                                if subnode.module == "re":
                                    self.fail(f"Local 'from re import ...' found in {py_path}:{subnode.lineno} inside {node.name}()")

    def test_goto_channel_videos_navigation_behavior(self):
        """Zero-sticking navigation test: skips redundant navigation if on /videos/upload, executes locator click when transitioning."""
        import asyncio
        nav_mod = importlib.import_module("actions.upload.navigation")

        class MockLocator:
            def __init__(self, page_ref, sel):
                self.page_ref = page_ref
                self.sel = sel
            @property
            def first(self):
                return self
            async def count(self):
                return 1
            async def is_visible(self):
                return True
            async def click(self, **kwargs):
                self.page_ref.clicked_selectors.append(self.sel)

        class MockPage:
            def __init__(self, url: str):
                self.url = url
                self.clicked_selectors = []
                self.goto_calls = []
            def locator(self, sel: str):
                return MockLocator(self, sel)
            async def evaluate(self, script, *args):
                return "UC_TEST_CHANNEL_123"
            async def goto(self, url, **kwargs):
                self.goto_calls.append(url)

        # Case 1: Already on /videos/upload -> should skip clicking or goto
        page1 = MockPage("https://studio.youtube.com/channel/UC_TEST_CHANNEL_123/videos/upload")
        asyncio.run(nav_mod.goto_channel_videos(page1))
        self.assertEqual(len(page1.clicked_selectors), 0)
        self.assertEqual(len(page1.goto_calls), 0)

        # Case 2: On channel dashboard -> clicks navigation drawer link
        page2 = MockPage("https://studio.youtube.com/channel/UC_TEST_CHANNEL_123")
        asyncio.run(nav_mod.goto_channel_videos(page2))
        self.assertGreaterEqual(len(page2.clicked_selectors), 1)
        self.assertIn("/videos", page2.clicked_selectors[0])

    def test_upload_wizard_step_recognition_and_actionable_states(self):
        """Verifies that STUDIO_DOM_JS_LIB contains full upload wizard step recognition and actionable state detection."""
        dom_mod = importlib.import_module("actions.dom")
        js_lib = dom_mod.STUDIO_DOM_JS_LIB

        # Step detector function and supported wizard steps
        self.assertIn("function detectUploadWizardStep(dlg)", js_lib)
        self.assertIn("ytcp-uploads-checks", js_lib)
        self.assertIn("ytcp-uploads-video-elements", js_lib)
        self.assertIn("ytcp-video-metadata-ad-suitability", js_lib)
        self.assertIn("ytcp-video-metadata-editor", js_lib)
        self.assertIn("function inspectStudioState()", js_lib)
        self.assertIn("uploadsStep: editor.step", js_lib)
        self.assertIn("doneBtnPresent", js_lib)
        self.assertIn("nextBtnPresent", js_lib)
        self.assertIn("visRadiosVisible", js_lib)

    def test_shadow_dom_traversal_and_inner_button_click_contract(self):
        """Verifies deep Shadow DOM piercing traversal in js_lib and synthetic click event dispatching on Polymer inner buttons."""
        dom_mod = importlib.import_module("actions.dom")
        js_lib = dom_mod.STUDIO_DOM_JS_LIB

        # Deep traversal piercing shadowRoot
        self.assertIn("function deepFirstVisible(root, selector)", js_lib)
        self.assertIn("el.shadowRoot", js_lib)
        self.assertIn("function deepQueryAll(root, selector)", js_lib)

        # Polymer synthetic MouseEvents targeting inner button inside shadowRoot in upload_actions.py
        upload_actions_text = (REPO_ROOT / "browser_engine" / "actions" / "upload_actions.py").read_text(encoding="utf-8")
        self.assertIn("btn.shadowRoot ? btn.shadowRoot.querySelector('button') : null", upload_actions_text)
        self.assertIn("dispatchEvent(new MouseEvent(evtName", upload_actions_text)

    def test_full_page_editor_detection_and_save_contract(self):
        """Verifies full-page video editor dual-layout support and contract."""
        dom_mod = importlib.import_module("actions.dom")
        js_lib = dom_mod.STUDIO_DOM_JS_LIB
        self.assertIn("isFullPageEditor", js_lib)
        self.assertIn("fullPageSavePresent", js_lib)
        self.assertIn("fullPageSaveActionable", js_lib)
        self.assertIn("fullPageVisSelectPresent", js_lib)

        upload_actions_text = (REPO_ROOT / "browser_engine" / "actions" / "upload_actions.py").read_text(encoding="utf-8")
        self.assertIn("def _detect_full_page_editor", upload_actions_text)
        self.assertIn("def _set_full_page_visibility", upload_actions_text)
        self.assertIn("def _save_full_page_editor", upload_actions_text)
        self.assertIn("_detect_full_page_editor(page)", upload_actions_text)

    def test_blocking_dialogs_never_click_uploads_dialog_close(self):
        """Verifies that dismiss_blocking_studio_dialogs never targets ytcp-uploads-dialog close controls."""
        dom_mod = importlib.import_module("actions.dom")
        js_lib = dom_mod.STUDIO_DOM_JS_LIB
        self.assertIn("hasAncestorTag(dlg, new Set(['ytcp-uploads-dialog', 'ytcp-video-row']))", js_lib)

        modals_text = (REPO_ROOT / "browser_engine" / "actions" / "dom" / "modals.py").read_text(encoding="utf-8")
        # Ensure raw unscoped ytcp-icon-button#close-button is absent from fallback list
        self.assertNotIn("'ytcp-icon-button#close-button'", modals_text)
        self.assertIn("has_blocking_container", modals_text)



if __name__ == "__main__":
    unittest.main()
