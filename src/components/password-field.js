import { getIconSvg } from './shared-icons.js';

const REVEAL_DURATION_MS = 15000;

export function setupPasswordField(input) {
  const wrapper = document.createElement('span');
  wrapper.className = 'password-field';
  const button = document.createElement('button');
  button.className = 'password-visibility';
  button.type = 'button';
  button.setAttribute('aria-controls', input.id);
  const label = input.labels[0].textContent.trim().toLowerCase();
  button.setAttribute('aria-label', `Show ${label}`);
  input.before(wrapper);
  wrapper.append(input, button);

  let timer;
  function setVisible(visible) {
    clearTimeout(timer);
    input.type = visible ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(visible));
    button.title = visible ? `Hide ${label}` : `Show ${label}`;
    button.innerHTML = getIconSvg(visible ? 'eyeOff' : 'eye');
    if (visible) timer = setTimeout(hide, REVEAL_DURATION_MS);
  }

  const hide = () => setVisible(false);
  button.addEventListener('click', () => setVisible(input.type === 'password'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hide();
  });
  window.addEventListener('pagehide', hide);
  hide();
  return hide;
}
