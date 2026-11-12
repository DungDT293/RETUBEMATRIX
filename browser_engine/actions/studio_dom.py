# -*- coding: utf-8 -*-
"""
Shared language-agnostic YouTube Studio Polymer & Shadow DOM helpers.

Provides unified visibility detection (ignoring hidden templates/tooltips),
deep Shadow DOM traversal, deliberate click-stability verification,
modal state inspection, post-save dialog dismissal with safety guards,
and structured Content-table row snapshot extraction.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any, Callable, Dict, Iterable, List, Optional

DEFAULT_FORBIDDEN_HREF_PATTERNS: List[str] = [
    r"/video/[^/]+/analytics",
    r"/video/[^/]+/comments",
    r"/video/[^/]+/subtitles",
    r"/video/[^/]+/monetization",
    r"/video/[^/]+/copyright",
    r"/video/[^/]+/editor",
]

logger = logging.getLogger(__name__)


# Self-contained JS library injected into page.evaluate calls so helpers remain
# valid across SPA route changes without relying on window globals surviving reloads.
STUDIO_DOM_JS_LIB = r"""
const __rtmDom = (() => {
    const IGNORED_TAGS = new Set(['STYLE', 'SCRIPT', 'TEMPLATE', 'NOSCRIPT', 'SLOT']);

    function areAncestorsVisible(el) {
        if (!el || el.nodeType !== 1) return false;
        let cur = el;
        while (cur && cur.nodeType === 1) {
            const tag = (cur.tagName || '').toUpperCase();
            if (IGNORED_TAGS.has(tag)) return false;
            if (cur.hasAttribute('hidden')) return false;
            if ((cur.getAttribute('aria-hidden') || '').toLowerCase() === 'true') return false;
            const st = window.getComputedStyle(cur);
            if (!st || st.display === 'none' || st.visibility === 'hidden') return false;
            if (parseFloat(st.opacity || '1') <= 0.01) return false;
            cur = cur.parentElement || (cur.getRootNode && cur.getRootNode().host) || null;
        }
        return true;
    }

    function isReallyVisible(el) {
        if (!areAncestorsVisible(el)) return false;
        const leafStyle = window.getComputedStyle(el);
        if (leafStyle && leafStyle.display === 'contents') {
            for (const ch of (el.children || [])) {
                if (isReallyVisible(ch)) return true;
            }
            if (el.shadowRoot) {
                for (const sch of (el.shadowRoot.children || [])) {
                    if (isReallyVisible(sch)) return true;
                }
            }
            return false;
        }
        const rects = el.getClientRects ? el.getClientRects() : [];
        if (!rects || rects.length === 0) return false;
        const box = el.getBoundingClientRect();
        return box.width > 0.5 && box.height > 0.5;
    }

    function deepQueryAll(root, selector) {
        const out = [];
        const seen = new Set();
        const visit = (node) => {
            if (!node) return;
            const nt = node.nodeType;
            if (nt !== 1 && nt !== 9 && nt !== 11) return;
            if (nt === 1) {
                try {
                    if (node.matches && node.matches(selector) && !seen.has(node)) {
                        seen.add(node);
                        out.push(node);
                    }
                } catch (_) {}
                if (node.shadowRoot) {
                    visit(node.shadowRoot);
                }
            }
            const kids = node.children || node.childNodes;
            if (kids) {
                for (const ch of kids) {
                    if (ch.nodeType === 1) visit(ch);
                }
            }
        };
        visit(root);
        return out;
    }

    function deepQueryVisible(root, selector) {
        return deepQueryAll(root, selector).filter(isReallyVisible);
    }

    function deepFirstVisible(root, selector) {
        const list = deepQueryVisible(root, selector);
        return list.length ? list[0] : null;
    }

    function isDisabledControl(el) {
        if (!el || el.nodeType !== 1) return true;
        if (el.hasAttribute('disabled')) return true;
        if ((el.getAttribute('aria-disabled') || '').toLowerCase() === 'true') return true;
        if (el.classList && (
            el.classList.contains('ytcpButtonShapeImpl--disabled')
            || el.classList.contains('disabled')
            || el.classList.contains('is-disabled')
        )) {
            return true;
        }
        return false;
    }

    function deepElementFromPoint(x, y) {
        if (typeof document.elementFromPoint !== 'function') return null;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        let el = document.elementFromPoint(x, y);
        let guard = 0;
        while (el && guard < 24) {
            guard += 1;
            if (el.shadowRoot && typeof el.shadowRoot.elementFromPoint === 'function') {
                const inner = el.shadowRoot.elementFromPoint(x, y);
                if (inner && inner !== el) {
                    el = inner;
                    continue;
                }
            }
            if ((el.tagName || '').toUpperCase() === 'SLOT' && typeof el.assignedElements === 'function') {
                const assigned = el.assignedElements({ flatten: true });
                let matchedAssigned = null;
                for (const cand of assigned) {
                    if (!cand || typeof cand.getBoundingClientRect !== 'function') continue;
                    const r = cand.getBoundingClientRect();
                    if (r && r.width > 0 && r.height > 0 && x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1) {
                        matchedAssigned = cand;
                        break;
                    }
                }
                if (matchedAssigned && matchedAssigned !== el) {
                    el = matchedAssigned;
                    continue;
                }
            }
            break;
        }
        return el;
    }

    function isExtensionNode(el) {
        let cur = el;
        while (cur && cur.nodeType === 1) {
            const tag = (cur.tagName || '').toLowerCase();
            const id = (cur.id || '').toLowerCase();
            const cls = (typeof cur.className === 'string' ? cur.className : '').toLowerCase();
            if (
                tag.includes('retubematrix')
                || tag.startsWith('rtm-')
                || id.startsWith('rtm-')
                || cls.includes('rtm-')
            ) {
                return true;
            }
            cur = cur.parentElement || (cur.getRootNode && cur.getRootNode().host) || null;
        }
        return false;
    }

    function hasExcludedAncestor(el, excludeSelectors) {
        if (!el || !Array.isArray(excludeSelectors) || excludeSelectors.length === 0) return false;
        let cur = el;
        while (cur && cur.nodeType === 1) {
            for (const sel of excludeSelectors) {
                if (!sel) continue;
                try {
                    if (cur.matches && cur.matches(sel)) return sel;
                } catch (_) {}
            }
            cur = cur.parentElement || (cur.getRootNode && cur.getRootNode().host) || null;
        }
        return false;
    }

    function getEffectiveHref(el) {
        if (!el || el.nodeType !== 1) return '';
        const directAttr = el.getAttribute && (el.getAttribute('href') || el.getAttribute('data-href') || '');
        if (directAttr) return String(directAttr).trim();
        if (typeof el.href === 'string' && el.href) return el.href.trim();
        let cur = el.parentElement || (el.getRootNode && el.getRootNode().host) || null;
        let hops = 0;
        while (cur && cur.nodeType === 1 && hops < 6) {
            hops += 1;
            const tag = (cur.tagName || '').toUpperCase();
            if (tag === 'A') {
                const aHref = cur.getAttribute('href') || cur.href || '';
                if (aHref) return String(aHref).trim();
            }
            cur = cur.parentElement || (cur.getRootNode && cur.getRootNode().host) || null;
        }
        const innerLinks = deepQueryVisible(el, 'a[href]');
        if (innerLinks.length === 1) {
            return String(innerLinks[0].getAttribute('href') || innerLinks[0].href || '').trim();
        }
        return '';
    }

    function resolveNativeButton(el) {
        if (!el) return null;
        const tag = (el.tagName || '').toUpperCase();
        if (tag === 'A' || tag === 'BUTTON') return el;
        if (el.matches && el.matches('[role="button"]')) return el;
        const innerBtn = deepQueryVisible(el, 'button, [role="button"]');
        if (innerBtn.length > 0) return innerBtn[0];
        const innerLinks = deepQueryVisible(el, 'a[href]');
        if (innerLinks.length === 1) return innerLinks[0];
        return el;
    }

    function isButtonActionable(host) {
        if (!isReallyVisible(host) || isDisabledControl(host) || isExtensionNode(host)) return false;
        const nativeBtn = resolveNativeButton(host);
        if (!nativeBtn || !isReallyVisible(nativeBtn) || isDisabledControl(nativeBtn)) return false;
        return true;
    }

    function belongsToElement(hitEl, targetEl, hostEl) {
        let cur = hitEl;
        while (cur) {
            if (cur === targetEl || (hostEl && cur === hostEl)) return true;
            cur = cur.parentElement || (cur.getRootNode && cur.getRootNode().host) || null;
        }
        return false;
    }

    function probeUnobscuredPoint(targetEl, hostEl) {
        const box = targetEl.getBoundingClientRect();
        if (!box || box.width < 1 || box.height < 1) {
            return { ok: false, reason: 'zero_box', box: null };
        }
        if (
            box.bottom <= 0
            || box.top >= window.innerHeight
            || box.right <= 0
            || box.left >= window.innerWidth
        ) {
            return { ok: false, reason: 'offscreen', box };
        }
        const cx = Math.min(Math.max(box.left + box.width / 2, 1), window.innerWidth - 2);
        const cy = Math.min(Math.max(box.top + box.height / 2, 1), window.innerHeight - 2);
        if (cx < box.left || cx > box.right || cy < box.top || cy > box.bottom) {
            return { ok: false, reason: 'center_clipped', box, x: cx, y: cy };
        }
        const hit = deepElementFromPoint(cx, cy);
        if (!hit) {
            return { ok: false, reason: 'no_hit', box, x: cx, y: cy };
        }
        if (isExtensionNode(hit)) {
            return { ok: false, reason: 'extension_overlay', box, x: cx, y: cy, hitTag: (hit.tagName || '').toLowerCase(), hitId: hit.id || '' };
        }
        const same = belongsToElement(hit, targetEl, hostEl);
        return {
            ok: same,
            reason: same ? 'ok' : 'obscured',
            box,
            x: cx,
            y: cy,
            hitTag: (hit.tagName || '').toLowerCase(),
            hitId: hit.id || '',
        };
    }

    function isElementUnobscured(targetEl, hostEl) {
        return probeUnobscuredPoint(targetEl, hostEl).ok;
    }

    function collectVisibleText(root, excludeIds = []) {
        if (!root || !isReallyVisible(root)) return '';
        const excluded = new Set(excludeIds.map(s => String(s || '').toLowerCase()));
        const parts = [];
        const walk = (node) => {
            if (!node) return;
            if (node.nodeType === 3) {
                const t = (node.textContent || '').trim();
                if (t) parts.push(t);
                return;
            }
            if (node.nodeType !== 1) return;
            if (!isReallyVisible(node)) return;
            const id = (node.id || '').toLowerCase();
            if (id && excluded.has(id)) return;
            if (node.classList) {
                for (const cls of node.classList) {
                    if (excluded.has(cls.toLowerCase())) return;
                }
            }
            if (node.shadowRoot) {
                for (const ch of node.shadowRoot.childNodes) walk(ch);
            }
            for (const ch of node.childNodes) walk(ch);
        };
        walk(root);
        return parts.join(' ').replace(/\s+/g, ' ').trim();
    }

    function isCancelForbiddenControl(el, allowInsideVideoRow = false) {
        const STOP_CONTAINERS = new Set([
            'YTCP-UPLOADS-DIALOG',
            'TP-YT-PAPER-DIALOG',
            'YTCP-DIALOG',
            'YTCP-APP',
            'BODY',
            'HTML',
        ]);
        const INTERACTIVE_TAGS = new Set([
            'BUTTON',
            'A',
            'YTCP-BUTTON',
            'YTCP-ICON-BUTTON',
            'TP-YT-PAPER-BUTTON',
            'TP-YT-PAPER-ITEM',
            'YTCP-VE',
        ]);
        let cur = el;
        let hops = 0;
        while (cur && cur.nodeType === 1) {
            const tag = (cur.tagName || '').toLowerCase();
            if (tag === 'ytcp-video-row') {
                return !allowInsideVideoRow;
            }
            if (STOP_CONTAINERS.has(tag.toUpperCase())) {
                break;
            }
            const id = (cur.id || '').toLowerCase();
            const testId = (cur.getAttribute('test-id') || cur.getAttribute('data-testid') || '').toLowerCase();
            const aria = (cur.getAttribute('aria-label') || '').toLowerCase();
            if (id.includes('cancel') || testId.includes('cancel') || cur.hasAttribute('data-cancel-upload')) {
                return true;
            }
            const role = (cur.getAttribute('role') || '').toLowerCase();
            const isControlNode = (
                cur === el
                || (hops <= 3 && (INTERACTIVE_TAGS.has(tag.toUpperCase()) || role === 'button' || role === 'menuitem'))
            );
            const labelCheck = (
                aria + (isControlNode ? ' ' + collectVisibleText(cur).toLowerCase() : '')
            ).trim();
            if (labelCheck && (
                labelCheck.includes('cancel upload')
                || labelCheck === 'cancel'
                || labelCheck.includes('huỷ tải')
                || labelCheck.includes('hủy tải')
                || labelCheck === 'huỷ'
                || labelCheck === 'hủy'
                || labelCheck.includes('annuler')
                || labelCheck.includes('cancelar')
                || labelCheck.includes('abbrechen')
                || labelCheck.includes('отменить')
                || labelCheck.includes('キャンセル')
                || labelCheck.includes('취소')
                || labelCheck.includes('取消')
                || labelCheck.includes('ยกเลิก')
                || labelCheck.includes('batal')
            )) {
                return true;
            }
            hops += 1;
            cur = cur.parentElement || (cur.getRootNode && cur.getRootNode().host) || null;
        }
        return false;
    }

    const DEFAULT_CONTAINER_SURFACE_SELECTOR = [
        'tp-yt-paper-dialog',
        'ytcp-dialog',
        '#dialog',
        '#close-button',
        '#title-textarea',
        '#description-textarea',
        '#next-button',
        '#done-button',
        'ytcp-uploads-file-picker',
        'ytcp-text-menu',
        'tp-yt-paper-listbox',
        'tp-yt-paper-item',
        'tp-yt-paper-radio-button',
        '[role="menu"]',
        '[role="dialog"]',
        '[role="button"]',
        'button',
        'a[href]',
        'input',
    ].join(', ');

    function isContainerVisiblyMounted(host, surfaceSelector = DEFAULT_CONTAINER_SURFACE_SELECTOR) {
        if (!areAncestorsVisible(host)) return false;
        if (isReallyVisible(host)) return true;
        return Boolean(deepFirstVisible(host, surfaceSelector));
    }

    function deepQueryMounted(root, selector, surfaceSelector = DEFAULT_CONTAINER_SURFACE_SELECTOR) {
        const matches = deepQueryAll(root || document, selector);
        return matches.filter(m => isReallyVisible(m) || isContainerVisiblyMounted(m, surfaceSelector));
    }

    function findMountedContainer(root, selector, surfaceSelector = DEFAULT_CONTAINER_SURFACE_SELECTOR) {
        const mounted = deepQueryMounted(root || document, selector, surfaceSelector);
        if (!mounted.length) return null;
        for (let i = mounted.length - 1; i >= 0; i--) {
            const m = mounted[i];
            if (m.hasAttribute('opened') || m.hasAttribute('open') || m.hasAttribute('workflow-step')) {
                return m;
            }
        }
        return mounted[mounted.length - 1];
    }

    function hasAncestorTag(el, tagNamesSet) {
        let cur = el ? (el.parentElement || (el.getRootNode && el.getRootNode().host) || null) : null;
        while (cur && cur.nodeType === 1) {
            const tag = (cur.tagName || '').toLowerCase();
            if (tagNamesSet.has(tag)) return true;
            cur = cur.parentElement || (cur.getRootNode && cur.getRootNode().host) || null;
        }
        return false;
    }

    function detectUploadWizardStep(dlg) {
        if (!dlg) return '';
        const attrStep = (dlg.getAttribute('workflow-step') || '').trim().toUpperCase();
        if (attrStep) return attrStep;
        if (deepFirstVisible(
            dlg,
            'ytcp-uploads-review, tp-yt-paper-radio-button[name="PUBLIC"], tp-yt-paper-radio-button[name="UNLISTED"], tp-yt-paper-radio-button[name="PRIVATE"], ytcp-button#done-button, #done-button'
        )) {
            return 'REVIEW';
        }
        if (deepFirstVisible(dlg, 'ytcp-uploads-checks')) {
            return 'CHECKS';
        }
        if (deepFirstVisible(dlg, 'ytcp-uploads-video-elements')) {
            return 'VIDEO_ELEMENTS';
        }
        if (deepFirstVisible(dlg, 'ytcp-video-metadata-ad-suitability, ytcp-uploads-ad-suitability')) {
            return 'SUITABILITY';
        }
        if (deepFirstVisible(dlg, 'ytcp-video-metadata-editor, #title-textarea, #description-textarea, ytcp-uploads-file-picker')) {
            return 'DETAILS';
        }
        return '';
    }

    function isUploadEditorVisible() {
        const dlgs = deepQueryAll(document, 'ytcp-uploads-dialog');
        for (const d of dlgs) {
            if (!isContainerVisiblyMounted(d)) continue;
            const hasEditorControls = Boolean(
                deepFirstVisible(d, '#title-textarea, #description-textarea, #next-button, #done-button, ytcp-uploads-file-picker')
            );
            const step = detectUploadWizardStep(d);
            if (hasEditorControls || step.length > 0) {
                return { visible: true, step };
            }
        }
        return { visible: false, step: '' };
    }

    function isPostSaveDialogElement(d) {
        if (!d || d.nodeType !== 1 || !isContainerVisiblyMounted(d)) return false;
        const tag = (d.tagName || '').toLowerCase();
        if (tag === 'ytcp-uploads-dialog') return false;
        if (hasAncestorTag(d, new Set(['ytcp-uploads-dialog', 'ytcp-video-row']))) return false;

        // Guard against duplicate counting when ytcp-dialog / tp-yt-paper-dialog lives inside specialized host
        if (tag === 'ytcp-uploads-still-processing-dialog' || tag === 'ytcp-video-share-dialog') {
            return true;
        }
        if (tag !== 'tp-yt-paper-dialog' && tag !== 'ytcp-dialog') return false;
        if (hasAncestorTag(d, new Set(['ytcp-uploads-still-processing-dialog', 'ytcp-video-share-dialog']))) {
            return false;
        }

        const isModalSurface = d.hasAttribute('modal')
            || d.getAttribute('aria-modal') === 'true'
            || d.getAttribute('role') === 'dialog'
            || tag === 'ytcp-dialog';
        if (!isModalSurface) return false;

        // Reject upload/metadata editor or cancel buttons inside dialog.
        const hasEditor = Boolean(deepFirstVisible(d, '#title-textarea, #description-textarea, #next-button, #done-button, ytcp-uploads-file-picker'));
        if (hasEditor) return false;

        const hasUploadOrShareSignals = Boolean(
            deepFirstVisible(d, 'ytcp-video-upload-progress, a[href*="youtu.be"], a[href*="youtube.com/watch"], #share-url, #progress-bar')
        );
        const hasCloseBtn = Boolean(deepFirstVisible(d, '#close-button, [dialog-dismiss]'));
        const editorVisible = isUploadEditorVisible().visible;
        return hasUploadOrShareSignals || (hasCloseBtn && !editorVisible);
    }

    function findSafePostSaveCloseControl(dlg) {
        const selectorPriority = [
            '#close-button',
            'ytcp-button#close-button',
            'ytcp-icon-button#close-button',
            '[dialog-dismiss]',
            '[slot="primary-footer-buttons"] ytcp-button',
            '.footer ytcp-button',
            '[slot="header"] ytcp-icon-button[icon*="close" i]',
        ];
        for (const sel of selectorPriority) {
            const matches = deepQueryVisible(dlg, sel);
            if (sel.includes('primary-footer-buttons') || sel.includes('.footer')) {
                const safeFooter = matches.filter(m => {
                    if (isCancelForbiddenControl(m) || !isButtonActionable(m)) return false;
                    const mid = (m.id || '').toLowerCase();
                    const aria = (m.getAttribute('aria-label') || '').toLowerCase();
                    const txt = collectVisibleText(m).toLowerCase();
                    const comb = `${mid} ${aria} ${txt}`.trim();
                    return (
                        mid.includes('close')
                        || mid.includes('dismiss')
                        || mid.includes('done')
                        || /\b(close|dismiss|ok|done|got it|đóng|xong|cerrar|fermer|schließen|закрыть|fechar|tutup)\b/i.test(comb)
                        || comb.includes('閉じる')
                        || comb.includes('关闭')
                        || comb.includes('닫기')
                        || comb.includes('ปิด')
                    );
                });
                if (safeFooter.length !== 1) continue;
                return safeFooter[0];
            }
            for (const m of matches) {
                if (isCancelForbiddenControl(m)) continue;
                const mid = (m.id || '').toLowerCase();
                if (mid.includes('feedback') || mid.includes('copy') || mid.includes('help')) continue;
                if (isButtonActionable(m)) return m;
            }
        }
        // Fallback: resolve enclosing button of any visible close icon inside dialog
        const closeIcons = deepQueryVisible(dlg, 'tp-yt-iron-icon[icon*="close" i], yt-icon[icon*="close" i]');
        for (const ic of closeIcons) {
            let cur = ic.parentElement || (ic.getRootNode && ic.getRootNode().host) || null;
            while (cur && cur !== dlg) {
                const tag = (cur.tagName || '').toLowerCase();
                if (tag === 'ytcp-icon-button' || tag === 'ytcp-button' || tag === 'button') {
                    if (!isCancelForbiddenControl(cur) && isButtonActionable(cur)) return cur;
                    break;
                }
                cur = cur.parentElement || (cur.getRootNode && cur.getRootNode().host) || null;
            }
        }
        return null;
    }

    function inspectStudioState() {
        const editor = isUploadEditorVisible();
        const candidates = deepQueryAll(
            document,
            'ytcp-uploads-still-processing-dialog, ytcp-video-share-dialog, ytcp-dialog, tp-yt-paper-dialog'
        );
        const postSaveDialogs = [];
        for (const c of candidates) {
            if (!isPostSaveDialogElement(c)) continue;
            const tag = (c.tagName || '').toLowerCase();
            const closeCtrl = findSafePostSaveCloseControl(c);
            const hasVideoLink = Boolean(
                deepFirstVisible(c, 'a[href*="youtu.be"], a[href*="youtube.com/watch"], [id*="share-url"]')
            );
            postSaveDialogs.push({
                tag,
                id: c.id || '',
                hasClose: Boolean(closeCtrl),
                hasVideoLink,
                sample: collectVisibleText(c).slice(0, 120),
            });
        }

        const backdrops = deepQueryAll(document, 'tp-yt-iron-overlay-backdrop[opened], tp-yt-iron-overlay-backdrop');
        let backdropOpened = false;
        for (const bd of backdrops) {
            const bdOpacity = parseFloat(window.getComputedStyle(bd).opacity || '0');
            if (isReallyVisible(bd) && (Number.isNaN(bdOpacity) || bdOpacity > 0.05)) {
                backdropOpened = true;
                break;
            }
        }

        const uploadDlg = findMountedContainer(document, 'ytcp-uploads-dialog');
        const doneBtn = uploadDlg ? deepFirstVisible(uploadDlg, 'ytcp-button#done-button, #done-button') : null;
        const nextBtn = uploadDlg ? deepFirstVisible(uploadDlg, 'ytcp-button#next-button, #next-button') : null;
        const visRadio = uploadDlg
            ? deepFirstVisible(
                uploadDlg,
                'tp-yt-paper-radio-button[name="PUBLIC"], tp-yt-paper-radio-button[name="UNLISTED"], tp-yt-paper-radio-button[name="PRIVATE"]'
            )
            : null;

        return {
            uploadsDialogVisible: editor.visible,
            uploadsStep: editor.step,
            doneBtnPresent: Boolean(doneBtn),
            doneBtnActionable: doneBtn ? isButtonActionable(doneBtn) : false,
            nextBtnPresent: Boolean(nextBtn),
            nextBtnActionable: nextBtn ? isButtonActionable(nextBtn) : false,
            visRadiosVisible: Boolean(visRadio),
            postSaveDialogs,
            backdropOpened,
        };
    }

    function parseStudioUrl(hrefOrUrl) {
        const raw = String(hrefOrUrl || (typeof window !== 'undefined' && window.location ? window.location.href : '') || '').trim();
        let parsed = null;
        try {
            parsed = new URL(raw, (typeof window !== 'undefined' && window.location) ? window.location.origin : 'https://studio.youtube.com');
        } catch (_) {
            return {
                url: raw,
                host: '',
                pathname: '',
                pageType: 'unknown',
                scope: 'other',
                channelId: '',
                videoId: '',
                activeContentTab: '',
            };
        }
        const host = (parsed.hostname || '').toLowerCase();
        const pathname = parsed.pathname || '/';
        if (!host.includes('studio.youtube.com')) {
            return {
                url: parsed.href,
                host,
                pathname,
                pageType: 'external',
                scope: 'other',
                channelId: '',
                videoId: '',
                activeContentTab: '',
            };
        }
        const chMatch = pathname.match(/^\/channel\/([^/?#]+)(?:\/(.*))?$/);
        if (chMatch) {
            const channelId = chMatch[1] || '';
            const rest = (chMatch[2] || '').replace(/\/+$/, '');
            let pageType = 'channel_other';
            let activeContentTab = '';
            if (!rest) {
                pageType = 'channel_dashboard';
            } else if (rest === 'videos' || rest.startsWith('videos/')) {
                pageType = 'channel_content_videos';
                const sub = rest.slice('videos'.length).replace(/^\/+/, '');
                activeContentTab = sub || 'upload';
            } else if (rest === 'analytics' || rest.startsWith('analytics/')) {
                pageType = 'channel_analytics';
            } else if (rest === 'comments' || rest.startsWith('comments/')) {
                pageType = 'channel_comments';
            }
            return {
                url: parsed.href,
                host,
                pathname,
                pageType,
                scope: 'channel',
                channelId,
                videoId: '',
                activeContentTab,
            };
        }
        const vidMatch = pathname.match(/^\/video\/([^/?#]+)(?:\/(.*))?$/);
        if (vidMatch) {
            const videoId = vidMatch[1] || '';
            const rest = (vidMatch[2] || '').replace(/\/+$/, '');
            let pageType = 'video_other';
            if (!rest || rest === 'edit' || rest.startsWith('edit/')) {
                pageType = 'video_edit';
            } else if (rest === 'analytics' || rest.startsWith('analytics/')) {
                pageType = 'video_analytics';
            } else if (rest === 'copyright' || rest.startsWith('copyright/')) {
                pageType = 'video_copyright';
            } else if (rest === 'comments' || rest.startsWith('comments/')) {
                pageType = 'video_comments';
            } else if (rest === 'translations' || rest.startsWith('translations/') || rest === 'subtitles') {
                pageType = 'video_subtitles';
            }
            return {
                url: parsed.href,
                host,
                pathname,
                pageType,
                scope: 'video',
                channelId: '',
                videoId,
                activeContentTab: '',
            };
        }
        return {
            url: parsed.href,
            host,
            pathname,
            pageType: pathname === '/' ? 'studio_root' : 'studio_other',
            scope: 'other',
            channelId: '',
            videoId: '',
            activeContentTab: '',
        };
    }

    function extractChannelId() {
        const u = parseStudioUrl();
        if (u.channelId) return u.channelId;
        const links = deepQueryAll(document, 'a[href*="/channel/"], [href*="/channel/"]');
        for (const l of links) {
            const h = l.getAttribute('href') || l.href || '';
            const m = String(h).match(/\/channel\/(UC[A-Za-z0-9_-]{8,}|[^/?#]+)/);
            if (m && m[1]) return m[1];
        }
        return '';
    }

    function classifyNavHref(href) {
        if (!href) return 'unknown';
        const s = String(href);
        if (/\/channel\/[^/]+\/videos(?:\/|$|\?)/.test(s)) return 'channel_content_videos';
        if (/\/channel\/[^/]+\/analytics(?:\/|$|\?)/.test(s)) return 'channel_analytics';
        if (/\/channel\/[^/]+\/comments(?:\/|$|\?)/.test(s)) return 'channel_comments';
        if (/\/channel\/[^/]+\/subtitles|translations/.test(s)) return 'channel_subtitles';
        if (/\/channel\/[^/]+\/copyright/.test(s)) return 'channel_copyright';
        if (/\/channel\/[^/]+\/monetization|earn/.test(s)) return 'channel_monetization';
        if (/\/channel\/[^/]+\/editing|customization/.test(s)) return 'channel_customization';
        if (/\/channel\/[^/]+\/?(?:\?|$)/.test(s)) return 'channel_dashboard';
        if (/\/video\/[^/]+\/analytics/.test(s)) return 'video_analytics';
        if (/\/video\/[^/]+\/edit/.test(s)) return 'video_edit';
        if (/\/video\/[^/]+\/copyright/.test(s)) return 'video_copyright';
        if (/\/video\/[^/]+\//.test(s)) return 'video_other';
        return 'other';
    }

    function inspectLeftNav() {
        const navRoot = deepFirstVisible(document, 'ytcp-navigation-drawer, nav#left-nav, tp-yt-app-drawer');
        if (!navRoot) return [];
        const rawItems = deepQueryVisible(navRoot, 'a[href], tp-yt-paper-icon-item, tp-yt-paper-item');
        const seen = new Set();
        const items = [];
        for (const el of rawItems) {
            if (isExtensionNode(el)) continue;
            const href = getEffectiveHref(el);
            const key = `${href}::${el.id || ''}::${collectVisibleText(el)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const selected = (
                el.getAttribute('aria-current') === 'page'
                || el.hasAttribute('selected')
                || el.hasAttribute('active')
                || (el.classList && el.classList.contains('iron-selected'))
                || (el.closest && Boolean(el.closest('.iron-selected, [aria-current="page"], [selected]')))
            );
            items.push({
                tag: (el.tagName || '').toLowerCase(),
                id: el.id || '',
                testId: el.getAttribute('test-id') || '',
                href,
                routeKind: classifyNavHref(href),
                selected,
                text: collectVisibleText(el).slice(0, 80),
            });
            if (items.length >= 25) break;
        }
        return items;
    }

    function inspectBackToChannelLinks() {
        const navRoot = deepFirstVisible(document, 'ytcp-navigation-drawer, ytcp-header, #left-nav') || document;
        const rawLinks = deepQueryVisible(navRoot, 'a[href*="/channel/"], ytcp-entity-switcher a[href]');
        const seen = new Set();
        const links = [];
        for (const a of rawLinks) {
            if (isExtensionNode(a)) continue;
            const href = getEffectiveHref(a);
            if (!href || !href.includes('/channel/')) continue;
            if (seen.has(href + '::' + (a.id || ''))) continue;
            seen.add(href + '::' + (a.id || ''));
            links.push({
                id: a.id || '',
                href,
                routeKind: classifyNavHref(href),
                text: collectVisibleText(a).slice(0, 60),
                ariaLabel: (a.getAttribute('aria-label') || '').slice(0, 60),
            });
            if (links.length >= 10) break;
        }
        return links;
    }

    function inspectHeaderAndMenus() {
        const createBtn = deepFirstVisible(document, '#create-icon, ytcp-header #create-icon, #upload-icon');
        const menus = deepQueryMounted(
            document,
            'ytcp-text-menu tp-yt-paper-dialog, tp-yt-paper-dialog[role="menu"], tp-yt-paper-dialog tp-yt-paper-listbox, ytcp-popup-container tp-yt-paper-dialog[opened], tp-yt-paper-dialog[opened]'
        );
        let activeMenuKind = null;
        const menuItems = [];
        for (const m of menus) {
            if (isExtensionNode(m) || isPostSaveDialogElement(m)) continue;
            if (hasAncestorTag(m, new Set(['ytcp-video-row', 'ytcp-uploads-dialog']))) continue;
            if (deepFirstVisible(m, '#title-textarea, #done-button, #next-button, ytcp-uploads-file-picker')) continue;
            const itemEls = deepQueryVisible(m, 'tp-yt-paper-item, [test-id*="upload"], ytcp-ve, a[href], button');
            const labels = itemEls.map(it => ({
                id: it.id || '',
                testId: it.getAttribute('test-id') || '',
                href: getEffectiveHref(it),
                text: collectVisibleText(it).slice(0, 50),
            })).filter(x => x.id || x.testId || x.href || x.text);
            if (labels.length > 0) {
                const isCreate = labels.some(x =>
                    x.id === 'text-item-0'
                    || (x.testId || '').includes('upload')
                    || (x.href || '').includes('/videos/upload')
                );
                activeMenuKind = isCreate ? 'create_menu' : 'popup_menu';
                menuItems.push(...labels.slice(0, 8));
                break;
            }
        }
        return {
            createButtonVisible: Boolean(createBtn),
            activeMenuKind,
            menuItems,
        };
    }

    function inspectUploadDialogDetailed() {
        const base = inspectStudioState();
        const dlg = findMountedContainer(document, 'ytcp-uploads-dialog');
        let filePickerVisible = false;
        let progressText = '';
        let fileInputCount = 0;
        if (dlg && isContainerVisiblyMounted(dlg)) {
            filePickerVisible = Boolean(deepFirstVisible(dlg, 'ytcp-uploads-file-picker'));
            fileInputCount = deepQueryAll(dlg, 'input[type="file"]').length;
            const prog = deepFirstVisible(dlg, 'ytcp-video-upload-progress, .progress-label, #progress-label');
            if (prog) progressText = collectVisibleText(prog).slice(0, 120);
        }
        return {
            ...base,
            filePickerVisible,
            fileInputCount,
            progressText,
        };
    }

    function inspectVideoTableSummary() {
        const table = deepFirstVisible(document, 'ytcp-video-section-content, ytcp-video-list-cell-video, #video-list');
        const rows = document.querySelectorAll('ytcp-video-row');
        let visibleRowCount = 0;
        const firstRows = [];
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            if (isReallyVisible(r)) visibleRowCount += 1;
            if (firstRows.length < 3) {
                const tEl = deepFirstVisible(r, '#video-title, .video-title-text, #video-title-text, #title');
                const aEl = deepFirstVisible(r, 'a[href*="/video/"]');
                firstRows.push({
                    title: tEl ? collectVisibleText(tEl).slice(0, 60) : '',
                    href: aEl ? getEffectiveHref(aEl) : '',
                });
            }
        }
        const uploadsTab = deepFirstVisible(document, '#video-list-uploads-tab, [test-id="video-list-uploads-tab"]');
        const activeTabEl = deepFirstVisible(document, '#tabsContent tp-yt-paper-tab[aria-selected="true"], tp-yt-paper-tab.iron-selected');
        return {
            hasTableHost: Boolean(table),
            rowCount: rows.length,
            visibleRowCount,
            hasUploadsTab: Boolean(uploadsTab),
            activeTabId: activeTabEl ? (activeTabEl.id || activeTabEl.getAttribute('test-id') || '') : '',
            firstRows,
        };
    }

    function getPageContext() {
        const urlInfo = parseStudioUrl();
        const channelId = urlInfo.channelId || extractChannelId();
        return {
            ...urlInfo,
            channelId,
            leftNav: inspectLeftNav(),
            backToChannelLinks: inspectBackToChannelLinks(),
            headerMenus: inspectHeaderAndMenus(),
            uploadState: inspectUploadDialogDetailed(),
            tableSummary: inspectVideoTableSummary(),
        };
    }

    function matchesAnyPattern(value, patterns) {
        if (!value || !Array.isArray(patterns) || patterns.length === 0) return false;
        for (const p of patterns) {
            if (!p) continue;
            try {
                if (new RegExp(p, 'i').test(value)) return true;
            } catch (_) {
                if (value.toLowerCase().includes(String(p).toLowerCase())) return true;
            }
        }
        return false;
    }

    function probeCandidateForClick(opts = {}) {
        const selectors = Array.isArray(opts.selectors) ? opts.selectors : [];
        const rootSelector = opts.rootSelector || null;
        const requireUnobscured = opts.requireUnobscured !== false;
        const requireEnabled = opts.requireEnabled !== false;
        const forbidCancelControls = opts.forbidCancelControls !== false;
        const allowInsideVideoRow = Boolean(opts.allowInsideVideoRow);
        const excludeAncestors = Array.isArray(opts.excludeAncestors) ? opts.excludeAncestors : [];
        const allowHrefPatterns = Array.isArray(opts.allowHrefPatterns) ? opts.allowHrefPatterns : [];
        const forbiddenHrefPatterns = Array.isArray(opts.forbiddenHrefPatterns) ? opts.forbiddenHrefPatterns : [];
        const preferTopLayerTooltip = Boolean(opts.preferTopLayerTooltip);

        const root = rootSelector ? findMountedContainer(document, rootSelector) : document;
        if (rootSelector && !root) {
            return { ok: false, reason: 'root_missing', rootSelector };
        }

        const rejected = [];
        for (const sel of selectors) {
            let hosts = deepQueryVisible(root, sel);
            if (preferTopLayerTooltip && hosts.length > 1) {
                // Reverse DOM order only inside explicit tooltip lookups if multiple active tooltips exist
                hosts = hosts.slice().reverse();
            }
            for (const host of hosts) {
                if (isExtensionNode(host)) {
                    rejected.push({ sel, reason: 'extension_node' });
                    continue;
                }
                const exAnc = hasExcludedAncestor(host, excludeAncestors);
                if (exAnc) {
                    rejected.push({ sel, reason: 'excluded_ancestor:' + exAnc });
                    continue;
                }
                if (forbidCancelControls && isCancelForbiddenControl(host, allowInsideVideoRow)) {
                    rejected.push({ sel, reason: 'cancel_forbidden' });
                    continue;
                }
                if (requireEnabled && !isButtonActionable(host)) {
                    rejected.push({ sel, reason: 'not_actionable' });
                    continue;
                }
                if (!isReallyVisible(host)) {
                    rejected.push({ sel, reason: 'not_visible' });
                    continue;
                }
                const nativeBtn = resolveNativeButton(host) || host;
                if (isExtensionNode(nativeBtn)) {
                    rejected.push({ sel, reason: 'extension_native' });
                    continue;
                }
                const exNativeAnc = hasExcludedAncestor(nativeBtn, excludeAncestors);
                if (exNativeAnc) {
                    rejected.push({ sel, reason: 'excluded_native_ancestor:' + exNativeAnc });
                    continue;
                }
                const href = getEffectiveHref(nativeBtn) || getEffectiveHref(host) || '';
                if (forbiddenHrefPatterns.length > 0 && href && matchesAnyPattern(href, forbiddenHrefPatterns)) {
                    rejected.push({ sel, reason: 'forbidden_href:' + href });
                    continue;
                }
                if (allowHrefPatterns.length > 0 && !matchesAnyPattern(href, allowHrefPatterns)) {
                    rejected.push({ sel, reason: 'href_not_allowed:' + (href || '<empty>') });
                    continue;
                }

                let box = nativeBtn.getBoundingClientRect();
                if (!box || box.width < 2 || box.height < 2) {
                    rejected.push({ sel, reason: 'tiny_box' });
                    continue;
                }
                let scrolledIntoCenter = false;
                if (
                    box.top < 24
                    || box.bottom > window.innerHeight - 24
                    || box.left < 12
                    || box.right > window.innerWidth - 12
                ) {
                    nativeBtn.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                    box = nativeBtn.getBoundingClientRect();
                    scrolledIntoCenter = true;
                }
                let hitCheck = probeUnobscuredPoint(nativeBtn, host);
                if (
                    requireUnobscured
                    && !hitCheck.ok
                    && (hitCheck.reason === 'obscured' || hitCheck.reason === 'offscreen' || hitCheck.reason === 'center_clipped')
                ) {
                    nativeBtn.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                    box = nativeBtn.getBoundingClientRect();
                    hitCheck = probeUnobscuredPoint(nativeBtn, host);
                }
                if (requireUnobscured && !hitCheck.ok) {
                    rejected.push({
                        sel,
                        reason: hitCheck.reason,
                        hitTag: hitCheck.hitTag || '',
                        hitId: hitCheck.hitId || '',
                    });
                    continue;
                }
                const cx = hitCheck.x ?? (box.left + box.width / 2);
                const cy = hitCheck.y ?? (box.top + box.height / 2);
                const tokenMap = (window.__rtmTokenMap = window.__rtmTokenMap || new Map());
                if (tokenMap.size > 64) tokenMap.clear();
                const token = 'rtm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                tokenMap.set(token, {
                    host,
                    nativeBtn,
                    selector: sel,
                    forbiddenHrefPatterns,
                    allowHrefPatterns,
                });
                return {
                    ok: true,
                    token,
                    matchedSelector: sel,
                    tag: (nativeBtn.tagName || '').toLowerCase(),
                    id: nativeBtn.id || host.id || '',
                    href,
                    ariaLabel: (nativeBtn.getAttribute('aria-label') || host.getAttribute('aria-label') || '').slice(0, 80),
                    text: collectVisibleText(host).slice(0, 80),
                    x: cx,
                    y: cy,
                    left: box.left,
                    top: box.top,
                    width: box.width,
                    height: box.height,
                    unobscured: Boolean(hitCheck.ok),
                    hitTag: hitCheck.hitTag || '',
                    hitId: hitCheck.hitId || '',
                };
            }
        }
        return { ok: false, reason: 'no_match', rejected: rejected.slice(0, 8) };
    }

    function verifyPointStillHitsToken(token, expectedX, expectedY, maxDriftPx = 6) {
        const tokenMap = window.__rtmTokenMap;
        if (!token || !tokenMap || !tokenMap.has(token)) {
            return { ok: false, reason: 'token_lost' };
        }
        const entry = tokenMap.get(token);
        const { host, nativeBtn, forbiddenHrefPatterns, allowHrefPatterns } = entry;
        if (!nativeBtn || !nativeBtn.isConnected || !host || !host.isConnected) {
            return { ok: false, reason: 'disconnected' };
        }
        if (!isButtonActionable(host)) {
            return { ok: false, reason: 'not_actionable_anymore' };
        }
        const href = getEffectiveHref(nativeBtn) || getEffectiveHref(host) || '';
        if (forbiddenHrefPatterns && forbiddenHrefPatterns.length > 0 && href && matchesAnyPattern(href, forbiddenHrefPatterns)) {
            return { ok: false, reason: 'href_became_forbidden', href };
        }
        if (allowHrefPatterns && allowHrefPatterns.length > 0 && !matchesAnyPattern(href, allowHrefPatterns)) {
            return { ok: false, reason: 'href_became_disallowed', href };
        }
        const hitCheck = probeUnobscuredPoint(nativeBtn, host);
        if (!hitCheck.ok) {
            return {
                ok: false,
                reason: hitCheck.reason || 'obscured_before_click',
                hitTag: hitCheck.hitTag || '',
                hitId: hitCheck.hitId || '',
            };
        }
        const drift = Math.hypot((hitCheck.x || 0) - Number(expectedX || 0), (hitCheck.y || 0) - Number(expectedY || 0));
        if (drift > maxDriftPx) {
            return { ok: false, reason: 'shifted', x: hitCheck.x, y: hitCheck.y, drift };
        }
        return { ok: true, x: hitCheck.x, y: hitCheck.y, href };
    }

    return {
        isReallyVisible,
        areAncestorsVisible,
        hasAncestorTag,
        deepQueryAll,
        deepQueryVisible,
        deepFirstVisible,
        deepElementFromPoint,
        isExtensionNode,
        hasExcludedAncestor,
        getEffectiveHref,
        isDisabledControl,
        resolveNativeButton,
        isButtonActionable,
        belongsToElement,
        probeUnobscuredPoint,
        isElementUnobscured,
        collectVisibleText,
        isCancelForbiddenControl,
        isContainerVisiblyMounted,
        deepQueryMounted,
        findMountedContainer,
        detectUploadWizardStep,
        isUploadEditorVisible,
        isPostSaveDialogElement,
        findSafePostSaveCloseControl,
        inspectStudioState,
        parseStudioUrl,
        extractChannelId,
        inspectLeftNav,
        inspectBackToChannelLinks,
        inspectHeaderAndMenus,
        inspectUploadDialogDetailed,
        inspectVideoTableSummary,
        getPageContext,
        matchesAnyPattern,
        probeCandidateForClick,
        verifyPointStillHitsToken,
    };
})();
"""


async def eval_studio_dom(page: Any, body_js: str, arg: Any = None) -> Any:
    """Execute a JS snippet with __rtmDom helpers bound cleanly in scope."""
    script = f"(arg) => {{\n{STUDIO_DOM_JS_LIB}\n{body_js}\n}}"
    if arg is None:
        return await page.evaluate(script)
    return await page.evaluate(script, arg)


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
    }


async def get_studio_context(page: Any) -> Dict[str, Any]:
    """Return full real-time YouTube Studio URL, scope, leftNav, menus, upload & table context."""
    try:
        res = await eval_studio_dom(page, "return __rtmDom.getPageContext();")
        if isinstance(res, dict):
            return res
    except Exception as exc:
        logger.debug("get_studio_context failed: %s", exc)
    raw_url = str(getattr(page, "url", "") or "")
    channel_id = ""
    video_id = ""
    page_type = "unknown"
    scope = "other"
    ch_m = re.search(r"/channel/([^/?#]+)", raw_url)
    if ch_m:
        channel_id = ch_m.group(1)
        scope = "channel"
        if re.search(r"/channel/[^/]+/videos(?:/|$|\?)", raw_url):
            page_type = "channel_content_videos"
        elif re.search(r"/channel/[^/]+/analytics", raw_url):
            page_type = "channel_analytics"
        else:
            page_type = "channel_other"
    else:
        v_m = re.search(r"/video/([^/?#]+)", raw_url)
        if v_m:
            video_id = v_m.group(1)
            scope = "video"
            if "/analytics" in raw_url:
                page_type = "video_analytics"
            elif "/edit" in raw_url:
                page_type = "video_edit"
            elif "/copyright" in raw_url:
                page_type = "video_copyright"
            else:
                page_type = "video_other"
    return {
        "url": raw_url,
        "pageType": page_type,
        "scope": scope,
        "channelId": channel_id,
        "videoId": video_id,
        "leftNav": [],
        "backToChannelLinks": [],
        "headerMenus": {"createButtonVisible": False, "activeMenuKind": None, "menuItems": []},
        "uploadState": {},
        "tableSummary": {"rowCount": 0, "visibleRowCount": 0, "hasTableHost": False},
    }


def _url_matches_patterns(url_str: str, patterns: Optional[Iterable[str]]) -> bool:
    if not url_str or not patterns:
        return False
    for p in patterns:
        if not p:
            continue
        try:
            if re.search(p, url_str, flags=re.IGNORECASE):
                return True
        except re.error:
            if p.lower() in url_str.lower():
                return True
    return False


async def wait_for_stable_actionable(
    page: Any,
    selectors: List[str],
    timeout_ms: int = 8000,
    require_unobscured: bool = True,
    require_enabled: bool = True,
    root_selector: Optional[str] = None,
    exclude_ancestors: Optional[List[str]] = None,
    allow_href_patterns: Optional[List[str]] = None,
    forbidden_href_patterns: Optional[List[str]] = None,
    allow_inside_video_row: bool = False,
    forbid_cancel_controls: bool = True,
    prefer_top_layer_tooltip: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Poll until a deep-DOM target matching any selector is visible, optionally
    enabled & unobscured by backdrops, matches href/ancestor guards, and maintains
    a stable bounding box. Returns candidate metadata (including TOCTOU token) or None.
    """
    deadline = time.time() + max(timeout_ms, 500) / 1000.0
    prev_rect: Optional[tuple] = None
    last_probe: Any = None

    while time.time() < deadline:
        try:
            probe = await eval_studio_dom(
                page,
                "return __rtmDom.probeCandidateForClick(arg);",
                {
                    "selectors": selectors,
                    "rootSelector": root_selector,
                    "requireEnabled": require_enabled,
                    "requireUnobscured": require_unobscured,
                    "excludeAncestors": exclude_ancestors or [],
                    "allowHrefPatterns": allow_href_patterns or [],
                    "forbiddenHrefPatterns": forbidden_href_patterns or [],
                    "allowInsideVideoRow": allow_inside_video_row,
                    "forbidCancelControls": forbid_cancel_controls,
                    "preferTopLayerTooltip": prefer_top_layer_tooltip,
                },
            )
            last_probe = probe
            if isinstance(probe, dict) and probe.get("ok"):
                cur_rect = (
                    round(float(probe.get("left", probe["x"]))),
                    round(float(probe.get("top", probe["y"]))),
                    round(float(probe.get("width", 0))),
                    round(float(probe.get("height", 0))),
                )
                if prev_rect is not None and all(abs(a - b) <= 2 for a, b in zip(prev_rect, cur_rect)):
                    return probe
                prev_rect = cur_rect
            else:
                prev_rect = None
        except Exception as exc:
            logger.debug("wait_for_stable_actionable probe error: %s", exc)
            last_probe = {"ok": False, "reason": f"exception:{exc}"}
            prev_rect = None
        await asyncio.sleep(0.18)

    if isinstance(last_probe, dict):
        logger.warning(
            "[DOM] wait_for_stable_actionable timeout root=%s reason=%s rejected=%s selectors=%s",
            root_selector or "<document>",
            last_probe.get("reason"),
            (last_probe.get("rejected") or [])[:4],
            selectors[:4],
        )
    return None


async def click_stable_element(
    page: Any,
    selectors: List[str],
    timeout_ms: int = 8000,
    pre_delay: float = 0.35,
    root_selector: Optional[str] = None,
    allow_js_fallback: bool = True,
) -> Optional[str]:
    """
    Wait until target element is visible, enabled, unobscured, and geometrically
    stable, pause deliberately, re-verify point ownership, and click via mouse.
    """
    target = await wait_for_stable_actionable(
        page,
        selectors=selectors,
        timeout_ms=timeout_ms,
        require_unobscured=True,
        require_enabled=True,
        root_selector=root_selector,
        forbidden_href_patterns=DEFAULT_FORBIDDEN_HREF_PATTERNS,
    )
    if target:
        if pre_delay > 0:
            await asyncio.sleep(pre_delay)
        try:
            await page.mouse.move(target["x"], target["y"], steps=5)
            await asyncio.sleep(0.08)
            verify = await eval_studio_dom(
                page,
                "return __rtmDom.verifyPointStillHitsToken(arg.token, arg.x, arg.y, 6);",
                {"token": target.get("token"), "x": target["x"], "y": target["y"]},
            )
            if isinstance(verify, dict) and verify.get("ok"):
                click_x = float(verify.get("x", target["x"]))
                click_y = float(verify.get("y", target["y"]))
                await page.mouse.click(click_x, click_y)
                return f"mouse:{target['matchedSelector']}"
            logger.warning(
                "[DOM] click_stable_element aborted before click selector=%s reason=%s",
                target.get("matchedSelector"),
                verify,
            )
        except Exception as exc:
            logger.debug("click_stable_element mouse click failed: %s", exc)

    if not allow_js_fallback:
        return None

    # Fallback only when element is still unobscured & passes forbidden-href/cancel guards
    try:
        clicked_sel = await eval_studio_dom(
            page,
            """
            const { selectors, rootSelector, forbiddenPatterns } = arg;
            const res = __rtmDom.probeCandidateForClick({
                selectors,
                rootSelector,
                requireUnobscured: true,
                requireEnabled: true,
                forbidCancelControls: true,
                forbiddenHrefPatterns: forbiddenPatterns || [],
            });
            if (!res || !res.ok || !res.token) return null;
            const entry = (window.__rtmTokenMap && window.__rtmTokenMap.get(res.token)) || null;
            if (!entry || !entry.nativeBtn) return null;
            if ((entry.nativeBtn.tagName || '').toUpperCase() === 'A') return null;
            entry.nativeBtn.click();
            return 'js:' + res.matchedSelector;
            """,
            {
                "selectors": selectors,
                "rootSelector": root_selector,
                "forbiddenPatterns": DEFAULT_FORBIDDEN_HREF_PATTERNS,
            },
        )
        return clicked_sel
    except Exception as exc:
        logger.debug("click_stable_element js fallback error: %s", exc)
        return None


async def safe_targeted_click(
    page: Any,
    selectors: List[str],
    action_name: str = "click",
    root_selector: Optional[str] = None,
    timeout_ms: int = 8000,
    pre_delay: float = 0.25,
    allowed_page_types: Optional[Iterable[str]] = None,
    exclude_ancestors: Optional[List[str]] = None,
    allow_href_patterns: Optional[List[str]] = None,
    forbidden_href_patterns: Optional[List[str]] = None,
    allow_inside_video_row: bool = False,
    forbid_cancel_controls: bool = True,
    prefer_top_layer_tooltip: bool = False,
    allow_js_fallback: bool = False,
    verify_fn: Optional[Callable[[Dict[str, Any]], Any]] = None,
    post_click_settle: float = 0.2,
) -> Dict[str, Any]:
    """
    Context-aware, href-guarded, TOCTOU-verified click primitive with structured [DOM] logs.
    Never performs unscoped document fallbacks or unverified coordinate clicks.
    """
    eff_forbidden = DEFAULT_FORBIDDEN_HREF_PATTERNS if forbidden_href_patterns is None else list(forbidden_href_patterns)
    allowed_types_set = set(allowed_page_types) if allowed_page_types else None

    ctx_before = await get_studio_context(page)
    before_page_type = str(ctx_before.get("pageType") or "unknown")
    before_url = str(ctx_before.get("url") or getattr(page, "url", "") or "")

    if allowed_types_set is not None and before_page_type not in allowed_types_set:
        logger.warning(
            "[DOM] %s skipped: wrong_page_type current=%s allowed=%s url=%s",
            action_name,
            before_page_type,
            sorted(allowed_types_set),
            before_url,
        )
        return {
            "ok": False,
            "reason": "wrong_page_type",
            "beforePageType": before_page_type,
            "beforeUrl": before_url,
            "afterPageType": before_page_type,
            "afterUrl": before_url,
        }

    deadline = time.time() + max(timeout_ms, 500) / 1000.0
    last_reason = "no_match"

    for retry_idx in range(3):
        rem_ms = int(max((deadline - time.time()) * 1000.0, 400))
        target = await wait_for_stable_actionable(
            page,
            selectors=selectors,
            timeout_ms=rem_ms,
            require_unobscured=True,
            require_enabled=True,
            root_selector=root_selector,
            exclude_ancestors=exclude_ancestors,
            allow_href_patterns=allow_href_patterns,
            forbidden_href_patterns=eff_forbidden,
            allow_inside_video_row=allow_inside_video_row,
            forbid_cancel_controls=forbid_cancel_controls,
            prefer_top_layer_tooltip=prefer_top_layer_tooltip,
        )
        if not target:
            last_reason = "not_found_or_unstable"
            break

        if pre_delay > 0:
            await asyncio.sleep(pre_delay)

        try:
            await page.mouse.move(target["x"], target["y"], steps=5)
            await asyncio.sleep(0.08)
            verify = await eval_studio_dom(
                page,
                "return __rtmDom.verifyPointStillHitsToken(arg.token, arg.x, arg.y, 6);",
                {"token": target.get("token"), "x": target["x"], "y": target["y"]},
            )
            if not isinstance(verify, dict) or not verify.get("ok"):
                last_reason = str((verify or {}).get("reason") or "verify_failed")
                logger.warning(
                    "[DOM] %s aborted_before_click retry=%d selector=%s reason=%s hitTag=%s hitId=%s",
                    action_name,
                    retry_idx + 1,
                    target.get("matchedSelector"),
                    last_reason,
                    (verify or {}).get("hitTag", ""),
                    (verify or {}).get("hitId", ""),
                )
                if time.time() < deadline:
                    await asyncio.sleep(0.15)
                    continue
                break

            click_x = float(verify.get("x", target["x"]))
            click_y = float(verify.get("y", target["y"]))
            logger.info(
                "[DOM] %s page=%s target=%s tag=%s id=%s href=%s pos=(%d,%d) text=%r",
                action_name,
                before_page_type,
                target.get("matchedSelector"),
                target.get("tag"),
                target.get("id"),
                target.get("href") or "",
                round(click_x),
                round(click_y),
                target.get("text") or "",
            )
            await page.mouse.click(click_x, click_y)
            if post_click_settle > 0:
                await asyncio.sleep(post_click_settle)

            ctx_after = await get_studio_context(page)
            after_url = str(ctx_after.get("url") or getattr(page, "url", "") or "")
            after_page_type = str(ctx_after.get("pageType") or "unknown")

            if eff_forbidden and _url_matches_patterns(after_url, eff_forbidden):
                logger.error(
                    "[DOM] %s navigated_to_forbidden_url before=%s after=%s",
                    action_name,
                    before_url,
                    after_url,
                )
                return {
                    "ok": False,
                    "reason": "navigated_to_forbidden_url",
                    "method": f"mouse:{target.get('matchedSelector')}",
                    "selector": target.get("matchedSelector"),
                    "tag": target.get("tag"),
                    "id": target.get("id"),
                    "href": target.get("href") or "",
                    "text": target.get("text") or "",
                    "beforeUrl": before_url,
                    "afterUrl": after_url,
                    "beforePageType": before_page_type,
                    "afterPageType": after_page_type,
                    "context": ctx_after,
                }

            verified_ok = True
            if verify_fn is not None:
                res_check = verify_fn(ctx_after)
                if asyncio.iscoroutine(res_check):
                    res_check = await res_check
                verified_ok = bool(res_check)
                if not verified_ok:
                    logger.warning(
                        "[DOM] %s post_verify_failed method=%s page=%s->%s",
                        action_name,
                        f"mouse:{target.get('matchedSelector')}",
                        before_page_type,
                        after_page_type,
                    )

            return {
                "ok": verified_ok,
                "reason": "ok" if verified_ok else "post_verify_failed",
                "method": f"mouse:{target.get('matchedSelector')}",
                "selector": target.get("matchedSelector"),
                "tag": target.get("tag"),
                "id": target.get("id"),
                "href": target.get("href") or "",
                "text": target.get("text") or "",
                "beforeUrl": before_url,
                "afterUrl": after_url,
                "beforePageType": before_page_type,
                "afterPageType": after_page_type,
                "context": ctx_after,
            }
        except Exception as exc:
            last_reason = f"exception:{exc}"
            logger.debug("[DOM] %s click error: %s", action_name, exc)
            break

    if allow_js_fallback:
        try:
            js_probe = await eval_studio_dom(
                page,
                """
                const res = __rtmDom.probeCandidateForClick(arg);
                if (!res || !res.ok || !res.token) return res || { ok: false, reason: 'js_probe_none' };
                const entry = window.__rtmTokenMap && window.__rtmTokenMap.get(res.token);
                if (!entry || !entry.nativeBtn) return { ok: false, reason: 'js_entry_missing' };
                if ((entry.nativeBtn.tagName || '').toUpperCase() === 'A') {
                    return { ok: false, reason: 'js_refuses_anchor_nav' };
                }
                entry.nativeBtn.click();
                return res;
                """,
                {
                    "selectors": selectors,
                    "rootSelector": root_selector,
                    "requireUnobscured": True,
                    "requireEnabled": True,
                    "forbidCancelControls": forbid_cancel_controls,
                    "allowInsideVideoRow": allow_inside_video_row,
                    "excludeAncestors": exclude_ancestors or [],
                    "allowHrefPatterns": allow_href_patterns or [],
                    "forbiddenHrefPatterns": eff_forbidden,
                    "preferTopLayerTooltip": prefer_top_layer_tooltip,
                },
            )
            if isinstance(js_probe, dict) and js_probe.get("ok"):
                if post_click_settle > 0:
                    await asyncio.sleep(post_click_settle)
                ctx_after = await get_studio_context(page)
                after_url = str(ctx_after.get("url") or getattr(page, "url", "") or "")
                after_page_type = str(ctx_after.get("pageType") or "unknown")
                verified_ok = True
                if eff_forbidden and _url_matches_patterns(after_url, eff_forbidden):
                    return {
                        "ok": False,
                        "reason": "navigated_to_forbidden_url",
                        "method": f"js:{js_probe.get('matchedSelector')}",
                        "beforeUrl": before_url,
                        "afterUrl": after_url,
                        "beforePageType": before_page_type,
                        "afterPageType": after_page_type,
                        "context": ctx_after,
                    }
                if verify_fn is not None:
                    res_check = verify_fn(ctx_after)
                    if asyncio.iscoroutine(res_check):
                        res_check = await res_check
                    verified_ok = bool(res_check)
                return {
                    "ok": verified_ok,
                    "reason": "ok" if verified_ok else "post_verify_failed",
                    "method": f"js:{js_probe.get('matchedSelector')}",
                    "selector": js_probe.get("matchedSelector"),
                    "tag": js_probe.get("tag"),
                    "id": js_probe.get("id"),
                    "href": js_probe.get("href") or "",
                    "text": js_probe.get("text") or "",
                    "beforeUrl": before_url,
                    "afterUrl": after_url,
                    "beforePageType": before_page_type,
                    "afterPageType": after_page_type,
                    "context": ctx_after,
                }
        except Exception as exc:
            last_reason = f"js_exception:{exc}"

    logger.warning(
        "[DOM] %s failed page=%s root=%s reason=%s selectors=%s",
        action_name,
        before_page_type,
        root_selector or "<document>",
        last_reason,
        selectors[:4],
    )
    return {
        "ok": False,
        "reason": last_reason,
        "beforePageType": before_page_type,
        "beforeUrl": before_url,
        "afterPageType": before_page_type,
        "afterUrl": before_url,
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


def build_extract_table_rows_js() -> str:
    """
    Build a language-agnostic JS script that extracts visible-only fields and
    Polymer progress/spinner/badge signals from every `ytcp-video-row`.
    """
    return f"""() => {{
{STUDIO_DOM_JS_LIB}
        const collectLinks = (root) => {{
            const links = [];
            const visit = (node) => {{
                if (!node) return;
                if (node.tagName && node.tagName.toLowerCase() === 'a' && node.getAttribute('href')) {{
                    links.push(node.getAttribute('href'));
                }}
                if (node.shadowRoot) {{
                    for (const ch of node.shadowRoot.children) visit(ch);
                }}
                if (node.children) {{
                    for (const ch of node.children) visit(ch);
                }}
            }};
            visit(root);
            return links;
        }};

        const rowList = [];
        const rows = document.querySelectorAll('ytcp-video-row');
        rows.forEach((row, idx) => {{
            let vid = '';
            const links = collectLinks(row);
            for (const href of links) {{
                let m = href.match(/\\/video\\/([^\\/\\?]+)/);
                if (m) {{ vid = m[1]; break; }}
                m = href.match(/\\/shorts\\/([^\\/\\?]+)/);
                if (m) {{ vid = m[1]; break; }}
                m = href.match(/youtu\\.be\\/([^\\/\\?]+)/);
                if (m) {{ vid = m[1]; break; }}
                m = href.match(/[\\?&]v=([^&]+)/);
                if (m) {{ vid = m[1]; break; }}
            }}
            if (!vid) {{
                vid = row.getAttribute('video-id') || row.id || '';
            }}

            const titleEl = __rtmDom.deepFirstVisible(row, '#video-title, .video-title-text, #video-title-text, #title');
            const title = titleEl ? __rtmDom.collectVisibleText(titleEl) : '';

            const restrCell = __rtmDom.deepFirstVisible(
                row,
                '#notices, ytcp-table-cell-notices, .tablecell-notices, .table-cell-notices, [cell-id="notices"], .notices-column, ' +
                '#restrictions, ytcp-table-cell-restrictions, .tablecell-restrictions, .table-cell-restrictions, [cell-id="restrictions"], .restrictions-column'
            );
            let restrictions = restrCell ? __rtmDom.collectVisibleText(restrCell) : '';
            if (!restrictions && restrCell) {{
                restrictions = (restrCell.getAttribute('aria-label') || restrCell.getAttribute('title') || '').trim();
            }}

            const noticesIconNames = [];
            let hasDetailsAction = false;
            if (restrCell) {{
                const icons = __rtmDom.deepQueryVisible(restrCell, 'tp-yt-iron-icon, yt-icon');
                for (const ic of icons) {{
                    const name = (ic.getAttribute('icon') || ic.getAttribute('aria-label') || '').trim().toLowerCase();
                    if (name) noticesIconNames.push(name);
                }}
                const btns = __rtmDom.deepQueryVisible(restrCell, 'ytcp-button, button, a[href], .restriction-link, #details-button');
                hasDetailsAction = btns.length > 0;
            }}

            const monetCell = __rtmDom.deepFirstVisible(
                row,
                '#monetization, ytcp-table-cell-monetization, .tablecell-monetization, .table-cell-monetization, [cell-id="monetization"]'
            );
            const monetization = monetCell ? __rtmDom.collectVisibleText(monetCell) : '';
            const monetIconNames = [];
            if (monetCell) {{
                const mIcons = __rtmDom.deepQueryVisible(monetCell, 'tp-yt-iron-icon, yt-icon');
                for (const ic of mIcons) {{
                    const name = (ic.getAttribute('icon') || ic.getAttribute('aria-label') || '').trim().toLowerCase();
                    if (name) monetIconNames.push(name);
                }}
            }}

            const statusCellsText = __rtmDom.collectVisibleText(
                row,
                ['#video-title', '#video-title-text', 'video-title-text', '#description', '#description-text', 'description']
            );

            const progressCell = __rtmDom.deepFirstVisible(
                row,
                'ytcp-video-row-progress, .upload-progress, #upload-status, .subtitle, #subtitle, .video-status-text, ytcp-video-row-cell-details, .video-list-cell-status'
            );
            const subtitle = progressCell ? __rtmDom.collectVisibleText(
                progressCell,
                ['#video-title', '#video-title-text', 'video-title-text', '#description', '#description-text', 'description']
            ) : '';

            // Read structural Polymer progressbar value (only if visibly rendered)
            let progressValue = null;
            const pb = __rtmDom.deepFirstVisible(row, 'tp-yt-paper-progress, [role="progressbar"]');
            if (pb) {{
                const rawVal = pb.getAttribute('value') ?? pb.getAttribute('aria-valuenow');
                const rawMax = parseFloat(pb.getAttribute('max') || pb.getAttribute('aria-valuemax') || '100');
                if (rawVal !== null && rawVal !== '' && !Number.isNaN(Number(rawVal))) {{
                    const pct = rawMax > 0 && rawMax !== 100 ? (Number(rawVal) / rawMax) * 100 : Number(rawVal);
                    if (pct >= 0 && pct <= 100) {{
                        progressValue = Math.round(pct);
                    }}
                }}
            }}

            // Detect ACTUALLY visible cancel-upload button (never from hidden DOM templates or hover row menus!)
            let cancelUploadVisible = false;
            const rowButtons = __rtmDom.deepQueryVisible(
                row,
                '#cancel-upload-button, [id*="cancel-upload" i], [test-id*="cancel-upload" i], ytcp-video-row-progress ytcp-button, ytcp-button, button'
            );
            for (const btn of rowButtons) {{
                if (btn.closest && (btn.closest('#hover-items') || btn.closest('.hover-items') || btn.closest('#row-actions'))) continue;
                const bid = (btn.id || '').toLowerCase();
                const btid = (btn.getAttribute('test-id') || '').toLowerCase();
                const bal = (btn.getAttribute('aria-label') || '').toLowerCase();
                const btxt = __rtmDom.collectVisibleText(btn).toLowerCase();
                const combined = `${{bid}} ${{btid}} ${{bal}} ${{btxt}}`;
                if (
                    bid.includes('cancel')
                    || btid.includes('cancel')
                    || combined.includes('huỷ tải')
                    || combined.includes('hủy tải')
                    || combined.includes('cancel upload')
                    || combined.includes('annuler')
                    || combined.includes('cancelar')
                    || combined.includes('abbrechen')
                    || combined.includes('отменить')
                    || combined.includes('キャンセル')
                    || combined.includes('취소')
                    || combined.includes('取消')
                    || combined.includes('ยกเลิก')
                    || combined.includes('cancel')
                    || (btn.closest && btn.closest('ytcp-video-row-progress'))
                ) {{
                    cancelUploadVisible = true;
                    break;
                }}
            }}

            const hasActiveSpinner = __rtmDom.deepQueryVisible(
                row,
                'tp-yt-paper-spinner[active], tp-yt-paper-spinner-lite[active], tp-yt-paper-spinner:not([hidden])'
            ).some(sp => sp.hasAttribute('active'));

            const rowIcons = __rtmDom.deepQueryVisible(row, 'tp-yt-iron-icon, yt-icon')
                .map(ic => (ic.getAttribute('icon') || ic.getAttribute('aria-label') || '').trim().toLowerCase())
                .filter(Boolean);

            rowList.push({{
                rowIndex: idx,
                vid,
                title,
                restrictions,
                noticesIconNames,
                hasDetailsAction,
                monetization,
                monetIconNames,
                statusCellsText,
                subtitle,
                progressValue,
                cancelUploadVisible,
                hasActiveSpinner,
                rowIcons,
            }});
        }});
        return rowList;
    }}"""
