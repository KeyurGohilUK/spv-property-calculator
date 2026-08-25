const controllers = new WeakMap();

function visible(element) {
  return Boolean(element && !element.hidden && !element.disabled && element.getClientRects().length);
}

function ensureLabel(dialog) {
  if (dialog.hasAttribute('aria-label') || dialog.hasAttribute('aria-labelledby')) return;
  const heading = dialog.querySelector('h1, h2, h3, h4');
  if (!heading) return;
  if (!heading.id) heading.id = `${dialog.id || 'appDialog'}Title`;
  dialog.setAttribute('aria-labelledby', heading.id);
}

export function setupDialog(dialog, { closeButtons = [], initialFocus, label } = {}) {
  if (!dialog) return { open() {}, close() {} };
  if (controllers.has(dialog)) return controllers.get(dialog);
  if (label) dialog.setAttribute('aria-label', label);
  ensureLabel(dialog);
  let returnFocus = null;

  const focusFirst = () => {
    const requested = typeof initialFocus === 'function' ? initialFocus() : initialFocus;
    const target = typeof requested === 'string' ? dialog.querySelector(requested) : requested;
    const fallback = [...dialog.querySelectorAll('[autofocus], input, select, textarea, button, a[href]')].find(visible);
    (visible(target) ? target : fallback)?.focus();
  };
  const open = (trigger = document.activeElement) => {
    returnFocus = trigger instanceof HTMLElement ? trigger : document.activeElement;
    if (!dialog.open) dialog.showModal();
    window.setTimeout(focusFirst, 0);
  };
  const close = () => { if (dialog.open) dialog.close(); };
  const controller = { open, close, dialog };
  controllers.set(dialog, controller);

  closeButtons.forEach((button) => button?.addEventListener('click', close));
  dialog.addEventListener('click', (event) => {
    const bounds = dialog.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (outside) close();
  });
  dialog.addEventListener('close', () => {
    if (returnFocus?.isConnected && visible(returnFocus)) returnFocus.focus();
    returnFocus = null;
  });
  return controller;
}
