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

function plainText(editor) {
  return String(editor.innerText || editor.textContent || '').replace(/\n$/, '');
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

function safeEditorValue(editor) {
  return plainText(editor).trim() ? sanitiseRichText(editor.innerHTML) : '';
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

function editorLabel(textarea) {
  const explicit = textarea.getAttribute('aria-label');
  if (explicit) return explicit;
  const fieldLabel = textarea.closest('label')?.querySelector(':scope > span')?.textContent || '';
  return fieldLabel.replace(/\s+/g, ' ').replace(/optional/gi, '').trim() || 'Rich text';
}

export function enhanceRichTextarea(textarea) {
  if (!textarea || textarea.dataset.richTextboxReady === 'true') return null;
  textarea.dataset.richTextboxReady = 'true';

  const wrapper = document.createElement('div');
  wrapper.className = 'rich-textbox';
  if (textarea.id) wrapper.dataset.richTextFor = textarea.id;

  const editor = document.createElement('div');
  editor.className = 'rich-textbox-editor';
  editor.contentEditable = 'true';
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-multiline', 'true');
  editor.setAttribute('aria-label', editorLabel(textarea));
  editor.dataset.placeholder = textarea.getAttribute('placeholder') || '';
  if (textarea.id) editor.dataset.richTextFor = textarea.id;

  renderValue(editor, sourceValue(textarea));
  wrapper.append(createToolbar(editor), editor);
  textarea.before(wrapper);
  textarea.classList.add('rich-textbox-source');
  textarea.tabIndex = -1;
  textarea.setAttribute('aria-hidden', 'true');

  Object.defineProperty(textarea, 'value', {
    configurable: true,
    get() { return nativeValue.get.call(textarea); },
    set(value) {
      setNativeValue(textarea, value);
      renderValue(editor, value);
    }
  });

  let lastSafe = sourceValue(textarea);
  let syncingFromEditor = false;

  editor.addEventListener('input', () => {
    const max = Number(textarea.maxLength) > 0 ? Number(textarea.maxLength) : Infinity;
    if (plainText(editor).length > max) {
      renderValue(editor, lastSafe);
      return;
    }
    lastSafe = safeEditorValue(editor);
    setNativeValue(textarea, lastSafe);
    syncingFromEditor = true;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    syncingFromEditor = false;
  });

  textarea.addEventListener('input', () => {
    if (syncingFromEditor) return;
    lastSafe = sourceValue(textarea);
    renderValue(editor, lastSafe);
  });

  editor.addEventListener('paste', (event) => {
    event.preventDefault();
    const html = event.clipboardData?.getData('text/html');
    const text = event.clipboardData?.getData('text/plain') || '';
    if (html) insertSafeHtml(editor, html);
    else {
      document.execCommand('insertText', false, text);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
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
