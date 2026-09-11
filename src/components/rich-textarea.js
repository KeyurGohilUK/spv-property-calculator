import { buildSafeRichText, normaliseRichTextUrl, sanitiseRichText } from '../utils/rich-text.js';

const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
const COMMANDS = [
  { command: 'bold', label: 'B', title: 'Bold' },
  { command: 'italic', label: 'I', title: 'Italic' },
  { command: 'underline', label: 'U', title: 'Underline' },
  { command: 'insertUnorderedList', label: '• List', title: 'Bulleted list' },
  { command: 'insertOrderedList', label: '1. List', title: 'Numbered list' },
  { command: 'createLink', label: 'Link', title: 'Add link' }
];

function plainLength(editor) {
  return String(editor.innerText || editor.textContent || '').replace(/\n$/, '').length;
}

function sourceValue(textarea) {
  return nativeValue.get.call(textarea);
}

function setNativeValue(textarea, value) {
  nativeValue.set.call(textarea, String(value ?? ''));
}

function renderValue(editor, value) {
  editor.replaceChildren(buildSafeRichText(value));
}

function syncSource(textarea, editor) {
  const safe = sanitiseRichText(editor.innerHTML);
  setNativeValue(textarea, safe);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  return safe;
}

function insertSafeHtml(editor, html) {
  const holder = document.createElement('div');
  holder.appendChild(buildSafeRichText(html));
  document.execCommand('insertHTML', false, holder.innerHTML);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function createToolbar(editor) {
  const toolbar = document.createElement('div');
  toolbar.className = 'rich-textbox-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Text formatting');

  COMMANDS.forEach(({ command, label, title }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rich-textbox-tool';
    button.dataset.command = command;
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      editor.focus();
      if (command === 'createLink') {
        const href = normaliseRichTextUrl(window.prompt('Web address (https://…)', '') || '');
        if (!href) return;
        document.execCommand('createLink', false, href);
      } else {
        document.execCommand(command, false);
      }
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    toolbar.appendChild(button);
  });
  return toolbar;
}

export function enhanceRichTextarea(textarea) {
  if (!textarea || textarea.dataset.richTextboxReady === 'true') return null;
  textarea.dataset.richTextboxReady = 'true';

  const wrapper = document.createElement('div');
  wrapper.className = 'rich-textbox';
  const editor = document.createElement('div');
  editor.className = 'rich-textbox-editor';
  editor.contentEditable = 'true';
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-multiline', 'true');
  editor.dataset.placeholder = textarea.getAttribute('placeholder') || '';
  if (textarea.getAttribute('aria-label')) editor.setAttribute('aria-label', textarea.getAttribute('aria-label'));

  renderValue(editor, sourceValue(textarea));
  wrapper.append(createToolbar(editor), editor);
  textarea.before(wrapper);
  textarea.classList.add('rich-textbox-source');
  textarea.tabIndex = -1;
  textarea.setAttribute('aria-hidden', 'true');

  const ownValue = {
    configurable: true,
    get() { return nativeValue.get.call(textarea); },
    set(value) {
      setNativeValue(textarea, value);
      renderValue(editor, value);
    }
  };
  Object.defineProperty(textarea, 'value', ownValue);

  let lastSafe = sourceValue(textarea);
  editor.addEventListener('input', () => {
    const max = Number(textarea.maxLength) > 0 ? Number(textarea.maxLength) : Infinity;
    if (plainLength(editor) > max) {
      renderValue(editor, lastSafe);
      return;
    }
    lastSafe = syncSource(textarea, editor);
  });

  editor.addEventListener('paste', (event) => {
    event.preventDefault();
    const html = event.clipboardData?.getData('text/html');
    const text = event.clipboardData?.getData('text/plain') || '';
    if (html) insertSafeHtml(editor, html);
    else document.execCommand('insertText', false, text);
  });

  editor.addEventListener('drop', (event) => event.preventDefault());
  textarea.form?.addEventListener('reset', () => window.setTimeout(() => {
    renderValue(editor, sourceValue(textarea));
    lastSafe = sourceValue(textarea);
  }));

  return { textarea, editor, wrapper };
}

export function setupRichTextareas(root = document) {
  return [...root.querySelectorAll('textarea:not([data-plain-text])')].map(enhanceRichTextarea).filter(Boolean);
}

function initialise() {
  setupRichTextareas();
  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      if (node.matches('textarea:not([data-plain-text])')) enhanceRichTextarea(node);
      setupRichTextareas(node);
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
else initialise();
