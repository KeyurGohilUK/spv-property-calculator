import {
  clearFieldValidation,
  setFieldValidation,
} from '../utils/validation.js';

export function setupAuthField(input, requiredMessage, validate = () => '') {
  const error = document.createElement('span');
  error.id = `${input.id}-error`;
  error.className = 'auth-field-error hidden';
  error.setAttribute('aria-live', 'polite');
  input.closest('.field').append(error);
  const clear = () => clearFieldValidation(input, error);
  input.addEventListener('input', clear);
  return {
    clear,
    check() {
      const message = input.validity.valueMissing
        ? requiredMessage
        : validate(input);
      setFieldValidation(input, error, { invalid: Boolean(message), message });
      return message ? input : null;
    },
  };
}

export function validateAuthFields(...fields) {
  const [firstInvalid] = fields.map((field) => field.check()).filter(Boolean);
  firstInvalid?.focus();
  return !firstInvalid;
}

export function validateAuthEmail(input) {
  return input.validity.typeMismatch ? 'Enter a valid email address.' : '';
}
