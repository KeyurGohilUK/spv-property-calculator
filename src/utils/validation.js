function connectErrorDescription(input, error) {
  if (!input || !error?.id) return;
  const ids = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  ids.add(error.id);
  input.setAttribute('aria-describedby', [...ids].join(' '));
}

export function setFieldValidation(input, error, { invalid, message = '' } = {}) {
  if (!input || !error) return;
  connectErrorDescription(input, error);
  if (message) error.textContent = message;
  const isInvalid = Boolean(invalid);
  if (isInvalid) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  input.setCustomValidity?.(isInvalid ? (message || error.textContent.trim()) : '');
  error.classList.toggle('hidden', !isInvalid);
}

export function clearFieldValidation(input, error) {
  setFieldValidation(input, error, { invalid: false });
}
