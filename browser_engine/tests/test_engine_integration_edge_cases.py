# -*- coding: utf-8 -*-
"""
RETubeMatrix - Engine Integration & Edge Case Tests.

Covers:
1. Corrupt profile metadata & resilient JSON payload decoding.
2. CLI subcommands (test_profile_connection, nurture_channel, etc.).
3. Studio DOM selector changes and graceful fallbacks.
4. Network timeout, CDP disconnect, and target closed exception detection.
5. Strict honesty in BKT timeout & pending status reporting.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
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

import runner
from actions.bkt.evaluator import _pending_result, _timeout_result, _target_ids_without_identity
from actions.bkt.network import is_browser_disconnected, is_target_closed_exception
from actions.dom.eval import get_studio_context
from actions.dom.interaction import (
    _url_matches_patterns,
    click_stable_element,
    safe_targeted_click,
    wait_for_stable_actionable,
)
from actions.youtube_actions import build_competitor_nurture_plan
from core.profile_store import (
    ProfilePersistenceError,
    _read_profile_rows,
    load_profiles,
    load_profiles_with_diagnostics,
)


class MockPage:
    """Lightweight mock of a Playwright page for edge case testing."""

    def __init__(self, url: str = "https://studio.youtube.com", closed: bool = False):
        self._url = url
        self._closed = closed
        self.context = MockContext(closed=False)

    @property
    def url(self) -> str:
        return self._url

    def is_closed(self) -> bool:
        return self._closed

    async def evaluate(self, script: str, arg: any = None) -> any:
        if self._closed:
            raise RuntimeError("Target page, context or browser has been closed")
        return None

    async def wait_for_load_state(self, *args, **kwargs) -> None:
        pass


class MockContext:
    def __init__(self, closed: bool = False):
        self._closed = closed
        self.browser = MockBrowser(connected=True)

    def is_closed(self) -> bool:
        return self._closed


class MockBrowser:
    def __init__(self, connected: bool = True):
        self._connected = connected

    def is_connected(self) -> bool:
        return self._connected


class EngineIntegrationEdgeCasesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.base_path = Path(self.tmp_dir.name)

    def tearDown(self) -> None:
        self.tmp_dir.cleanup()

    # -------------------------------------------------------------------------
    # 1. Payload decoding & Corrupt Metadata Edge Cases
    # -------------------------------------------------------------------------

    def test_get_payload_corrupt_and_non_dict_inputs(self) -> None:
        """get_payload must always return a dictionary, never crash on malformed payloads."""
        # 1. None / empty
        empty_args = argparse.Namespace(data=None, data_b64=None)
        self.assertEqual(runner.get_payload(empty_args), {})

        # 2. Corrupt base64 string
        bad_b64_args = argparse.Namespace(data=None, data_b64="!!!NOT_VALID_B64@@@")
        self.assertEqual(runner.get_payload(bad_b64_args), {})

        # 3. Corrupt JSON in data
        bad_json_args = argparse.Namespace(data="{bad: json syntax", data_b64=None)
        self.assertEqual(runner.get_payload(bad_json_args), {})

        # 4. JSON array passed instead of object
        arr_b64 = base64.b64encode(b"[1, 2, 3]").decode("ascii")
        arr_args = argparse.Namespace(data=None, data_b64=arr_b64)
        self.assertEqual(runner.get_payload(arr_args), {})

        # 5. JSON string/number primitive
        str_args = argparse.Namespace(data='"hello world"', data_b64=None)
        self.assertEqual(runner.get_payload(str_args), {})

        # 6. Valid dict with camelCase conversion to snake_case
        valid_payload = {"profileId": "prof-123", "targetUrl": "https://example.com", "maxWaitMs": 5000}
        valid_b64 = base64.b64encode(json.dumps(valid_payload).encode("utf-8")).decode("ascii")
        valid_args = argparse.Namespace(data=None, data_b64=valid_b64)
        res = runner.get_payload(valid_args)
        self.assertIsInstance(res, dict)
        self.assertEqual(res.get("profile_id"), "prof-123")
        self.assertEqual(res.get("target_url"), "https://example.com")
        self.assertEqual(res.get("max_wait_ms"), 5000)

    def test_corrupt_profiles_json_syntax_error(self) -> None:
        """When profiles.json is corrupt, _read_profile_rows raises ProfilePersistenceError."""
        corrupt_file = self.base_path / "corrupt_profiles.json"
        corrupt_file.write_text("{\"broken\": [unclosed json", encoding="utf-8")

        with self.assertRaises(ProfilePersistenceError):
            _read_profile_rows(corrupt_file)

    def test_corrupt_profiles_json_malformed_items(self) -> None:
        """Non-dict items in profiles.json must be rejected cleanly with ProfilePersistenceError."""
        malformed_file = self.base_path / "malformed_profiles.json"
        malformed_file.write_text(
            json.dumps([{"id": "p1", "profile_name": "P1"}, "non-dict element", 12345]),
            encoding="utf-8",
        )

        with self.assertRaises(ProfilePersistenceError):
            _read_profile_rows(malformed_file)

    # -------------------------------------------------------------------------
    # 2. CLI Subcommands Edge Cases (test_profile_connection, nurture_channel)
    # -------------------------------------------------------------------------

    def test_action_test_profile_connection_missing_profile_id(self) -> None:
        """test_profile_connection without profile_id must output success: False."""
        args = argparse.Namespace(profile_id="", data="", data_b64="")
        with mock.patch("sys.stdout.write") as mock_stdout:
            runner.action_test_profile_connection(args)
            output = "".join(call.args[0] for call in mock_stdout.call_args_list)
            data = json.loads(output)
            self.assertFalse(data.get("success"))
            self.assertIn("Thiếu profile_id", data.get("error", ""))

    def test_action_test_profile_connection_nonexistent_profile(self) -> None:
        """test_profile_connection with nonexistent profile_id must report not found."""
        args = argparse.Namespace(profile_id="nonexistent_profile_id_xyz", data="", data_b64="")
        with mock.patch("runner.load_profiles", return_value=[]):
            with mock.patch("sys.stdout.write") as mock_stdout:
                runner.action_test_profile_connection(args)
                output = "".join(call.args[0] for call in mock_stdout.call_args_list)
                data = json.loads(output)
                self.assertFalse(data.get("success"))
                self.assertIn("Không tìm thấy hồ sơ", data.get("error", ""))

    def test_action_test_profile_connection_valid_profile(self) -> None:
        """test_profile_connection with valid profile returns success: True and status: ready."""
        fake_profile = {
            "id": "prof-ok-1",
            "profile_name": "Test Profile",
            "proxy": "http://user:pass@1.2.3.4:8080",
        }
        args = argparse.Namespace(profile_id="prof-ok-1", data="", data_b64="")
        with mock.patch("runner.load_profiles", return_value=[fake_profile]):
            with mock.patch("sys.stdout.write") as mock_stdout:
                runner.action_test_profile_connection(args)
                output = "".join(call.args[0] for call in mock_stdout.call_args_list)
                data = json.loads(output)
                self.assertTrue(data.get("success"))
                self.assertEqual(data.get("profile_id"), "prof-ok-1")
                self.assertTrue(data.get("has_proxy"))
                self.assertTrue(data.get("proxy_valid"))
                self.assertEqual(data.get("status"), "ready")

    def test_async_nurture_channel_missing_profile_id(self) -> None:
        """_async_nurture_channel without profile_id outputs structured error."""
        args = argparse.Namespace(profile_id="", data="", data_b64="")
        with mock.patch("sys.stdout.write") as mock_stdout:
            asyncio.run(runner._async_nurture_channel(args))
            output = "".join(call.args[0] for call in mock_stdout.call_args_list)
            data = json.loads(output)
            self.assertFalse(data.get("success"))
            self.assertIn("Thiếu profile_id", data.get("error", ""))

    def test_build_competitor_nurture_plan_purges_urls_and_normalizes(self) -> None:
        """build_competitor_nurture_plan must NEVER leak URLs into search topics."""
        titles = [
            "Video Cực Đỉnh [100M Views]! Đừng Bỏ Lỡ - Review Phim Hay",
            "https://www.youtube.com/watch?v=forbidden123",
            "Tóm tắt phim chiếu rạp siêu cuốn",
        ]
        hashtags = ["#reviewphim", "#tom_tat_phim", "#https://malicious.link"]
        keywords = ["phimmoi", "https://youtube.com/feed/trending", "review"]
        urls = ["https://www.youtube.com/@competitor_channel", "Plain Channel Name"]

        plan = build_competitor_nurture_plan(
            competitor_titles=titles,
            competitor_hashtags=hashtags,
            competitor_keywords=keywords,
            competitor_urls=urls,
        )

        search_topics = plan.get("search_topics", [])
        for topic in search_topics:
            self.assertFalse(topic.startswith("http://"), f"URL leaked into search_topics: {topic}")
            self.assertFalse(topic.startswith("https://"), f"URL leaked into search_topics: {topic}")
            self.assertNotIn("youtube.com", topic, f"youtube.com leaked into search_topics: {topic}")

        # Channels URLs properly collected
        channel_urls = plan.get("competitor_channel_urls", [])
        self.assertIn("https://www.youtube.com/@competitor_channel", channel_urls)

        # Plain channel name routed to search_topics
        self.assertIn("Plain Channel Name", search_topics)

        # Hashtags cleaned
        self.assertIn("reviewphim", search_topics)
        self.assertIn("tom tat phim", search_topics)

    # -------------------------------------------------------------------------
    # 3. Studio DOM Selector Changes & Graceful Fallback
    # -------------------------------------------------------------------------

    def test_wait_for_stable_actionable_selector_not_found(self) -> None:
        """When selector cannot be found, wait_for_stable_actionable returns None without crashing."""
        page = MockPage()
        res = asyncio.run(
            wait_for_stable_actionable(
                page,
                selectors=["#non_existent_selector_button", "button[test-id='unknown']"],
                timeout_ms=300,
            )
        )
        self.assertIsNone(res)

    def test_safe_targeted_click_selector_missing(self) -> None:
        """When selector is missing, safe_targeted_click returns structured failure with reason."""
        page = MockPage()
        res = asyncio.run(
            safe_targeted_click(
                page,
                action_name="test_missing_click",
                selectors=["#missing_studio_modal_btn"],
                timeout_ms=300,
                allow_js_fallback=False,
            )
        )
        self.assertIsInstance(res, dict)
        self.assertFalse(res.get("ok"))
        self.assertIn("not_found_or_unstable", res.get("reason", ""))

    def test_get_studio_context_fallback_on_exception(self) -> None:
        """get_studio_context falls back to robust default dictionary when evaluation fails."""
        page = MockPage(url="https://studio.youtube.com/channel/UC12345/videos/upload")

        # Mock evaluate to raise an exception
        async def mock_fail_eval(*args, **kwargs):
            raise RuntimeError("CDP connection failed")

        page.evaluate = mock_fail_eval

        ctx = asyncio.run(get_studio_context(page))
        self.assertIsInstance(ctx, dict)
        self.assertEqual(ctx.get("channelId"), "UC12345")
        self.assertEqual(ctx.get("pageType"), "channel_content_videos")
        self.assertEqual(ctx.get("scope"), "channel")
        self.assertIn("tableSummary", ctx)
        self.assertIn("headerMenus", ctx)

    def test_url_matches_patterns_regex_safety(self) -> None:
        """_url_matches_patterns handles invalid regex without raising re.error."""
        # Unclosed bracket is invalid regex syntax, should safely fall back to substring check
        patterns = ["[invalid(regex", r"/video/[^/]+/copyright"]
        self.assertTrue(_url_matches_patterns("https://studio.youtube.com/video/abc/copyright", patterns))
        self.assertFalse(_url_matches_patterns("https://studio.youtube.com/channel/xyz", patterns))
        self.assertFalse(_url_matches_patterns("", patterns))
        self.assertFalse(_url_matches_patterns("https://studio.youtube.com", []))

    # -------------------------------------------------------------------------
    # 4. Network Timeout, Disconnection & Exception Classification
    # -------------------------------------------------------------------------

    def test_is_browser_disconnected_detection(self) -> None:
        """is_browser_disconnected detects closed pages, contexts, or browsers."""
        # 1. Closed page
        closed_page = MockPage(closed=True)
        self.assertTrue(is_browser_disconnected(closed_page))

        # 2. Closed context
        page_ctx_closed = MockPage(closed=False)
        page_ctx_closed.context._closed = True
        self.assertTrue(is_browser_disconnected(page_ctx_closed))

        # 3. Disconnected browser
        page_brw_disco = MockPage(closed=False)
        page_brw_disco.context.browser._connected = False
        self.assertTrue(is_browser_disconnected(page_brw_disco))

        # 4. Live page
        live_page = MockPage(closed=False)
        self.assertFalse(is_browser_disconnected(live_page))

    def test_is_target_closed_exception_variations(self) -> None:
        """is_target_closed_exception accurately identifies CDP/Browser closure errors."""
        closed_errors = [
            RuntimeError("Target page, context or browser has been closed"),
            Exception("Target closed"),
            Exception("Browser has been closed"),
            ConnectionError("connection closed"),
            Exception("Target crashed"),
            Exception("TargetClosedError: Protocol error (Target.closeTarget): Target closed"),
        ]
        for err in closed_errors:
            self.assertTrue(is_target_closed_exception(err), f"Failed to detect: {err}")

        # Non-closure errors must return False
        unrelated_errors = [
            ValueError("invalid literal for int() with base 10"),
            KeyError("missing_key"),
            FileNotFoundError("No such file or directory"),
        ]
        for err in unrelated_errors:
            self.assertFalse(is_target_closed_exception(err), f"False positive: {err}")

    # -------------------------------------------------------------------------
    # 5. Strict Honesty in BKT Timeout & Pending Status Reporting
    # -------------------------------------------------------------------------

    def test_bkt_timeout_and_pending_builders_never_report_clean(self) -> None:
        """_timeout_result and _pending_result must never return success=True or green_clean."""
        results = {
            "vid12345678": {
                "title": "Test Video",
                "bkt_check_status": "pending",
                "restrictions": "Checking...",
            }
        }

        # Timeout result
        timeout_res = _timeout_result("vid12345678", results)
        self.assertFalse(timeout_res.get("success"))
        self.assertTrue(timeout_res.get("timed_out"))
        self.assertEqual(timeout_res.get("status"), "timeout")
        self.assertNotEqual(timeout_res.get("bkt_check_status"), "green_clean")

        # Pending result
        pending_res = _pending_result("vid12345678", results)
        self.assertFalse(pending_res.get("success"))
        self.assertTrue(pending_res.get("pending"))
        self.assertEqual(pending_res.get("status"), "pending")
        self.assertNotEqual(pending_res.get("bkt_check_status"), "green_clean")

    def test_target_ids_without_identity_never_selects_arbitrary_row(self) -> None:
        """_target_ids_without_identity returns __pending_new_row__ if title is ambiguous or missing."""
        # 1. No rows
        self.assertEqual(_target_ids_without_identity([], "My Video"), ["__pending_new_row__"])

        # 2. Ambiguous rows (multiple matching titles)
        ambiguous_rows = [
            {"vid": "VID11111111", "title": "Episode 1"},
            {"vid": "VID22222222", "title": "Episode 1"},
        ]
        self.assertEqual(_target_ids_without_identity(ambiguous_rows, "Episode 1"), ["__pending_new_row__"])

        # 3. Exactly one uniquely matched row
        unique_rows = [
            {"vid": "VID11111111", "title": "Unique Title"},
            {"vid": "VID22222222", "title": "Other Title"},
        ]
        self.assertEqual(_target_ids_without_identity(unique_rows, "Unique Title"), ["VID11111111"])


if __name__ == "__main__":
    unittest.main()
