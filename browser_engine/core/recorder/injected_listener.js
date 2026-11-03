(() => {
  // Recorder is top-frame only; never attach handlers inside ads/OOPIF frames.
  if (window.self !== window.top) return;
  const MARKER = '__browserMultiRecorderInstalled';
  const ACTIVE_MARKER = '__browserMultiRecorderActive';
  const CLEANUP = '__browserMultiRecorderCleanup';
  const MAX_TEXT = 160;
  const DEBOUNCE_MS = 600;
  const SCROLL_THRESHOLD = 80;
  const timers = new WeakMap();
  const listeners = [];
  const historyMethods = ['pushState', 'replaceState'];

  if (window[MARKER] || typeof window.__recordBrowserMultiAction !== 'function') return;
  window[MARKER] = true;
  window[ACTIVE_MARKER] = true;

  const clean = (value, max = MAX_TEXT) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  const attr = (element, name) => clean(element.getAttribute(name));
  const isEditable = (element) => {
    if (!element || element.nodeType !== 1) return false;
    const tag = String(element.tagName || '').toLowerCase();
    if (tag === 'input' && String(element.getAttribute('type') || '').toLowerCase() === 'file')
      return false;
    return (
      ['input', 'textarea', 'select'].includes(tag) ||
      element.isContentEditable ||
      element.hasAttribute('contenteditable')
    );
  };
  const sensitiveField = (element) => {
    const type = String(element?.getAttribute?.('type') || '').toLowerCase();
    const autocomplete = String(element?.getAttribute?.('autocomplete') || '').toLowerCase();
    const hint = [
      type,
      autocomplete,
      element?.getAttribute?.('name'),
      element?.getAttribute?.('id'),
      element?.getAttribute?.('aria-label'),
      element?.getAttribute?.('placeholder'),
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');
    return (
      String(element?.tagName || '').toLowerCase() === 'textarea' ||
      Boolean(element?.isContentEditable || element?.hasAttribute?.('contenteditable')) ||
      type === 'password' ||
      /password|passcode|secret|token|otp|one[\s-]?time|credit[\s-]?card|security[\s-]?code|api[\s-]?key|private[\s-]?key/.test(
        hint,
      )
    );
  };
  const stableId = (value) =>
    value && !/^[a-f0-9]{8,}$/i.test(value) && !/\d{5,}/.test(value) ? value : '';
  const unique = (selector) => {
    try {
      return selector && document.querySelectorAll(selector).length === 1 ? selector : '';
    } catch (_) {
      return '';
    }
  };
  const escaped = (value) => {
    try {
      return CSS.escape(value);
    } catch (_) {
      return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }
  };
  const selectorData = (element) => {
    if (!element || element.nodeType !== 1) return null;
    const tag = String(element.tagName || '').toLowerCase();
    const role = attr(element, 'role');
    const ariaLabel = attr(element, 'aria-label');
    const name = attr(element, 'name');
    const id = stableId(attr(element, 'id'));
    const testId = attr(element, 'data-testid') || attr(element, 'data-test-id');
    const selectors = [];
    const add = (selector) => {
      const candidate = unique(selector);
      if (candidate && !selectors.includes(candidate) && selectors.length < 5)
        selectors.push(candidate);
    };
    if (testId) add(`[data-testid="${escaped(testId)}"]`);
    if (ariaLabel) add(`[aria-label="${escaped(ariaLabel)}"]`);
    if (name && tag) add(`${tag}[name="${escaped(name)}"]`);
    if (id) add(`#${escaped(id)}`);
    if (!selectors.length && role && ariaLabel)
      add(`[role="${escaped(role)}"][aria-label="${escaped(ariaLabel)}"]`);
    return {
      tag,
      role,
      aria_label: ariaLabel,
      name,
      id,
      data_testid: testId,
      type: attr(element, 'type'),
      autocomplete: attr(element, 'autocomplete'),
      contenteditable: element.isContentEditable ? 'true' : attr(element, 'contenteditable'),
      text: '',
      selectors,
    };
  };
  const interactive = (element) => {
    if (!element || element.nodeType !== 1) return null;
    let current = element;
    while (current && current !== document.body && current !== document.documentElement) {
      const tag = String(current.tagName || '').toLowerCase();
      const role = String(current.getAttribute('role') || '').toLowerCase();
      const clickable =
        ['button', 'a', 'input', 'textarea', 'select', 'option'].includes(tag) ||
        ['button', 'link', 'menuitem', 'tab', 'option', 'textbox', 'combobox'].includes(role) ||
        current.isContentEditable ||
        current.hasAttribute('contenteditable');
      if (clickable) return current;
      current = current.parentElement;
    }
    return null;
  };
  const validClickTarget = (element) => {
    if (!element || element === document.body || element === document.documentElement) return false;
    const tag = String(element.tagName || '').toLowerCase();
    const role = String(element.getAttribute('role') || '').toLowerCase();
    return (
      ['button', 'a', 'input', 'textarea', 'select', 'option'].includes(tag) ||
      ['button', 'link', 'menuitem', 'tab', 'option', 'textbox', 'combobox'].includes(role) ||
      element.isContentEditable ||
      element.hasAttribute('contenteditable')
    );
  };
  const safeUrl = () => {
    try {
      const url = new URL(location.href);
      return `${url.origin}${url.pathname || '/'}`.slice(0, 500);
    } catch (_) {
      return '';
    }
  };
  let seq = 0;
  const emit = (payload) => {
    try {
      if (!window[ACTIVE_MARKER]) return;
      const binding = window.__recordBrowserMultiAction;
      if (typeof binding === 'function')
        Promise.resolve(
          binding({ ...payload, url: safeUrl(), title: clean(document.title, 200), seq: ++seq }),
        ).catch(() => {});
    } catch (_) {}
  };
  const clearInputTimer = (element) => {
    if (!element) return;
    const timer = timers.get(element);
    if (timer) clearTimeout(timer);
    timers.delete(element);
  };
  const emitInput = (element, eventType) => {
    if (!isEditable(element)) return;
    clearInputTimer(element);
    const info = selectorData(element);
    if (!info) return;
    const sensitive = sensitiveField(element);
    const value = sensitive ? '' : clean(element.value || element.textContent, 500);
    emit({
      type: eventType === 'change' ? 'fill' : 'input',
      target: info,
      value: sensitive ? '' : value,
      redacted: sensitive,
    });
  };
  const scheduleInput = (element) => {
    if (!isEditable(element)) return;
    clearInputTimer(element);
    timers.set(
      element,
      setTimeout(() => emitInput(element, 'input'), DEBOUNCE_MS),
    );
  };
  const emitNavigation = () => emit({ type: 'navigate', target: { selectors: [] } });
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };
  listen(
    document,
    'click',
    (event) => {
      const element = interactive(event.target);
      if (!validClickTarget(element)) return;
      const info = selectorData(element);
      if (!info || !info.selectors.length) return;
      emit({
        type: 'click',
        target: info,
        x: Number(event.clientX) || 0,
        y: Number(event.clientY) || 0,
      });
    },
    true,
  );
  listen(document, 'input', (event) => scheduleInput(interactive(event.target)), true);
  listen(document, 'change', (event) => emitInput(interactive(event.target), 'change'), true);
  listen(document, 'blur', (event) => emitInput(interactive(event.target), 'change'), true);
  listen(
    document,
    'submit',
    (event) => emitInput(interactive(event.target?.activeElement), 'change'),
    true,
  );
  listen(
    document,
    'keydown',
    (event) => {
      if (event.key !== 'Enter') return;
      const element = interactive(event.target);
      const info = selectorData(element);
      if (info && (validClickTarget(element) || isEditable(element)))
        emit({ type: 'key', key: 'Enter', target: info });
    },
    true,
  );
  let lastScroll = { x: window.scrollX || 0, y: window.scrollY || 0 };
  let scrollTimer = 0;
  listen(
    window,
    'scroll',
    () => {
      const x = window.scrollX || 0;
      const y = window.scrollY || 0;
      if (
        Math.abs(x - lastScroll.x) < SCROLL_THRESHOLD &&
        Math.abs(y - lastScroll.y) < SCROLL_THRESHOLD
      )
        return;
      lastScroll = { x, y };
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(
        () =>
          emit({
            type: 'scroll',
            target: { selectors: [] },
            x,
            y,
            delta_x: x - (window.scrollX || 0),
            delta_y: y - (window.scrollY || 0),
          }),
        120,
      );
    },
    { passive: true },
  );
  historyMethods.forEach((method) => {
    const original = history[method];
    if (typeof original !== 'function') return;
    history[method] = function (...args) {
      const result = original.apply(this, args);
      emitNavigation();
      return result;
    };
  });
  listen(window, 'popstate', emitNavigation);
  listen(window, 'hashchange', emitNavigation);
  window[CLEANUP] = () => {
    window[ACTIVE_MARKER] = false;
    listeners.splice(0).forEach((remove) => {
      try {
        remove();
      } catch (_) {}
    });
    document.querySelectorAll('input,textarea,select,[contenteditable]').forEach(clearInputTimer);
    if (scrollTimer) clearTimeout(scrollTimer);
    delete window[MARKER];
    delete window[CLEANUP];
  };
})();
