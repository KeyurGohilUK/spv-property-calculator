import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  findDueViewingReminders,
  parseViewingDateTime
} from '../supabase/functions/viewing-reminders/schedule.js';

const property = (viewingDate, id = 'property-1') => ({
  id,
  user_id: '11111111-1111-1111-1111-111111111111',
  data: { title: 'Bristol Flat', viewingDate }
});

assert.equal(parseViewingDateTime('2026-02-30T10:00'), null, 'Invalid viewing dates must be rejected');

const morning = findDueViewingReminders(
  [property('2026-08-27T14:30')],
  new Date('2026-08-27T08:00:00Z')
);
assert.deepEqual(morning.map((item) => item.reminderType), ['morning']);
assert.equal(morning[0].viewingTime, '14:30');

const finalReminder = findDueViewingReminders(
  [property('2026-08-27T14:30')],
  new Date('2026-08-27T12:30:00Z')
);
assert.deepEqual(finalReminder.map((item) => item.reminderType), ['one_hour']);

const earlyViewing = findDueViewingReminders(
  [property('2026-08-27T09:45')],
  new Date('2026-08-27T08:00:00Z')
);
assert.deepEqual(earlyViewing.map((item) => item.reminderType), ['one_hour'], 'Early viewings must not receive two reminders');

assert.deepEqual(findDueViewingReminders(
  [property('2026-08-27T14:30')],
  new Date('2026-08-27T07:55:00Z')
), [], 'Morning reminders must not send before 09:00 Europe/London');

assert.deepEqual(findDueViewingReminders(
  [property('2026-08-27T14:30')],
  new Date('2026-08-27T13:31:00Z')
), [], 'Past viewings must never produce reminders');

const edgeFunction = fs.readFileSync(new URL('../supabase/functions/viewing-reminders/index.ts', import.meta.url), 'utf8');
assert.match(edgeFunction, /x-viewing-reminder-secret[\s\S]*VIEWING_REMINDER_CRON_SECRET/, 'Cron authentication is missing');
assert.match(edgeFunction, /viewing_reminder_deliveries[\s\S]*code === '23505'/, 'Duplicate reminder claims must be ignored');
assert.match(edgeFunction, /\.eq\('user_id', reminder\.userId\)/, 'Reminders must target the property owner');
assert.match(edgeFunction, /statusCode === 404 \|\| statusCode === 410/, 'Stale subscriptions must be removed');

console.log('Viewing reminder scheduling and delivery checks passed.');
