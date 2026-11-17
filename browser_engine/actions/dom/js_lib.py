# -*- coding: utf-8 -*-
"""
Language-agnostic JavaScript library for deep Shadow DOM traversal and element inspection.
"""
from __future__ import annotations

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
                        || comb.includes('đã hiểu')
                        || comb.includes('got it')
                        || comb.includes('知道了')
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

    function inspectAndDismissBlockingDialog(opts = {}) {
        const candidates = deepQueryMounted(
            document,
            'ytcp-confirmation-dialog, ytcp-dialog, tp-yt-paper-dialog, [role="dialog"]'
        );
        for (const dlg of candidates) {
            if (!isContainerVisiblyMounted(dlg)) continue;
            const tag = (dlg.tagName || '').toLowerCase();
            if (tag === 'ytcp-uploads-dialog') continue;
            if (hasAncestorTag(dlg, new Set(['ytcp-uploads-dialog', 'ytcp-video-row']))) continue;

            const fullText = (collectVisibleText(dlg) || '').toLowerCase();
            if (!fullText) continue;

            // Nhận diện thông báo Hoàn tất / Sẵn sàng / Quyền tính năng
            const isAllSet = (
                fullText.includes("bạn đã hoàn tất")
                || fullText.includes("tất cả đã sẵn sàng")
                || fullText.includes("bạn đã sẵn sàng")
                || fullText.includes("quyền sử dụng tính năng này")
                || fullText.includes("you're all set")
                || fullText.includes("you are all set")
                || fullText.includes("all set")
                || fullText.includes("use these features now")
                || fullText.includes("ready to upload")
                || fullText.includes("feature eligibility")
                || fullText.includes("features unlocked")
                || fullText.includes("ya está todo listo")
                || fullText.includes("tout est prêt")
                || fullText.includes("alles bereit")
                || fullText.includes("все готово")
                || fullText.includes("全部就绪")
                || fullText.includes("設定が完了しました")
            );

            // Nhận diện thông điệp yêu cầu làm mới trang
            const needsReload = (
                fullText.includes("hãy thử làm mới trang")
                || fullText.includes("làm mới trang")
                || fullText.includes("tải lại trang")
                || fullText.includes("try refreshing the page")
                || fullText.includes("refresh the page")
                || fullText.includes("reload the page")
                || fullText.includes("actualizar la página")
                || fullText.includes("actualiser la page")
                || fullText.includes("seite neu laden")
                || fullText.includes("перезагрузить страницу")
                || fullText.includes("请刷新页面")
                || fullText.includes("ページを再読み込み")
            );

            if (!isAllSet && !needsReload) continue;

            // Tìm nút an toàn để dismiss
            const btns = deepQueryVisible(
                dlg,
                '#confirm-button, [dialog-confirm], #dismiss-button, [dialog-dismiss], ytcp-button.ytcp-confirmation-dialog, ytcp-button#primary-action-button, ytcp-button, button'
            );
            for (const b of btns) {
                const btxt = (collectVisibleText(b) || '').toLowerCase();
                const bid = (b.id || '').toLowerCase();
                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                const combined = `${bid} ${btxt} ${aria}`;

                if (isCancelForbiddenControl(b)) continue;
                if (combined.includes('hủy') || combined.includes('cancel') || combined.includes('không')) continue;

                const isSafeConfirm = (
                    bid.includes('confirm')
                    || bid.includes('dismiss')
                    || b.hasAttribute('dialog-confirm')
                    || /\b(got it|đã hiểu|xong|done|ok|tiếp tục|continue|làm mới|refresh|đóng|close)\b/i.test(combined)
                    || combined.includes('đã hiểu')
                    || combined.includes('got it')
                    || combined.includes('閉じる')
                    || combined.includes('知道了')
                );

                if (isSafeConfirm) {
                    const nativeBtn = resolveNativeButton(b) || b;
                    nativeBtn.click();
                    return {
                        found: true,
                        clicked: true,
                        needsReload: needsReload,
                        isAllSet: isAllSet,
                        buttonText: btxt || bid,
                        sample: fullText.slice(0, 100),
                    };
                }
            }
        }
        return { found: false, clicked: false, needsReload: false };
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
        inspectAndDismissBlockingDialog,
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


STUDIO_DOM_INIT_SCRIPT = f"""() => {{
    if (typeof window !== 'undefined' && !window.__rtmDom) {{
        {STUDIO_DOM_JS_LIB}
        window.__rtmDom = __rtmDom;
    }}
    return true;
}}"""

_DOM_CACHE_MISS_SENTINEL = "__RTM_DOM_CACHE_MISS_7f8a9b__"



def build_extract_table_rows_js() -> str:
    """
    Build a language-agnostic JS script that extracts visible-only fields and
    Polymer progress/spinner/badge signals from every `ytcp-video-row`.
    """
    return f"""() => {{
        let __rtmDom = window.__rtmDom;
        if (!__rtmDom) {{
{STUDIO_DOM_JS_LIB}
            window.__rtmDom = __rtmDom;
        }}
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
                '#cancel-upload-button, [id*="cancel-upload" i], [test-id*="cancel-upload" i], ytcp-video-row-progress #cancel-button, ytcp-video-row-progress [id*="cancel" i]'
            );
            for (const btn of rowButtons) {{
                if (btn.closest && (btn.closest('#hover-items') || btn.closest('.hover-items') || btn.closest('#row-actions'))) continue;
                const bid = (btn.id || '').toLowerCase();
                const btid = (btn.getAttribute('test-id') || '').toLowerCase();
                const bal = (btn.getAttribute('aria-label') || '').toLowerCase();
                const btxt = __rtmDom.collectVisibleText(btn).toLowerCase();
                const combined = `${{bid}} ${{btid}} ${{bal}} ${{btxt}}`;
                if (
                    bid.includes('cancel-upload')
                    || btid.includes('cancel-upload')
                    || combined.includes('cancel upload')
                    || combined.includes('huỷ tải')
                    || combined.includes('hủy tải')
                    || combined.includes('annuler la mise')
                    || combined.includes('cancelar subida')
                    || combined.includes('cancelar envio')
                    || combined.includes('upload abbrechen')
                    || combined.includes('отменить загруз')
                    || combined.includes('アップロードをキャンセル')
                    || combined.includes('업로드 취소')
                    || combined.includes('取消上传')
                    || combined.includes('取消上傳')
                    || combined.includes('ยกเลิกการอัปโหลด')
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
