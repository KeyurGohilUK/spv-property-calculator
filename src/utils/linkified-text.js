const URL_PATTERN = /(https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,!?;:]+$/;

function normaliseWebUrl(value) {
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

export function tokenizeLinkifiedText(value) {
  const text = String(value ?? '');
  const tokens = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const rawMatch = match[0];
    const start = match.index ?? 0;
    if (start > cursor) tokens.push({ type: 'text', value: text.slice(cursor, start) });

    const trailing = rawMatch.match(TRAILING_PUNCTUATION)?.[0] || '';
    const candidate = trailing ? rawMatch.slice(0, -trailing.length) : rawMatch;
    const href = normaliseWebUrl(candidate);

    if (href) tokens.push({ type: 'link', value: candidate, href });
    else tokens.push({ type: 'text', value: candidate });
    if (trailing) tokens.push({ type: 'text', value: trailing });

    cursor = start + rawMatch.length;
  }

  if (cursor < text.length) tokens.push({ type: 'text', value: text.slice(cursor) });
  if (!tokens.length && text) tokens.push({ type: 'text', value: text });
  return tokens;
}

export function appendLinkifiedText(container, value) {
  if (!container) return;
  container.replaceChildren();

  tokenizeLinkifiedText(value).forEach((token) => {
    if (token.type === 'link') {
      const link = document.createElement('a');
      link.className = 'inline-text-link';
      link.href = token.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = token.value;
      container.appendChild(link);
      return;
    }
    container.appendChild(document.createTextNode(token.value));
  });
}
