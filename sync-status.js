export function renderSyncStatus(element, message, state = '') {
  if (!element) return;
  element.textContent = String(message || '');
  element.classList.toggle('error', state === 'error');
  element.classList.toggle('synced', state === 'synced');
}
