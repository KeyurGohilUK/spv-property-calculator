import { tokenizeLinkifiedText } from './linkified-text.js';

const ALLOWED_TAGS = new Map([
  ['B', 'strong'], ['STRONG', 'strong'], ['I', 'em'], ['EM', 'em'], ['U', 'u'],
  ['S', 's'], ['STRIKE', 's'], ['P', 'p'], ['DIV', 'p'], ['BR', 'br'],
  ['UL', 'ul'], ['OL', 'ol'], ['LI', 'li'], ['BLOCKQUOTE', 'blockquote'], ['A', 'a']
]);
const DROP_CONTENT_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE']);

export function normaliseRichTextUrl(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  const raw = candidate.toLowerCase().startsWith('www.') ? `https://${candidate}` : candidate;
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function appendText(target, value, linkify) {
  if (!linkify) {
    target.appendChild(document.createTextNode(value));
    return;
  }
  tokenizeLinkifiedText(value).forEach((token) => {
    if (token.type !== 'link') {
      target.appendChild(document.createTextNode(token.value));
      return;
    }
    const link = document.createElement('a');
    link.className = 'inline-text-link';
    link.href = token.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = token.value;
    target.appendChild(link);
  });
}

function appendSafeNode(target, node, linkify = true) {
  if (node.nodeType === Node.TEXT_NODE) {
    appendText(target, node.nodeValue || '', linkify);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (DROP_CONTENT_TAGS.has(node.tagName)) return;

  const safeTag = ALLOWED_TAGS.get(node.tagName);
  if (!safeTag) {
    [...node.childNodes].forEach((child) => appendSafeNode(target, child, linkify));
    return;
  }

  const element = document.createElement(safeTag);
  if (safeTag === 'a') {
    const href = normaliseRichTextUrl(node.getAttribute('href'));
    if (!href) {
      [...node.childNodes].forEach((child) => appendSafeNode(target, child, linkify));
      return;
    }
    element.href = href;
    element.target = '_blank';
    element.rel = 'noopener noreferrer';
    element.className = 'inline-text-link';
  }
  [...node.childNodes].forEach((child) => appendSafeNode(element, child, safeTag !== 'a'));
  target.appendChild(element);
}

export function buildSafeRichText(value) {
  const fragment = document.createDocumentFragment();
  const parsed = new DOMParser().parseFromString(String(value ?? ''), 'text/html');
  [...parsed.body.childNodes].forEach((node) => appendSafeNode(fragment, node));
  return fragment;
}

export function appendSafeRichText(container, value) {
  if (!container) return;
  container.replaceChildren(buildSafeRichText(value));
  container.classList.add('rich-text-content');
}

export function sanitiseRichText(value) {
  const holder = document.createElement('div');
  holder.appendChild(buildSafeRichText(value));
  return holder.innerHTML;
}
