# -*- coding: utf-8 -*-
import asyncio
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT / "browser_engine") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "browser_engine"))

from actions import upload_actions
from actions.studio_dom import inspect_studio_modal_state


class DummyLocator:
    def __init__(self, count_val=1, visible_val=True):
        self._count = count_val
        self._visible = visible_val
        self.clicked = False

    @property
    def first(self):
        return self

    async def count(self):
        return self._count

    async def is_visible(self, timeout=None):
        return self._visible

    async def click(self, **kwargs):
        self.clicked = True

    async def scroll_into_view_if_needed(self, **kwargs):
        pass

    async def get_attribute(self, attr):
        if attr == "aria-checked":
            return "true"
        if attr == "disabled":
            return None
        return ""


class DummyPage:
    def __init__(self, url="https://studio.youtube.com/"):
        self.url = url
        self.eval_responses = {}
        self.clicked_selectors = []
        self.screenshots = []

    def locator(self, sel):
        return DummyLocator()

    async def evaluate(self, script, *args):
        for k, v in self.eval_responses.items():
            if k in script:
                if callable(v):
                    return v(*args)
                return v
        return None

    async def screenshot(self, path=None, **kwargs):
        self.screenshots.append(path)

    async def wait_for_load_state(self, *args, **kwargs):
        pass

    async def goto(self, url, **kwargs):
        self.url = url


class UploadLayoutsAndFlowsTests(unittest.TestCase):
    def test_detect_full_page_editor_by_url(self):
        page = DummyPage("https://studio.youtube.com/video/dQw4w9WgXcQ/edit")
        is_fp, vid = asyncio.run(upload_actions._detect_full_page_editor(page))
        self.assertTrue(is_fp)
        self.assertEqual(vid, "dQw4w9WgXcQ")

    def test_detect_full_page_editor_modal_dialog_precedence(self):
        # When an active ytcp-uploads-dialog with Next button is open on upload page, it takes precedence
        page = DummyPage("https://studio.youtube.com/channel/UC12345/videos/upload")
        # JS evaluation reports uploads dialog is opened, so evaluate returns False (not full page)
        page.eval_responses["ytcp-uploads-dialog"] = False
        is_fp, vid = asyncio.run(upload_actions._detect_full_page_editor(page))
        self.assertFalse(is_fp)
        self.assertEqual(vid, "")

    def test_detect_full_page_editor_precedence_on_edit_url_with_docked_badge(self):
        # When on /video/<id>/edit, full-page editor takes precedence even if docked ytcp-uploads-dialog exists
        page = DummyPage("https://studio.youtube.com/video/hw9yuksuq_M/edit")
        page.eval_responses["ytcp-uploads-dialog"] = True
        is_fp, vid = asyncio.run(upload_actions._detect_full_page_editor(page))
        self.assertTrue(is_fp)
        self.assertEqual(vid, "hw9yuksuq_M")

    def test_extract_video_url_from_page_url(self):
        page = DummyPage("https://studio.youtube.com/video/abcdefghijk/edit?filter=[]")
        url = asyncio.run(upload_actions._extract_video_url(page))
        self.assertEqual(url, "https://youtu.be/abcdefghijk")

    def test_extract_video_url_fallback_when_not_in_url(self):
        page = DummyPage("https://studio.youtube.com/channel/UC12345/videos/upload")
        page.eval_responses["containers"] = "https://youtu.be/1234567890a"
        url = asyncio.run(upload_actions._extract_video_url(page))
        self.assertEqual(url, "https://youtu.be/1234567890a")

    def test_set_full_page_visibility_public_flow(self):
        page = DummyPage("https://studio.youtube.com/video/abcdefghijk/edit")
        # Simulate open dropdown, radio click, and done button click
        page.eval_responses["ytcp-video-visibility-select"] = True
        page.eval_responses["tp-yt-paper-radio-button"] = True
        page.eval_responses["ytcp-button#save-button"] = True

        res = asyncio.run(upload_actions._set_full_page_visibility(page, visibility="public"))
        self.assertTrue(res)

    def test_set_full_page_visibility_unlisted_and_private(self):
        page = DummyPage("https://studio.youtube.com/video/abcdefghijk/edit")
        page.eval_responses["ytcp-video-visibility-select"] = True
        page.eval_responses["tp-yt-paper-radio-button"] = True
        page.eval_responses["ytcp-button#save-button"] = True

        res_unlisted = asyncio.run(upload_actions._set_full_page_visibility(page, visibility="unlisted"))
        self.assertTrue(res_unlisted)

        res_private = asyncio.run(upload_actions._set_full_page_visibility(page, visibility="private"))
        self.assertTrue(res_private)

    def test_save_full_page_editor_confirmed_by_button_disabled(self):
        page = DummyPage("https://studio.youtube.com/video/abcdefghijk/edit")
        # Save button active, clicked, then disabled
        page.eval_responses["save_btn_selector"] = True
        page.eval_responses["button_disabled"] = "button_disabled"

        saved = asyncio.run(upload_actions._save_full_page_editor(page, timeout_seconds=2.0))
        self.assertTrue(saved)

    def test_save_full_page_editor_confirmed_by_toast(self):
        page = DummyPage("https://studio.youtube.com/video/abcdefghijk/edit")
        page.eval_responses["save_btn_selector"] = True
        page.eval_responses["toast_saved"] = "toast_saved"

        saved = asyncio.run(upload_actions._save_full_page_editor(page, timeout_seconds=2.0))
        self.assertTrue(saved)

    def test_inspect_studio_modal_state_includes_full_page_keys(self):
        page = DummyPage("https://studio.youtube.com/video/abcdefghijk/edit")
        state = asyncio.run(inspect_studio_modal_state(page))
        self.assertIn("isFullPageEditor", state)
        self.assertIn("fullPageSavePresent", state)
        self.assertIn("fullPageSaveActionable", state)
        self.assertIn("fullPageVisSelectPresent", state)


if __name__ == "__main__":
    unittest.main()
