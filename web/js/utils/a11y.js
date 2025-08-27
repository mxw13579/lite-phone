/**
 * 可访问性基础工具
 */

export function setAria(element, attrs = {}) {
    if (!element) return;
    Object.entries(attrs).forEach(([k, v]) => {
        element.setAttribute(`aria-${k}`, v);
    });
}

export function ensureFocusable(element) {
    if (!element) return;
    const tag = element.tagName?.toLowerCase();
    const naturallyFocusable = ['a', 'button', 'input', 'select', 'textarea'].includes(tag);
    if (!naturallyFocusable && !element.hasAttribute('tabindex')) {
        element.setAttribute('tabindex', '0');
    }
}

export function announceLive(text) {
    let live = document.getElementById('a11y-live-region');
    if (!live) {
        live = document.createElement('div');
        live.id = 'a11y-live-region';
        live.setAttribute('aria-live', 'polite');
        live.setAttribute('aria-atomic', 'true');
        live.style.position = 'absolute';
        live.style.left = '-9999px';
        document.body.appendChild(live);
    }
    live.textContent = text;
}

