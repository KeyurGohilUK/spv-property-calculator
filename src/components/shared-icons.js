/**
 * App icon registry. Keep interface icon geometry here so every feature uses
 * the same named icon and the same accessible, theme-aware SVG wrapper.
 * Charts and illustrations are intentionally rendered by their feature.
 */
const ICONS = Object.freeze({
  company: '<path d="M3 21V4h12v17M15 9h6v12M7 8h4M7 12h4M7 16h4M18 13h.01M18 17h.01M2 21h20"/>',
  home: '<path d="m3 11.5 9-7.5 9 7.5M5.5 10v10h13V10M9.5 20v-6h5v6"/>',
  properties: '<path d="M3 10.5 12 4l9 6.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5zM9 21v-7h6v7M7 10h.01M17 10h.01"/>',
  expenses: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>',
  forecast: '<path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/>',
  tasks: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 12 2 2 4-4"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  shieldCheck: '<path d="m12 22 7-4V6l-7-4-7 4v12l7 4Z"/><path d="m8.5 12 2.3 2.3 4.8-5"/>',
  coins: '<ellipse cx="8" cy="6" rx="5.5" ry="2.5"/><path d="M2.5 6v8c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V6M2.5 10c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5"/><ellipse cx="18" cy="5" rx="4.5" ry="2.5"/><path d="M13.5 5v8c0 1.4 2 2.5 4.5 2.5M13.5 9c0 1.4 2 2.5 4.5 2.5s4.5-1.1 4.5-2.5V5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21v-1a7.5 7.5 0 0 1 15 0v1"/>',
  users: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-1a7 7 0 0 1 14 0v1M16 3.2a4 4 0 0 1 0 7.6M18 14a6 6 0 0 1 4 5.7V21"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  attachment: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  refresh: '<path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.6-2.6L20 9M4 15l2.3 2.6A7 7 0 0 0 17.9 15"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.3 1.7c-1.1 1-1.9 1.4-1.9 3M12 17.2h.01"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 4.5 4.5"/>',
  file: '<path d="M6 3h9l3 3v15H6V3ZM14 3v4h4M9 12h6M9 16h6"/>',
  alert: '<path d="M12 3 2.8 19a1.4 1.4 0 0 0 1.2 2.1h16a1.4 1.4 0 0 0 1.2-2.1L12 3ZM12 9v5m0 3h.01"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  calendarAdd: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M12 13v6M9 16h6"/>',
  externalLink: '<path d="M10 14 21 3M15 3h6v6M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/>',
  duplicate: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  archive: '<path d="M4 7h16M5 7l1 12h12l1-12M9 11h6M7 4h10l1 3H6l1-3Z"/>',
  save: '<path d="M5 4h12l2 2v14H5V4ZM8 4v6h8V4M8 20v-6h8v6"/>',
  sort: '<path d="m8 7 4-4 4 4M12 3v18m-4-4 4 4 4-4"/>',
  wifi: '<path d="M5 9.5a10.2 10.2 0 0 1 14 0M8 13a5.8 5.8 0 0 1 8 0M10.8 16.3a1.8 1.8 0 0 1 2.4 0"/><circle cx="12" cy="18.5" r="1"/>',
  wifiOff: '<path d="m4.5 4.5 15 15M5 9.5a10.2 10.2 0 0 1 10.8-2.1M18.8 10.7l.2.2M8 13a5.8 5.8 0 0 1 3-1.5M14.8 13.8c.4.2.8.5 1.2.8"/><circle cx="12" cy="18.5" r="1"/>',
  statusTodo: '<circle cx="12" cy="12" r="9"/>',
  statusProgress: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  statusResolved: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  statusDone: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-4.5"/>'
});

function escapeAttribute(value) {
  return String(value).replace(/[&"<>']/g, (character) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', "'": '&#39;' })[character]);
}

export function getIconSvg(name, className = '') {
  const paths = ICONS[name];
  if (!paths) return '';
  const classAttribute = className ? ` class="${escapeAttribute(className)}"` : '';
  return `<svg${classAttribute} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export function hydrateSharedIcons(root = document) {
  root.querySelectorAll('[data-shared-icon]').forEach((placeholder) => {
    const svg = getIconSvg(placeholder.dataset.sharedIcon, placeholder.getAttribute('class') || '');
    if (svg) placeholder.outerHTML = svg;
  });
}
