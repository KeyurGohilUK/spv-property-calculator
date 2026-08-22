const fs = require('fs');

function replaceOnce(text, oldValue, newValue, label) {
  if (!text.includes(oldValue)) throw new Error(`Could not find ${label}`);
  return text.replace(oldValue, newValue);
}

let html = fs.readFileSync('index.html', 'utf8');
html = replaceOnce(html,
`              <label class="field viewing-date-field">\n                <span>Viewing Date <em>optional</em></span>\n                <div class="viewing-date-input">\n                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4"></path><path d="M8 3v4"></path><path d="M3 10h18"></path></svg>\n                  <input id="viewingDate" name="viewingDate" type="date" autocomplete="off">\n                </div>\n              </label>`,
`              <label class="field viewing-date-field">\n                <span>Viewing Date &amp; Time <em>optional</em></span>\n                <div class="viewing-date-input">\n                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4"></path><path d="M8 3v4"></path><path d="M3 10h18"></path><circle cx="12" cy="15" r="3"></circle><path d="M12 13.5V15l1 1"></path></svg>\n                  <input id="viewingDate" name="viewingDate" type="datetime-local" step="60" autocomplete="off">\n                </div>\n              </label>`, 'viewing datetime field');
fs.writeFileSync('index.html', html);

let app = fs.readFileSync('app.js', 'utf8');
app = replaceOnce(app,
`const APP_VERSION = '1.10.1';`,
`const APP_VERSION = '1.10.2';`, 'app version');
app = replaceOnce(app,
`function formatViewingDate(value) {\n  const raw = String(value || '').trim();\n  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(raw);\n  if (!match) return '';\n  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));\n  if (Number.isNaN(date.getTime())) return '';\n  return dateFormat.format(date);\n}`,
`function formatViewingDate(value) {\n  const raw = String(value || '').trim();\n  const match = /^(\\d{4})-(\\d{2})-(\\d{2})(?:T(\\d{2}):(\\d{2}))?$/.exec(raw);\n  if (!match) return '';\n  const date = new Date(\n    Number(match[1]),\n    Number(match[2]) - 1,\n    Number(match[3]),\n    Number(match[4] || 0),\n    Number(match[5] || 0)\n  );\n  if (Number.isNaN(date.getTime())) return '';\n  const dateLabel = dateFormat.format(date);\n  if (!match[4] || !match[5]) return dateLabel;\n  const timeLabel = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);\n  return \\`${dateLabel} · ${timeLabel}\\`;\n}\n\nfunction normalizeViewingDateTime(value) {\n  const raw = String(value || '').trim();\n  if (!raw) return '';\n  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)) return \\`${raw}T00:00\\`;\n  const match = /^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2})/.exec(raw);\n  return match ? match[1] : '';\n}`.replace(/\\`/g,'`'), 'formatViewingDate');
app = replaceOnce(app,
`  $('viewingDate').value = property.viewingDate || '';`,
`  $('viewingDate').value = normalizeViewingDateTime(property.viewingDate || '');`, 'load viewing datetime');
fs.writeFileSync('app.js', app);

let release = JSON.parse(fs.readFileSync('release.json', 'utf8'));
release.version = '1.10.2';
release.notes = [
  'Single Viewing Date & Time field with hour and minute',
  'Viewing time displayed on property cards',
  'Advanced forecast return and risk metrics'
];
fs.writeFileSync('release.json', JSON.stringify(release, null, 2) + '\n');

let sw = fs.readFileSync('service-worker.js', 'utf8');
sw = sw.replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'spv-property-calculator-v1.10.2-viewing-datetime';");
fs.writeFileSync('service-worker.js', sw);
