const VIEWING_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function parseViewingDateTime(value) {
  const match = VIEWING_PATTERN.exec(String(value || '').trim());
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], 0, 0);
  if (
    date.getFullYear() !== parts[0]
    || date.getMonth() !== parts[1] - 1
    || date.getDate() !== parts[2]
    || date.getHours() !== parts[3]
    || date.getMinutes() !== parts[4]
  ) return null;
  return date;
}

export function isFutureViewing(value, now = new Date()) {
  const viewing = parseViewingDateTime(value);
  return Boolean(viewing && viewing.getTime() > now.getTime());
}

function formatIcsUtc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function safeWebUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function safeFilePart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'property';
}

function foldIcsLine(line) {
  const chunks = [];
  let remaining = line;
  while (remaining.length > 73) {
    chunks.push(remaining.slice(0, 73));
    remaining = ' ' + remaining.slice(73);
  }
  chunks.push(remaining);
  return chunks;
}

export function buildViewingCalendarInvite(property, {
  now = new Date(),
  durationMinutes = 60
} = {}) {
  const start = parseViewingDateTime(property?.viewingDate);
  if (!start) throw new Error('Choose a valid viewing date and time first.');

  const title = String(property?.title || '').trim() || 'Property';
  const end = new Date(start.getTime() + Math.max(1, Number(durationMinutes) || 60) * 60_000);
  const listingUrl = safeWebUrl(property?.listingUrl);
  const descriptionParts = [String(property?.details || '').trim()];
  if (listingUrl) descriptionParts.push(`Property listing: ${listingUrl}`);
  const description = descriptionParts.filter(Boolean).join('\n\n')
    || 'Property viewing created by SPV Property Calculator.';
  const uidSeed = safeFilePart(property?.id || title);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SPV Property Calculator//Property Viewing//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uidSeed}-${formatIcsUtc(start)}@spv-property-calculator`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART:${formatIcsUtc(start)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(`Property Viewing - ${title}`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`
  ];
  if (listingUrl) lines.push(`URL:${listingUrl}`);
  lines.push(
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Property viewing reminder - ${title}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  );

  return {
    content: lines.flatMap(foldIcsLine).join('\r\n') + '\r\n',
    filename: `${safeFilePart(title)}-viewing.ics`
  };
}
