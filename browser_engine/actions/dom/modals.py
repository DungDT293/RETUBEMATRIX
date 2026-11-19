# -*- coding: utf-8 -*-
"""
Modal inspection and post-save dismissal handlers for YouTube Studio.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any, Dict

from .eval import eval_studio_dom

logger = logging.getLogger(__name__)

async def inspect_studio_modal_state(page: Any) -> Dict[str, Any]:
    """Return a clean diagnostic snapshot of current Studio dialogs, step, and buttons."""
    try:
        res = await eval_studio_dom(page, "return __rtmDom.inspectStudioState();")
        if isinstance(res, dict):
            return res
    except Exception as exc:
        logger.debug("inspect_studio_modal_state failed: %s", exc)
    return {
        "uploadsDialogVisible": False,
        "uploadsStep": "",
        "doneBtnPresent": False,
        "doneBtnActionable": False,
        "nextBtnPresent": False,
        "nextBtnActionable": False,
        "visRadiosVisible": False,
        "postSaveDialogs": [],
        "backdropOpened": False,
        "isFullPageEditor": False,
        "fullPageSavePresent": False,
        "fullPageSaveActionable": False,
        "fullPageVisSelectPresent": False,
    }




async def dismiss_post_save_studio_modals(
    page: Any,
    settlement_seconds: float = 0.0,
    context: str = "upload",
) -> Dict[str, Any]:
    """
    Safely close YouTube Studio post-save modals ('ytcp-uploads-still-processing-dialog',
    'ytcp-video-share-dialog', or equivalent overlay card) across ANY language.

    Enforces 3 strict safety guards:
      1) Editor Active Guard: Never dismiss/Escape while upload editor is active (unless
         closing specifically scoped post-save dialog close button).
      2) Structural Validation: Targets only validated post-save modal cards, never menus
         or metadata forms.
      3) Cancel Upload Forbidden: Never clicks cancel-upload controls or anything in video rows.

    Verifies after every click that both the dialog and its iron-overlay-backdrop
    actually disappear.
    """
    closed_count = 0
    attempt_errors = 0
    fast_guard_contexts = ("bkt_guard", "bkt_before_scrape", "nav_guard", "pre_upload")
    deadline = time.time() + max(settlement_seconds, 0.35)

    while True:
        state = await inspect_studio_modal_state(page)
        post_save = state.get("postSaveDialogs") or []
        editor_active = bool(state.get("uploadsDialogVisible"))
        backdrop_opened = bool(state.get("backdropOpened"))

        # Fast-return immediately on clean guard passes (avoid wasted 0.35s-1.05s polling)
        if not post_save and not backdrop_opened and settlement_seconds <= 0.0 and context in fast_guard_contexts:
            return {
                "status": "editor_active" if editor_active else "clean",
                "closed_count": closed_count,
                "still_open_dialogs": [],
                "backdrop_opened": False,
                "attempt_errors": attempt_errors,
            }

        # Guard 1: Do not press generic Escape or disrupt active metadata wizard.
        if editor_active and not post_save:
            if context not in ("upload_handover", "upload_handover_retry", "upload_standalone"):
                return {
                    "status": "editor_active",
                    "closed_count": closed_count,
                    "still_open_dialogs": [],
                    "backdrop_opened": backdrop_opened,
                }
            if time.time() >= deadline:
                return {
                    "status": "editor_active",
                    "closed_count": closed_count,
                    "still_open_dialogs": [],
                    "backdrop_opened": backdrop_opened,
                }
            await asyncio.sleep(0.35)
            continue

        if post_save:
            # Wait briefly so Polymer entrance transition finishes and layout stabilizes.
            await asyncio.sleep(0.35)
            dismissed_this_round = False

            for attempt in range(4):
                try:
                    btn_probe = await eval_studio_dom(
                        page,
                        """
                        const candidates = __rtmDom.deepQueryAll(
                            document,
                            'ytcp-uploads-still-processing-dialog, ytcp-video-share-dialog, ytcp-dialog, tp-yt-paper-dialog'
                        );
                        for (const dlg of candidates) {
                            if (!__rtmDom.isPostSaveDialogElement(dlg)) continue;
                            const closeCtrl = __rtmDom.findSafePostSaveCloseControl(dlg);
                            if (!closeCtrl) continue;
                            const nativeBtn = __rtmDom.resolveNativeButton(closeCtrl) || closeCtrl;
                            nativeBtn.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                            const box = nativeBtn.getBoundingClientRect();
                            return {
                                tag: (dlg.tagName || '').toLowerCase(),
                                x: box.left + box.width / 2,
                                y: box.top + box.height / 2,
                                unobscured: __rtmDom.isElementUnobscured(nativeBtn, closeCtrl),
                            };
                        }
                        return null;
                        """,
                    )

                    if btn_probe and attempt in (0, 1):
                        if btn_probe.get("unobscured"):
                            await page.mouse.move(btn_probe["x"], btn_probe["y"], steps=4)
                            await asyncio.sleep(0.08)
                            recheck_hit = await eval_studio_dom(
                                page,
                                """
                                const hit = __rtmDom.deepElementFromPoint(arg.x, arg.y);
                                if (!hit) return false;
                                if (__rtmDom.isCancelForbiddenControl(hit)) return false;
                                let cur = hit;
                                while (cur && cur.nodeType === 1) {
                                    if (__rtmDom.isPostSaveDialogElement(cur)) return true;
                                    cur = cur.parentElement || (cur.getRootNode && cur.getRootNode().host) || null;
                                }
                                return false;
                                """,
                                {"x": btn_probe["x"], "y": btn_probe["y"]},
                            )
                            if not recheck_hit:
                                logger.warning(
                                    "[%s] Post-save close coordinate hit drifted off dialog before click; retrying probe",
                                    context,
                                )
                                continue
                            await page.mouse.click(btn_probe["x"], btn_probe["y"])
                            logger.info(
                                "[%s] Clicked post-save dialog (%s) close button via mouse (attempt %d)",
                                context,
                                btn_probe.get("tag"),
                                attempt + 1,
                            )
                        else:
                            await eval_studio_dom(
                                page,
                                """
                                const candidates = __rtmDom.deepQueryAll(
                                    document,
                                    'ytcp-uploads-still-processing-dialog, ytcp-video-share-dialog, ytcp-dialog, tp-yt-paper-dialog'
                                );
                                for (const dlg of candidates) {
                                    if (!__rtmDom.isPostSaveDialogElement(dlg)) continue;
                                    const closeCtrl = __rtmDom.findSafePostSaveCloseControl(dlg);
                                    if (!closeCtrl) continue;
                                    const nativeBtn = __rtmDom.resolveNativeButton(closeCtrl) || closeCtrl;
                                    nativeBtn.click();
                                    return true;
                                }
                                return false;
                                """,
                            )
                            logger.info(
                                "[%s] Clicked post-save dialog close button via shadow DOM click (attempt %d)",
                                context,
                                attempt + 1,
                            )
                    elif attempt == 2:
                        # Polymer dialog close() / native button click fallback
                        await eval_studio_dom(
                            page,
                            """
                            const candidates = __rtmDom.deepQueryAll(
                                document,
                                'ytcp-uploads-still-processing-dialog, ytcp-video-share-dialog, ytcp-dialog, tp-yt-paper-dialog'
                            );
                            for (const dlg of candidates) {
                                if (!__rtmDom.isPostSaveDialogElement(dlg)) continue;
                                const closeCtrl = __rtmDom.findSafePostSaveCloseControl(dlg);
                                if (closeCtrl) {
                                    const nativeBtn = __rtmDom.resolveNativeButton(closeCtrl) || closeCtrl;
                                    nativeBtn.click();
                                }
                                if (typeof dlg.close === 'function') {
                                    dlg.close();
                                } else {
                                    const innerPaper = __rtmDom.deepFirstVisible(dlg, 'tp-yt-paper-dialog');
                                    if (innerPaper && typeof innerPaper.close === 'function') innerPaper.close();
                                }
                                return true;
                            }
                            return false;
                            """,
                        )
                        logger.info("[%s] Invoked close fallback on post-save dialog (attempt 3)", context)
                    else:
                        # Last resort only when Guard 1 confirms upload editor is NOT visible.
                        cur_state = await inspect_studio_modal_state(page)
                        if not cur_state.get("uploadsDialogVisible"):
                            await page.keyboard.press("Escape")
                            logger.info("[%s] Pressed Escape to dismiss lingering post-save dialog (attempt 4)", context)
                except Exception as exc:
                    attempt_errors += 1
                    logger.debug("[%s] Error clicking post-save close button: %s", context, exc)

                # Verify BOTH modal dialog AND backdrop disappear within 3.0s
                verify_end = time.time() + 3.0
                gone = False
                last_verify_state: Dict[str, Any] = {}
                while time.time() < verify_end:
                    await asyncio.sleep(0.25)
                    after_state = await inspect_studio_modal_state(page)
                    last_verify_state = after_state
                    if not (after_state.get("postSaveDialogs") or []) and not after_state.get("backdropOpened"):
                        gone = True
                        break
                    # Dialog closed even if ghost backdrop is still fading out; give backdrop a moment
                    if not (after_state.get("postSaveDialogs") or []):
                        await asyncio.sleep(0.35)
                        recheck = await inspect_studio_modal_state(page)
                        last_verify_state = recheck
                        if not recheck.get("backdropOpened"):
                            gone = True
                            break

                if not gone and not (last_verify_state.get("postSaveDialogs") or []):
                    gone = True
                    logger.warning("[%s] Post-save dialog gone while fading backdrop remained open.", context)

                if gone:
                    closed_count += 1
                    dismissed_this_round = True
                    logger.info("[%s] Verified post-save dialog and backdrop cleanly dismissed.", context)
                    break

                await asyncio.sleep(0.35)

            if not dismissed_this_round:
                latest = await inspect_studio_modal_state(page)
                logger.warning(
                    "[%s] Post-save modal still open after 4 attempts: %s",
                    context,
                    latest.get("postSaveDialogs"),
                )
                return {
                    "status": "stuck",
                    "closed_count": closed_count,
                    "still_open_dialogs": latest.get("postSaveDialogs") or [],
                    "backdrop_opened": bool(latest.get("backdropOpened")),
                    "attempt_errors": attempt_errors,
                }
        elif backdrop_opened and not editor_active:
            # Ghost iron-overlay-backdrop with zero visible dialogs blocking clicks
            await asyncio.sleep(0.3)
            recheck = await inspect_studio_modal_state(page)
            if recheck.get("postSaveDialogs"):
                # Dialog finished fading in during backdrop settle; handle it immediately before deadline exit.
                continue
            if recheck.get("backdropOpened") and not recheck.get("uploadsDialogVisible"):
                has_any_dialog = bool(
                    await eval_studio_dom(
                        page,
                        "return __rtmDom.deepQueryMounted(document, 'ytcp-dialog, tp-yt-paper-dialog').length > 0;",
                    )
                )
                if not has_any_dialog:
                    try:
                        await page.keyboard.press("Escape")
                        await asyncio.sleep(0.25)
                    except Exception:
                        pass
            if time.time() >= deadline:
                break
            continue

        if time.time() >= deadline:
            break
        await asyncio.sleep(0.3)

    final_state = await inspect_studio_modal_state(page)
    still_open = final_state.get("postSaveDialogs") or []
    status = "stuck" if still_open else ("closed" if closed_count > 0 else "clean")
    return {
        "status": status,
        "closed_count": closed_count,
        "still_open_dialogs": still_open,
        "backdrop_opened": bool(final_state.get("backdropOpened")),
        "attempt_errors": attempt_errors,
    }


async def dismiss_blocking_studio_dialogs(
    page: Any,
    allow_reload: bool = True,
    context: str = "general",
    max_retries: int = 2,
) -> Dict[str, Any]:
    """
    Tự động dò tìm, xác nhận và dismiss các hộp thoại cản trở trên YouTube Studio:
    - Hộp thoại 'Bạn đã hoàn tất' / 'You're all set'.
    - Hộp thoại yêu cầu 'Hãy thử làm mới trang' / 'Try refreshing the page'.
    Tự động reload trang an toàn nếu được phép và có yêu cầu từ modal.
    """
    result = {
        "handled": False,
        "type": "none",
        "needsReload": False,
        "reloaded": False,
        "details": "",
    }
    for attempt in range(max_retries):
        try:
            diag = await eval_studio_dom(
                page,
                "return __rtmDom.inspectAndDismissBlockingDialog(arg);",
                {"allowReload": allow_reload},
            )
            found_diag = bool(diag and diag.get("found"))
            if found_diag:
                logger.info(
                    "[%s] Phát hiện và bấm đóng hộp thoại cản trở: button='%s', allSet=%s, needsReload=%s, sample='%s'",
                    context,
                    diag.get("buttonText"),
                    diag.get("isAllSet"),
                    diag.get("needsReload"),
                    diag.get("sample"),
                )
                result["handled"] = True
                result["type"] = "you_are_all_set" if diag.get("isAllSet") else "blocking_notice"
                result["needsReload"] = bool(diag.get("needsReload"))
                result["isDailyLimit"] = bool(diag.get("isDailyLimit"))
                result["details"] = diag.get("sample", "")

            # Playwright native fallback click với force=True:
            # CHỈ chạy khi thực sự có blocking dialog container trên trang (KHÔNG bao giờ quét trên toàn document)
            native_clicked = False
            has_blocking_container = await page.evaluate("""() => {
                const candidates = document.querySelectorAll('ytcp-feature-eligibility-dialog, ytcp-confirmation-dialog, ytcp-dialog, tp-yt-paper-dialog[opened]');
                for (const c of candidates) {
                    const tag = (c.tagName || '').toLowerCase();
                    if (tag === 'ytcp-uploads-dialog') continue;
                    if (c.closest && c.closest('ytcp-uploads-dialog, ytcp-video-row')) continue;
                    if (c.offsetParent !== null || (c.getClientRects && c.getClientRects().length > 0)) {
                        return true;
                    }
                }
                return false;
            }""")

            if has_blocking_container:
                for btn_sel in [
                    'ytcp-feature-eligibility-dialog #cancel-button',
                    'ytcp-feature-eligibility-dialog #dismiss-button',
                    'ytcp-feature-eligibility-dialog [dialog-dismiss]',
                    'ytcp-feature-eligibility-dialog #close-button',
                    'ytcp-feature-eligibility-dialog ytcp-button',
                    'ytcp-confirmation-dialog #confirm-button',
                    'ytcp-confirmation-dialog #dismiss-button',
                    'ytcp-confirmation-dialog #cancel-button',
                    'ytcp-confirmation-dialog ytcp-button[dialog-confirm]',
                    'tp-yt-paper-dialog[opened]:not(ytcp-uploads-dialog) [dialog-confirm]',
                    'tp-yt-paper-dialog[opened]:not(ytcp-uploads-dialog) [dialog-dismiss]',
                    'ytcp-dialog[opened]:not(ytcp-uploads-dialog) #confirm-button',
                    'ytcp-dialog[opened]:not(ytcp-uploads-dialog) #dismiss-button',
                    'ytcp-dialog[opened]:not(ytcp-uploads-dialog) #cancel-button',
                ]:
                    try:
                        loc = page.locator(btn_sel).first
                        if await loc.count() > 0 and await loc.is_visible():
                            await loc.click(force=True, timeout=1500)
                            logger.info("[%s] Playwright native fallback click thành công trên selector: %s", context, btn_sel)
                            native_clicked = True
                            if not result["handled"]:
                                result["handled"] = True
                                result["type"] = "blocking_notice"
                                result["needsReload"] = False
                                result["details"] = f"Native click: {btn_sel}"
                            break
                    except Exception:
                        pass

            if not found_diag and not native_clicked:
                break

            # Chờ modal đóng và backdrop mờ dần
            await asyncio.sleep(0.6)

            # Xử lý yêu cầu reload trang nếu modal yêu cầu
            if result.get("needsReload") and allow_reload and context != "upload_streaming":
                logger.info("[%s] Modal yêu cầu làm mới trang. Tiến hành reload Studio an toàn...", context)
                cur_url = getattr(page, "url", "") or ""
                target_url = cur_url
                if "/channel/" in cur_url:
                    cid_match = re.search(r"/channel/([^/?#]+)", cur_url)
                    if cid_match:
                        target_url = f"https://studio.youtube.com/channel/{cid_match.group(1)}"
                if not target_url or "studio.youtube.com" not in target_url:
                    target_url = "https://studio.youtube.com/"

                try:
                    await page.goto(target_url, wait_until="domcontentloaded", timeout=45000)
                    await asyncio.sleep(1.5)
                    result["reloaded"] = True
                except Exception as goto_err:
                    logger.debug("[%s] Reload trang sau khi dismiss modal lỗi: %s", context, goto_err)
                break

        except Exception as exc:
            logger.debug("[%s] Lỗi kiểm tra blocking dialog: %s", context, exc)
            break

    # Dọn dẹp ghost backdrop nếu modal đã đóng nhưng backdrop còn sót và không có uploads dialog
    try:
        await page.evaluate("""() => {
            const hasUploadDialog = !!document.querySelector('ytcp-uploads-dialog[opened], ytcp-uploads-dialog:not([hidden])');
            if (!hasUploadDialog) {
                const backdrops = document.querySelectorAll('iron-overlay-backdrop.opened, tp-yt-iron-overlay-backdrop.opened');
                backdrops.forEach(b => {
                    b.classList.remove('opened');
                    b.style.display = 'none';
                });
            }
        }""")
    except Exception:
        pass

    return result



