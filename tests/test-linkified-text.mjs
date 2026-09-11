import assert from 'node:assert/strict';
import { tokenizeLinkifiedText } from '../src/utils/linkified-text.js';

assert.deepEqual(tokenizeLinkifiedText('See https://example.com/path?x=1, then reply.'), [
  { type: 'text', value: 'See ' },
  { type: 'link', value: 'https://example.com/path?x=1', href: 'https://example.com/path?x=1' },
  { type: 'text', value: ',' },
  { type: 'text', value: ' then reply.' }
]);

assert.deepEqual(tokenizeLinkifiedText('Open www.example.com/docs'), [
  { type: 'text', value: 'Open ' },
  { type: 'link', value: 'www.example.com/docs', href: 'https://www.example.com/docs' }
]);

assert.deepEqual(tokenizeLinkifiedText('Use javascript:alert(1) or ftp://example.com'), [
  { type: 'text', value: 'Use javascript:alert(1) or ftp://example.com' }
]);

const multiple = tokenizeLinkifiedText('One https://one.example and two http://two.example/test.');
assert.equal(multiple.filter((token) => token.type === 'link').length, 2);
assert.equal(multiple.at(-1).value, '.');

console.log('Linkified text utility tests passed.');
