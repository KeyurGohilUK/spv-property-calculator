const LONDON_TIME_ZONE = 'Europe/London';

function dateTimeParts(value) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  return Object.fromEntries(
    formatter.formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
}

export function parseViewingDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day || check.getUTCHours() !== hour
    || check.getUTCMinutes() !== minute) return null;
  return { year, month, day, hour, minute, raw: String(value).trim() };
}

const minuteSerial = ({ year, month, day, hour, minute }) => (
  Date.UTC(year, month - 1, day, hour, minute) / 60000
);

export function findDueViewingReminders(properties, now = new Date()) {
  const current = dateTimeParts(now);
  const currentSerial = minuteSerial(current);
  const currentDay = `${current.year}-${String(current.month).padStart(2, '0')}-${String(current.day).padStart(2, '0')}`;
  const currentMinute = current.hour * 60 + current.minute;
  const reminders = [];

  for (const property of properties || []) {
    const viewing = parseViewingDateTime(property?.data?.viewingDate);
    if (!viewing || !property?.id || !property?.user_id) continue;
    const minutesUntil = minuteSerial(viewing) - currentSerial;
    if (minutesUntil <= 0) continue;

    const viewingDay = `${viewing.year}-${String(viewing.month).padStart(2, '0')}-${String(viewing.day).padStart(2, '0')}`;
    const viewingMinute = viewing.hour * 60 + viewing.minute;
    const base = {
      propertyId: String(property.id),
      userId: String(property.user_id),
      propertyTitle: String(property.data?.title || 'Property').slice(0, 120),
      viewingAtLocal: viewing.raw,
      viewingTime: `${String(viewing.hour).padStart(2, '0')}:${String(viewing.minute).padStart(2, '0')}`
    };

    if (viewingDay === currentDay && currentMinute >= 540 && currentMinute < 550 && viewingMinute > 600) {
      reminders.push({ ...base, reminderType: 'morning' });
    }
    if (minutesUntil <= 60) reminders.push({ ...base, reminderType: 'one_hour' });
  }
  return reminders;
}

export { LONDON_TIME_ZONE };
