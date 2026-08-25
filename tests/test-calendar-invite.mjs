import assert from 'node:assert/strict';
import {
  buildViewingCalendarInvite,
  isFutureViewing,
  parseViewingDateTime
} from '../src/features/properties/calendar-invite.js';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(index, /id="viewingDateDay"[^>]*type="date"/, 'Viewing picker must provide a date control');
assert.match(index, /id="viewingTime"[^>]*disabled/, 'Viewing picker must provide a dedicated time selector');
const appSource = fs.readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
assert.match(appSource, /minute < 60; minute \+= 15/, 'Viewing time selector must use 15-minute intervals');

const property = {
  id: 'property-123',
  title: '2 Bed Flat, Bristol',
  details: 'Meet agent; bring ID\nUse side entrance',
  listingUrl: 'https://example.com/property?id=123',
  viewingDate: '2099-12-01T14:30'
};
const now = new Date('2099-11-01T10:00:00.000Z');
const invite = buildViewingCalendarInvite(property, { now });
const start = invite.content.match(/DTSTART:(\d{8}T\d{6}Z)/)?.[1];
const end = invite.content.match(/DTEND:(\d{8}T\d{6}Z)/)?.[1];

function parseIcsUtc(value) {
  return Date.parse(value.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
    '$1-$2-$3T$4:$5:$6Z'
  ));
}

assert.ok(parseViewingDateTime(property.viewingDate), 'valid local viewing date must parse');
assert.equal(parseViewingDateTime('2099-02-30T10:00'), null, 'invalid calendar dates must be rejected');
assert.equal(isFutureViewing(property.viewingDate, now), true);
assert.equal(isFutureViewing('2020-01-01T10:00', now), false);
assert.equal(invite.filename, '2-bed-flat-bristol-viewing.ics');
assert.match(invite.content, /^BEGIN:VCALENDAR\r\n/);
assert.match(invite.content, /SUMMARY:Property Viewing - 2 Bed Flat\\, Bristol/);
assert.match(invite.content, /DESCRIPTION:Meet agent\\; bring ID\\nUse side entrance\\n\\nProperty listing:/);
assert.match(invite.content, /URL:https:\/\/example\.com\/property\?id=123/);
assert.match(invite.content, /TRIGGER:-PT1H/);
assert.equal(parseIcsUtc(end) - parseIcsUtc(start), 60 * 60 * 1000, 'viewing must last one hour');
assert.match(invite.content, /\r\nEND:VCALENDAR\r\n$/);
assert.throws(
  () => buildViewingCalendarInvite({ viewingDate: '' }),
  /valid viewing date and time/
);

console.log('Property viewing calendar invite checks passed.');
